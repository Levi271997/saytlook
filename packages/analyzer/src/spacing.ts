import type { Box, ElementNode, Finding, PageSnapshot, SpacingOptions } from './types.js';
import { DEFAULT_OPTIONS } from './types.js';
import {
  boxBottom,
  boxRight,
  childrenOf,
  formatPx,
  groupBy,
  hashString,
  horizontalOverlapRatio,
  indexElements,
  isVisible,
  round,
  verticalOverlapRatio,
  type ElementIndex,
} from './utils.js';

export type GapOrientation = 'vertical' | 'horizontal';

export interface SpacingGap {
  id: string;
  fromId: string;
  toId: string;
  orientation: GapOrientation;
  /** Gap in full-page pixels. */
  distance: number;
  /** Pre-formatted for the dimension label, e.g. "24px". */
  label: string;
  /** Dimension line endpoints, in full-page coordinates. */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** Where to anchor the label, in full-page coordinates. */
  labelAt: { x: number; y: number };
}

export interface BoxModel {
  elementId: string;
  /** Border box, i.e. the element's own bounding rect. */
  borderBox: Box;
  /** Border box grown by the computed margins. */
  marginBox: Box;
  /** Border box shrunk by the computed padding. */
  contentBox: Box;
  margins: { top: number; right: number; bottom: number; left: number };
  paddings: { top: number; right: number; bottom: number; left: number };
}

/** Boxes shorter than this are layout noise, not spacing worth labelling. */
const MIN_BLOCK_HEIGHT = 4;

/**
 * Spacing inspector geometry (feature 4).
 *
 * Everything here is derived from snapshot boxes, so it stays pure and the
 * same code can later run against a live DOM.
 */
export function analyzeSpacing(
  snapshot: PageSnapshot,
  options: SpacingOptions = DEFAULT_OPTIONS.spacing,
): Finding[] {
  if (!options.reportRhythm) return [];

  const gaps = computeVerticalRhythm(snapshot, options);
  const offGrid = gaps.filter(
    (gap) => gap.distance >= options.minReportedGap && !isMultipleOf(gap.distance, options.baseUnit),
  );
  if (offGrid.length === 0) return [];

  const byDistance = groupBy(offGrid, (gap) => round(gap.distance, 0));

  return [...byDistance.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([distance, group]) => ({
      id: `spacing-off-grid-${hashString(String(distance))}`,
      category: 'spacing' as const,
      severity: 'info' as const,
      message: `${group.length} gap${group.length === 1 ? '' : 's'} of ${formatPx(
        distance,
      )} do not align to the ${options.baseUnit}px base unit.`,
      elementIds: group.flatMap((gap) => [gap.fromId, gap.toId]),
    }));
}

/** Every adjacent-sibling gap on the page, both orientations. */
export function computeSiblingGaps(
  snapshot: PageSnapshot,
  options: SpacingOptions = DEFAULT_OPTIONS.spacing,
  index: ElementIndex = indexElements(snapshot.elements),
): SpacingGap[] {
  const gaps: SpacingGap[] = [];
  const parents = new Set<string>();

  for (const el of snapshot.elements) {
    if (el.parentId !== undefined) parents.add(el.parentId);
  }

  for (const parentId of parents) {
    const siblings = childrenOf(index, parentId).filter(isLayoutBlock);
    if (siblings.length < 2) continue;
    gaps.push(...gapsAmong(siblings, options));
  }

  return gaps;
}

/**
 * Gaps down the page's main content column - what the "vertical rhythm"
 * toggle draws.
 */
export function computeVerticalRhythm(
  snapshot: PageSnapshot,
  options: SpacingOptions = DEFAULT_OPTIONS.spacing,
  index: ElementIndex = indexElements(snapshot.elements),
): SpacingGap[] {
  const column = findMainColumn(snapshot, index);
  if (!column) return [];

  const blocks = childrenOf(index, column.id).filter(isLayoutBlock);
  return gapsAmong(blocks, options).filter((gap) => gap.orientation === 'vertical');
}

/**
 * The container the page's sections stack inside. Prefers an explicit main
 * landmark, otherwise the widest element with the most substantial block
 * children.
 */
export function findMainColumn(
  snapshot: PageSnapshot,
  index: ElementIndex = indexElements(snapshot.elements),
): ElementNode | undefined {
  const pageWidth = snapshot.pageSize.width;

  const substantialChildren = (el: ElementNode): number =>
    childrenOf(index, el.id).filter((c) => isLayoutBlock(c) && c.box.height >= 20).length;

  const explicitMain = snapshot.elements.find((el) => el.tag === 'main' || el.role === 'main');
  if (explicitMain && substantialChildren(explicitMain) >= 2) return explicitMain;

  let best: ElementNode | undefined;
  let bestScore = 0;

  for (const el of snapshot.elements) {
    if (!isLayoutBlock(el)) continue;
    if (el.box.width < pageWidth * 0.4) continue;

    const score = substantialChildren(el);
    if (score < 3) continue;

    // Higher child count wins; on a tie prefer the narrower, more specific wrapper.
    if (score > bestScore || (score === bestScore && best !== undefined && el.box.width < best.box.width)) {
      best = el;
      bestScore = score;
    }
  }

  return best;
}

/** Margin/padding rectangles for the hover box-model readout. */
export function boxModelOf(element: ElementNode): BoxModel {
  const { box, styles } = element;
  const margins = {
    top: styles.marginTop,
    right: styles.marginRight,
    bottom: styles.marginBottom,
    left: styles.marginLeft,
  };
  const paddings = {
    top: styles.paddingTop,
    right: styles.paddingRight,
    bottom: styles.paddingBottom,
    left: styles.paddingLeft,
  };

  return {
    elementId: element.id,
    borderBox: { ...box },
    marginBox: {
      x: box.x - margins.left,
      y: box.y - margins.top,
      width: box.width + margins.left + margins.right,
      height: box.height + margins.top + margins.bottom,
    },
    contentBox: {
      x: box.x + paddings.left,
      y: box.y + paddings.top,
      width: Math.max(0, box.width - paddings.left - paddings.right),
      height: Math.max(0, box.height - paddings.top - paddings.bottom),
    },
    margins,
    paddings,
  };
}

// ---------------------------------------------------------------------------

function isLayoutBlock(el: ElementNode): boolean {
  if (!isVisible(el)) return false;
  if (el.box.height < MIN_BLOCK_HEIGHT) return false;
  if (el.display === 'inline') return false;
  return true;
}

/**
 * Adjacent-pair gaps within one set of siblings. Runs a column pass (sorted by
 * y) and a row pass (sorted by x); a pair realistically qualifies for only one.
 */
function gapsAmong(siblings: ElementNode[], options: SpacingOptions): SpacingGap[] {
  const gaps: SpacingGap[] = [];

  const byY = [...siblings].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  for (let i = 0; i < byY.length - 1; i++) {
    const a = byY[i];
    const b = byY[i + 1];
    if (!a || !b) continue;
    if (horizontalOverlapRatio(a.box, b.box) < options.minOverlapRatio) continue;
    const distance = b.box.y - boxBottom(a.box);
    if (distance < -0.5) continue; // overlapping, not a gap
    gaps.push(verticalGap(a, b, Math.max(0, distance)));
  }

  const byX = [...siblings].sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
  for (let i = 0; i < byX.length - 1; i++) {
    const a = byX[i];
    const b = byX[i + 1];
    if (!a || !b) continue;
    if (verticalOverlapRatio(a.box, b.box) < options.minOverlapRatio) continue;
    const distance = b.box.x - boxRight(a.box);
    if (distance < -0.5) continue;
    gaps.push(horizontalGap(a, b, Math.max(0, distance)));
  }

  return gaps;
}

function verticalGap(a: ElementNode, b: ElementNode, distance: number): SpacingGap {
  // Centre the dimension line in the horizontal band the two boxes share.
  const left = Math.max(a.box.x, b.box.x);
  const right = Math.min(boxRight(a.box), boxRight(b.box));
  const x = round((left + right) / 2, 1);
  const y1 = round(boxBottom(a.box), 1);
  const y2 = round(y1 + distance, 1);

  return {
    id: `gap-v-${a.id}-${b.id}`,
    fromId: a.id,
    toId: b.id,
    orientation: 'vertical',
    distance: round(distance, 1),
    label: formatPx(distance),
    line: { x1: x, y1, x2: x, y2 },
    labelAt: { x, y: round((y1 + y2) / 2, 1) },
  };
}

function horizontalGap(a: ElementNode, b: ElementNode, distance: number): SpacingGap {
  const top = Math.max(a.box.y, b.box.y);
  const bottom = Math.min(boxBottom(a.box), boxBottom(b.box));
  const y = round((top + bottom) / 2, 1);
  const x1 = round(boxRight(a.box), 1);
  const x2 = round(x1 + distance, 1);

  return {
    id: `gap-h-${a.id}-${b.id}`,
    fromId: a.id,
    toId: b.id,
    orientation: 'horizontal',
    distance: round(distance, 1),
    label: formatPx(distance),
    line: { x1, y1: y, x2, y2: y },
    labelAt: { x: round((x1 + x2) / 2, 1), y },
  };
}

/** Sub-pixel layout values make an exact modulo check too strict. */
export function isMultipleOf(value: number, unit: number, tolerance = 0.5): boolean {
  if (unit <= 0) return true;
  const remainder = Math.abs(value % unit);
  return remainder <= tolerance || Math.abs(remainder - unit) <= tolerance;
}
