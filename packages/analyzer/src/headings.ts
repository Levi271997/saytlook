import type { Finding, HeadingNode, PageSnapshot } from './types.js';
import { normalizeText } from './utils.js';

export interface HeadingOutlineNode {
  heading: HeadingNode;
  children: HeadingOutlineNode[];
}

/** Badge colours by level: H1 red through H6 grey. Shared so panel and badge agree. */
export const HEADING_LEVEL_COLORS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#22c55e',
  5: '#3b82f6',
  6: '#94a3b8',
};

export function headingColor(level: number): string {
  return HEADING_LEVEL_COLORS[level as 1 | 2 | 3 | 4 | 5 | 6] ?? '#94a3b8';
}

/**
 * Nest headings by level into an outline tree for the side panel.
 * Headings are already in document order in the snapshot.
 */
export function buildHeadingOutline(headings: HeadingNode[]): HeadingOutlineNode[] {
  const roots: HeadingOutlineNode[] = [];
  const stack: HeadingOutlineNode[] = [];

  for (const heading of headings) {
    const node: HeadingOutlineNode = { heading, children: [] };

    // Pop until the top of the stack is a heading shallower than this one.
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top && top.heading.level < heading.level) break;
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);

    stack.push(node);
  }

  return roots;
}

/** Heading structure warnings (feature 3). */
export function analyzeHeadings(snapshot: PageSnapshot): Finding[] {
  const headings = snapshot.headings;
  const findings: Finding[] = [];

  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0 && headings.length > 0) {
    findings.push({
      id: 'heading-no-h1',
      category: 'heading',
      severity: 'warning',
      message: 'Page has no H1.',
      details: 'Every page should have exactly one top-level heading describing its content.',
      elementIds: [],
    });
  } else if (h1s.length > 1) {
    findings.push({
      id: 'heading-multiple-h1',
      category: 'heading',
      severity: 'warning',
      message: `Page has ${h1s.length} H1 headings (expected 1).`,
      details: h1s.map((h) => `"${truncate(h.text)}"`).join(', '),
      elementIds: h1s.map((h) => h.id),
    });
  }

  const empties = headings.filter((h) => normalizeText(h.text).length === 0);
  if (empties.length > 0) {
    findings.push({
      id: 'heading-empty',
      category: 'heading',
      severity: 'error',
      message: `${empties.length} heading${empties.length === 1 ? ' has' : 's have'} no text content.`,
      details: `Empty: ${empties.map((h) => `H${h.level}`).join(', ')}.`,
      elementIds: empties.map((h) => h.id),
    });
  }

  findings.push(...findSkippedLevels(headings));

  const first = headings[0];
  if (first && first.level !== 1 && h1s.length > 0) {
    findings.push({
      id: 'heading-starts-below-h1',
      category: 'heading',
      severity: 'info',
      message: `Outline starts at H${first.level}, not H1.`,
      details: `First heading: "${truncate(first.text)}"`,
      elementIds: [first.id],
    });
  }

  return findings;
}

/** A jump of more than one level going deeper, e.g. H2 -> H4. */
function findSkippedLevels(headings: HeadingNode[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 1; i < headings.length; i++) {
    const previous = headings[i - 1];
    const current = headings[i];
    if (!previous || !current) continue;
    if (current.level - previous.level <= 1) continue;

    findings.push({
      id: `heading-skipped-level-${current.id}`,
      category: 'heading',
      severity: 'warning',
      message: `Skipped heading level: H${previous.level} is followed by H${current.level}.`,
      details: `"${truncate(previous.text)}" -> "${truncate(current.text)}"`,
      elementIds: [previous.id, current.id],
    });
  }

  return findings;
}

function truncate(text: string, max = 50): string {
  const normalized = normalizeText(text);
  if (normalized.length === 0) return '(empty)';
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}
