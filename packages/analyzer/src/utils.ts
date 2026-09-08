import type { Box, ElementNode, Landmark, PageSnapshot } from './types.js';

/** Collapse all whitespace runs to a single space and trim. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Lower-cased, punctuation-insensitive form used for duplicate matching. */
export function fingerprintText(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}'"\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first family in a `font-family` list, unquoted and lower-cased.
 * `"Inter", Helvetica, sans-serif` -> `inter`
 */
export function primaryFontFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? fontFamily;
  return first.trim().replace(/^["']|["']$/g, '').toLowerCase();
}

/** Round to `places` decimals; keeps float noise out of grouping keys and labels. */
export function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** `24px`, `23.5px` - a label a developer can read at a glance. */
export function formatPx(value: number): string {
  const r = round(value, 1);
  return `${Number.isInteger(r) ? r : r.toFixed(1)}px`;
}

export function isHeadingTag(tag: string): boolean {
  return /^h[1-6]$/.test(tag.toLowerCase());
}

/** Element has its own visible text worth analyzing. */
export function hasOwnText(el: ElementNode): el is ElementNode & { text: string } {
  return typeof el.text === 'string' && normalizeText(el.text).length > 0;
}

export function isVisible(el: ElementNode): boolean {
  return el.box.width > 0 && el.box.height > 0;
}

export function inIgnoredLandmark(el: ElementNode, ignored: Landmark[]): boolean {
  return el.landmark !== undefined && ignored.includes(el.landmark);
}

export function boxArea(box: Box): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

export function boxBottom(box: Box): number {
  return box.y + box.height;
}

export function boxRight(box: Box): number {
  return box.x + box.width;
}

/** Fraction of the shorter span that the two horizontal ranges share. */
export function horizontalOverlapRatio(a: Box, b: Box): number {
  const overlap = Math.min(boxRight(a), boxRight(b)) - Math.max(a.x, b.x);
  const shorter = Math.min(a.width, b.width);
  if (shorter <= 0) return 0;
  return Math.max(0, overlap) / shorter;
}

/** Fraction of the shorter span that the two vertical ranges share. */
export function verticalOverlapRatio(a: Box, b: Box): number {
  const overlap = Math.min(boxBottom(a), boxBottom(b)) - Math.max(a.y, b.y);
  const shorter = Math.min(a.height, b.height);
  if (shorter <= 0) return 0;
  return Math.max(0, overlap) / shorter;
}

// ---------------------------------------------------------------------------
// Tree helpers - the snapshot is a flat list, these rebuild the hierarchy.
// ---------------------------------------------------------------------------

export interface ElementIndex {
  byId: Map<string, ElementNode>;
  childrenOf: Map<string, ElementNode[]>;
  roots: ElementNode[];
  /** Document order position, used to keep derived text in reading order. */
  orderOf: Map<string, number>;
}

export function indexElements(elements: ElementNode[]): ElementIndex {
  const byId = new Map<string, ElementNode>();
  const childrenOf = new Map<string, ElementNode[]>();
  const orderOf = new Map<string, number>();
  const roots: ElementNode[] = [];

  elements.forEach((el, i) => {
    byId.set(el.id, el);
    orderOf.set(el.id, i);
  });

  for (const el of elements) {
    if (el.parentId !== undefined && byId.has(el.parentId)) {
      const siblings = childrenOf.get(el.parentId);
      if (siblings) siblings.push(el);
      else childrenOf.set(el.parentId, [el]);
    } else {
      roots.push(el);
    }
  }

  return { byId, childrenOf, roots, orderOf };
}

export function childrenOf(index: ElementIndex, id: string): ElementNode[] {
  return index.childrenOf.get(id) ?? [];
}

/** Every descendant of `id`, in document order, excluding `id` itself. */
export function descendantsOf(index: ElementIndex, id: string): ElementNode[] {
  const out: ElementNode[] = [];
  const stack = [...childrenOf(index, id)];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    out.push(node);
    stack.push(...childrenOf(index, node.id));
  }
  out.sort((a, b) => (index.orderOf.get(a.id) ?? 0) - (index.orderOf.get(b.id) ?? 0));
  return out;
}

/**
 * All visible text inside `el`, assembled from the own-text of the element and
 * its descendants in document order. Elements carry only their own direct text,
 * so this is how we recover a block's full copy without a DOM.
 */
export function subtreeText(index: ElementIndex, el: ElementNode): string {
  const parts: string[] = [];
  if (hasOwnText(el)) parts.push(normalizeText(el.text));
  for (const d of descendantsOf(index, el.id)) {
    if (hasOwnText(d)) parts.push(normalizeText(d.text));
  }
  return normalizeText(parts.join(' '));
}

/**
 * Structural fingerprint of a subtree: nested tag names, no text.
 * `section(h2,p,p)` - two sections with the same shape collide even when the
 * copy differs, which is what "repeated section" means in practice.
 */
export function structureSignature(index: ElementIndex, el: ElementNode, depth = 4): string {
  if (depth <= 0) return el.tag;
  const kids = childrenOf(index, el.id)
    .slice()
    .sort((a, b) => (index.orderOf.get(a.id) ?? 0) - (index.orderOf.get(b.id) ?? 0))
    .map((c) => structureSignature(index, c, depth - 1));
  return kids.length === 0 ? el.tag : `${el.tag}(${kids.join(',')})`;
}

/** Deterministic 32-bit string hash (FNV-1a). Ids stay stable across runs. */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Group items by a derived key, preserving insertion order. */
export function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = out.get(key);
    if (bucket) bucket.push(item);
    else out.set(key, [item]);
  }
  return out;
}

/** Elements with their own text, visible, outside ignored landmarks. */
export function textElements(snapshot: PageSnapshot): (ElementNode & { text: string })[] {
  return snapshot.elements.filter((el): el is ElementNode & { text: string } => hasOwnText(el) && isVisible(el));
}
