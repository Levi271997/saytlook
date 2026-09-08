import type { AxeResult, ElementNode, HeadingNode, ImageNode } from '@digitalfeet/analyzer';

export interface ExtractOptions {
  /** Hard cap on captured elements, so an enormous DOM cannot blow up the payload. */
  maxElements: number;
}

export interface ExtractedPageData {
  elements: ElementNode[];
  headings: HeadingNode[];
  images: ImageNode[];
  pageSize: { width: number; height: number };
  viewport: { width: number; height: number };
  truncated: boolean;
}

/**
 * Runs **inside the target page** via `page.evaluate`.
 *
 * Playwright serializes this function to source and evaluates it in the browser,
 * so it must be entirely self-contained: no imports, no closure variables, no
 * references to anything outside its own body. Every helper is nested for that
 * reason - do not lift them out.
 *
 * Boxes are returned in full-page coordinates (viewport rect + scroll offset),
 * which is the single coordinate space the whole app draws in.
 */
export function extractSnapshotData(options: ExtractOptions): ExtractedPageData {
  const SKIP_TAGS = new Set([
    'script',
    'style',
    'link',
    'meta',
    'head',
    'title',
    'noscript',
    'template',
    'br',
    'source',
    'track',
    'param',
  ]);

  const LANDMARK_TAGS: Record<string, string> = {
    nav: 'nav',
    header: 'header',
    footer: 'footer',
    main: 'main',
    aside: 'aside',
    form: 'form',
  };

  const LANDMARK_ROLES: Record<string, string> = {
    navigation: 'nav',
    banner: 'header',
    contentinfo: 'footer',
    main: 'main',
    complementary: 'aside',
    form: 'form',
    search: 'form',
  };

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const elements: ElementNode[] = [];
  const headings: HeadingNode[] = [];
  const images: ImageNode[] = [];

  let nextId = 0;
  let truncated = false;

  function normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Computed lengths come back as "24px"; `normal`/`auto` become NaN. */
  function toPx(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function pxOrZero(value: string): number {
    const parsed = toPx(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Only the element's own direct text nodes, not its descendants'. */
  function ownText(element: Element): string {
    let text = '';
    for (let i = 0; i < element.childNodes.length; i++) {
      const node = element.childNodes[i];
      if (node && node.nodeType === 3) text += node.textContent ?? '';
    }
    return normalize(text);
  }

  function landmarkFor(element: Element, role: string): string | undefined {
    const byRole = LANDMARK_ROLES[role];
    if (byRole) return byRole;
    return LANDMARK_TAGS[element.tagName.toLowerCase()];
  }

  function isHidden(style: CSSStyleDeclaration): boolean {
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
  }

  function visit(element: Element, parentId: string | undefined, landmark: string | undefined): void {
    if (elements.length >= options.maxElements) {
      truncated = true;
      return;
    }

    const tag = element.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    const style = window.getComputedStyle(element);

    // A hidden subtree contributes nothing visual, so prune it entirely.
    if (isHidden(style)) return;

    const rect = element.getBoundingClientRect();
    const role = element.getAttribute('role') ?? '';
    const currentLandmark = landmarkFor(element, role) ?? landmark;

    const id = `el-${nextId++}`;
    element.setAttribute('data-dfqa-id', id);

    const fontSize = pxOrZero(style.fontSize);
    const lineHeightRaw = toPx(style.lineHeight);
    // `line-height: normal` has no px value; ~1.2x is Chromium's practical default.
    const lineHeight = Number.isFinite(lineHeightRaw) ? lineHeightRaw : fontSize * 1.2;

    const text = ownText(element);
    const display = style.display;

    const node: ElementNode = {
      id,
      tag,
      box: {
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
      },
      styles: {
        fontFamily: style.fontFamily,
        fontSize,
        lineHeight,
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        color: style.color,
        marginTop: pxOrZero(style.marginTop),
        marginRight: pxOrZero(style.marginRight),
        marginBottom: pxOrZero(style.marginBottom),
        marginLeft: pxOrZero(style.marginLeft),
        paddingTop: pxOrZero(style.paddingTop),
        paddingRight: pxOrZero(style.paddingRight),
        paddingBottom: pxOrZero(style.paddingBottom),
        paddingLeft: pxOrZero(style.paddingLeft),
      },
      display,
      isBlock: display !== 'inline',
    };

    if (text.length > 0) node.text = text;
    if (parentId !== undefined) node.parentId = parentId;
    if (role.length > 0) node.role = role;
    if (currentLandmark !== undefined) node.landmark = currentLandmark as ElementNode['landmark'];

    elements.push(node);

    if (/^h[1-6]$/.test(tag)) {
      headings.push({
        id,
        level: Number.parseInt(tag.slice(1), 10) as HeadingNode['level'],
        text: normalize(element.textContent ?? ''),
        box: node.box,
      });
    }

    if (tag === 'img') {
      const img = element as HTMLImageElement;
      images.push({
        id,
        src: img.currentSrc || img.src || img.getAttribute('src') || '',
        // `alt` the property is '' for both a missing and an empty attribute -
        // only the attribute distinguishes "no alt" from "decorative".
        alt: img.hasAttribute('alt') ? img.getAttribute('alt') : null,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        box: node.box,
      });
    }

    const children = element.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child) visit(child, id, currentLandmark);
    }
  }

  if (document.body) visit(document.body, undefined, undefined);

  const doc = document.documentElement;
  const body = document.body;
  const pageWidth = Math.max(
    doc.scrollWidth,
    doc.offsetWidth,
    doc.clientWidth,
    body ? body.scrollWidth : 0,
    body ? body.offsetWidth : 0,
  );
  const pageHeight = Math.max(
    doc.scrollHeight,
    doc.offsetHeight,
    doc.clientHeight,
    body ? body.scrollHeight : 0,
    body ? body.offsetHeight : 0,
  );

  return {
    elements,
    headings,
    images,
    pageSize: { width: pageWidth, height: pageHeight },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    truncated,
  };
}

/**
 * Also runs inside the page, after `axe.min.js` has been injected and after
 * `extractSnapshotData` has stamped every element with `data-dfqa-id`.
 *
 * Resolving axe's CSS-selector targets back to our ids here is what lets a
 * click on an accessibility finding highlight the right box on the Stage.
 */
export async function collectAxeResults(): Promise<AxeResult[]> {
  const axe = (window as unknown as { axe?: { run: (ctx: unknown, opts: unknown) => Promise<unknown> } }).axe;
  if (!axe) return [];

  const results = (await axe.run(document, {
    resultTypes: ['violations'],
    // Screenshot-based review does not benefit from these, and they are slow.
    rules: { 'color-contrast': { enabled: true } },
  })) as { violations: RawViolation[] };

  interface RawNode {
    target: unknown[];
    html: string;
    failureSummary?: string;
  }

  interface RawViolation {
    id: string;
    impact: string | null;
    help: string;
    description: string;
    helpUrl: string;
    tags: string[];
    nodes: RawNode[];
  }

  function flattenTarget(target: unknown[]): string[] {
    const out: string[] = [];
    for (const part of target) {
      if (typeof part === 'string') out.push(part);
      else if (Array.isArray(part)) out.push(...flattenTarget(part));
    }
    return out;
  }

  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact as AxeResult['impact'],
    help: violation.help,
    description: violation.description,
    helpUrl: violation.helpUrl,
    tags: violation.tags,
    nodes: violation.nodes.map((node) => {
      const target = flattenTarget(node.target);
      let elementId: string | undefined;

      try {
        const selector = target.join(' ');
        const match = selector.length > 0 ? document.querySelector(selector) : null;
        elementId = match?.getAttribute('data-dfqa-id') ?? undefined;
      } catch {
        // axe can emit shadow-DOM or iframe targets querySelector cannot parse.
        elementId = undefined;
      }

      return {
        target,
        html: node.html.slice(0, 300),
        failureSummary: node.failureSummary,
        elementId,
      };
    }),
  }));
}

/**
 * Scrolls the page top to bottom to trigger lazy-loaded images and reveal
 * on-scroll animations, then returns to the top so full-page coordinates are
 * measured from a settled layout.
 */
export async function autoScrollPage(): Promise<void> {
  await new Promise<void>((resolve) => {
    const step = Math.max(200, window.innerHeight * 0.8);
    let travelled = 0;
    const limit = 100_000; // guard against infinite-scroll pages

    const timer = window.setInterval(() => {
      window.scrollBy(0, step);
      travelled += step;

      const reachedBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 2;
      if (reachedBottom || travelled > limit) {
        window.clearInterval(timer);
        window.scrollTo(0, 0);
        resolve();
      }
    }, 60);
  });
}
