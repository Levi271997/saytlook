import type { DuplicateOptions, ElementNode, Finding, PageSnapshot } from './types.js';
import { DEFAULT_OPTIONS } from './types.js';
import {
  childrenOf,
  fingerprintText,
  hasOwnText,
  hashString,
  indexElements,
  inIgnoredLandmark,
  isVisible,
  normalizeText,
  structureSignature,
  subtreeText,
  type ElementIndex,
} from './utils.js';

/**
 * Duplicate copy and duplicate section detection (feature 2).
 *
 * Scope is the single rendered page - we never crawl. Boilerplate that is
 * *meant* to repeat (nav, header, footer, "Read more") is filtered out via
 * `options.ignoreLandmarks` and `options.ignoreText`.
 */
export function analyzeDuplicates(
  snapshot: PageSnapshot,
  options: DuplicateOptions = DEFAULT_OPTIONS.duplicates,
): Finding[] {
  const index = indexElements(snapshot.elements);
  return [...findDuplicateText(snapshot, index, options), ...findDuplicateSections(snapshot, index, options)];
}

/** Identical non-trivial strings appearing more than once. */
export function findDuplicateText(
  snapshot: PageSnapshot,
  index: ElementIndex,
  options: DuplicateOptions = DEFAULT_OPTIONS.duplicates,
): Finding[] {
  const buckets = new Map<string, { text: string; elements: ElementNode[] }>();

  for (const el of snapshot.elements) {
    if (!hasOwnText(el) || !isVisible(el)) continue;
    if (inIgnoredLandmark(el, options.ignoreLandmarks)) continue;

    const text = normalizeText(el.text);
    if (text.length <= options.minTextLength) continue;
    if (isIgnoredText(text, options.ignoreText)) continue;

    const key = fingerprintText(text);
    if (key.length === 0) continue;

    const bucket = buckets.get(key);
    if (bucket) bucket.elements.push(el);
    else buckets.set(key, { text, elements: [el] });
  }

  const findings: Finding[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.elements.length < 2) continue;
    findings.push({
      id: `duplicate-text-${hashString(key)}`,
      category: 'duplicate-text',
      severity: 'warning',
      message: `Text repeated ${bucket.elements.length} times: "${truncate(bucket.text, 80)}"`,
      details: `Appears in <${bucket.elements.map((el) => el.tag).join('>, <')}>.`,
      elementIds: bucket.elements.map((el) => el.id),
    });
  }

  return findings.sort((a, b) => b.elementIds.length - a.elementIds.length);
}

/**
 * Repeated large subtrees. We hash normalized subtree text together with a
 * tag-structure signature, so two sections collide only when both the copy and
 * the shape match. Nested duplicates report at the outermost element only.
 */
export function findDuplicateSections(
  snapshot: PageSnapshot,
  index: ElementIndex,
  options: DuplicateOptions = DEFAULT_OPTIONS.duplicates,
): Finding[] {
  const buckets = new Map<string, ElementNode[]>();

  for (const el of snapshot.elements) {
    if (!isVisible(el)) continue;
    if (inIgnoredLandmark(el, options.ignoreLandmarks)) continue;

    const text = subtreeText(index, el);
    const childCount = childrenOf(index, el.id).length;
    const substantial = text.length >= options.minSectionTextLength || childCount >= options.minSectionChildren;
    if (!substantial) continue;
    if (text.length === 0) continue; // shape-only repeats (icon grids) are not defects

    const key = `${structureSignature(index, el)}::${fingerprintText(text)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(el);
    else buckets.set(key, [el]);
  }

  // Document order puts ancestors before descendants, so the first group we
  // accept for a region is always the outermost one.
  const groups = [...buckets.entries()]
    .filter(([, els]) => els.length >= 2)
    .sort((a, b) => firstOrder(index, a[1]) - firstOrder(index, b[1]));

  const reported = new Set<string>();
  const findings: Finding[] = [];

  for (const [key, els] of groups) {
    if (els.some((el) => hasReportedAncestor(index, el, reported))) continue;
    for (const el of els) reported.add(el.id);

    const first = els[0];
    if (!first) continue;
    const text = subtreeText(index, first);
    findings.push({
      id: `duplicate-section-${hashString(key)}`,
      category: 'duplicate-section',
      severity: 'warning',
      message: `<${first.tag}> block repeated ${els.length} times (${text.length} chars, ${
        childrenOf(index, first.id).length
      } direct children).`,
      details: `Starts with "${truncate(text, 90)}"`,
      elementIds: els.map((el) => el.id),
    });
  }

  return findings;
}

function isIgnoredText(text: string, ignoreText: string[]): boolean {
  const lower = text.toLowerCase();
  return ignoreText.some((needle) => needle.length > 0 && lower.includes(needle.toLowerCase()));
}

function firstOrder(index: ElementIndex, els: ElementNode[]): number {
  return Math.min(...els.map((el) => index.orderOf.get(el.id) ?? 0));
}

function hasReportedAncestor(index: ElementIndex, el: ElementNode, reported: Set<string>): boolean {
  let current = el.parentId;
  const seen = new Set<string>();
  while (current !== undefined && !seen.has(current)) {
    if (reported.has(current)) return true;
    seen.add(current);
    current = index.byId.get(current)?.parentId;
  }
  return false;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
