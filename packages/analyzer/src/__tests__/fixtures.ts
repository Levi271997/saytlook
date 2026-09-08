import type {
  AxeResult,
  Box,
  ElementNode,
  ElementStyles,
  HeadingNode,
  ImageNode,
  PageSnapshot,
} from '../types.js';

export const DEFAULT_STYLES: ElementStyles = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 16,
  lineHeight: 24,
  fontWeight: 400,
  color: 'rgb(17, 24, 39)',
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
};

export function box(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

export function el(partial: Partial<ElementNode> & { id: string }): ElementNode {
  return {
    tag: 'div',
    box: box(0, 0, 100, 20),
    isBlock: true,
    display: 'block',
    ...partial,
    styles: { ...DEFAULT_STYLES, ...partial.styles },
  };
}

export function heading(
  id: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  text: string,
  at: Box = box(0, 0, 300, 40),
): HeadingNode {
  return { id, level, text, box: at };
}

export function image(partial: Partial<ImageNode> & { id: string }): ImageNode {
  return {
    src: 'https://example.com/photo.png',
    alt: 'A photo',
    naturalWidth: 800,
    naturalHeight: 600,
    box: box(0, 0, 400, 300),
    ...partial,
  };
}

export function axeViolation(partial: Partial<AxeResult> & { id: string }): AxeResult {
  return {
    impact: 'critical',
    help: 'Images must have alternate text',
    description: 'Ensures img elements have alternate text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/image-alt',
    tags: ['wcag2a'],
    nodes: [],
    ...partial,
  };
}

export function snapshot(partial: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: 'https://example.com/',
    capturedAt: '2026-09-08T10:00:00.000Z',
    viewport: { width: 1440, height: 900 },
    screenshot: 'http://localhost:8787/screenshots/test.png',
    pageSize: { width: 1440, height: 3000 },
    elements: [],
    headings: [],
    images: [],
    axeResults: [],
    ...partial,
  };
}

/**
 * A small page: main column with three stacked sections, 24px apart.
 * Used by the spacing tests.
 */
export function stackedColumnSnapshot(gaps: number[] = [24, 24]): PageSnapshot {
  const elements: ElementNode[] = [el({ id: 'main', tag: 'main', box: box(0, 0, 1440, 1000) })];
  let y = 0;
  const blockHeight = 200;

  for (let i = 0; i < gaps.length + 1; i++) {
    elements.push(
      el({
        id: `sec-${i}`,
        tag: 'section',
        parentId: 'main',
        box: box(0, y, 1440, blockHeight),
      }),
    );
    y += blockHeight + (gaps[i] ?? 0);
  }

  return snapshot({ elements });
}
