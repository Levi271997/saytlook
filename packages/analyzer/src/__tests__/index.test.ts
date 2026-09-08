import { describe, expect, it } from 'vitest';
import { runAllAnalyzers, sortFindings, summarizeFindings } from '../index.js';
import { axeViolation, box, el, heading, image, snapshot } from './fixtures.js';

const DUPLICATE = 'We build fast, accessible websites for ambitious brands.';

/**
 * The feature 2 acceptance page: one broken image, one missing alt, one
 * duplicated paragraph.
 */
function acceptancePage() {
  return snapshot({
    elements: [
      el({ id: 'p1', tag: 'p', text: DUPLICATE, box: box(0, 100, 600, 40) }),
      el({ id: 'p2', tag: 'p', text: DUPLICATE, box: box(0, 800, 600, 40) }),
      el({ id: 'img-broken', tag: 'img', box: box(0, 200, 400, 300) }),
      el({ id: 'img-noalt', tag: 'img', box: box(0, 520, 400, 300) }),
    ],
    images: [
      image({ id: 'img-broken', src: 'https://example.com/hero.png', status: 404 }),
      image({ id: 'img-noalt', src: 'https://example.com/team.jpg', status: 200, alt: null }),
    ],
    headings: [heading('h1', 1, 'Digitalfeet')],
  });
}

describe('runAllAnalyzers', () => {
  it('reports the broken image, the missing alt and the duplicated paragraph', () => {
    const findings = runAllAnalyzers(acceptancePage());

    const broken = findings.find((f) => f.category === 'image');
    const alt = findings.find((f) => f.category === 'alt');
    const duplicate = findings.find((f) => f.category === 'duplicate-text');

    expect(broken?.severity).toBe('error');
    expect(broken?.elementIds).toEqual(['img-broken']);

    expect(alt?.severity).toBe('error');
    expect(alt?.elementIds).toEqual(['img-noalt']);

    expect(duplicate?.severity).toBe('warning');
    expect(duplicate?.elementIds).toEqual(['p1', 'p2']);
  });

  it('gives every finding element ids the Stage can highlight', () => {
    const page = acceptancePage();
    const ids = new Set([...page.elements.map((e) => e.id), ...page.images.map((i) => i.id)]);

    for (const finding of runAllAnalyzers(page)) {
      for (const id of finding.elementIds) {
        expect(ids.has(id)).toBe(true);
      }
    }
  });

  it('ranks errors above warnings above info', () => {
    const severities = runAllAnalyzers(acceptancePage()).map((f) => f.severity);
    const rank = { error: 0, warning: 1, info: 2 } as const;

    for (let i = 1; i < severities.length; i++) {
      const previous = severities[i - 1];
      const current = severities[i];
      if (!previous || !current) continue;
      expect(rank[previous]).toBeLessThanOrEqual(rank[current]);
    }
  });

  it('produces no findings for a clean page', () => {
    const page = snapshot({
      elements: [el({ id: 'p', tag: 'p', text: 'Short and clean.' })],
      images: [image({ id: 'img', status: 200 })],
      headings: [heading('h1', 1, 'Clean page')],
    });

    expect(runAllAnalyzers(page)).toEqual([]);
  });

  it('respects option overrides', () => {
    const page = snapshot({
      elements: [
        el({ id: 'a', tag: 'p', text: 'Sample copy A', styles: { fontFamily: 'Inter' } }),
        el({ id: 'b', tag: 'p', text: 'Sample copy B', styles: { fontFamily: 'Georgia' } }),
      ],
    });

    expect(runAllAnalyzers(page)).toEqual([]);
    expect(runAllAnalyzers(page, { typography: { maxFontFamilies: 1 } as never })).not.toEqual([]);
  });
});

describe('axe integration', () => {
  it('turns axe violations into findings carrying the help URL', () => {
    const page = snapshot({
      axeResults: [
        axeViolation({
          id: 'color-contrast',
          impact: 'serious',
          help: 'Elements must have sufficient colour contrast',
          nodes: [{ target: ['.hero > p'], html: '<p>Low contrast</p>', elementId: 'p1' }],
        }),
      ],
    });

    const finding = runAllAnalyzers(page).find((f) => f.id === 'axe-color-contrast');

    expect(finding?.category).toBe('accessibility');
    expect(finding?.severity).toBe('error');
    expect(finding?.elementIds).toEqual(['p1']);
    expect(finding?.helpUrl).toContain('dequeuniversity');
  });

  it('prefers the axe alt violation over our own for the same element', () => {
    const page = snapshot({
      images: [image({ id: 'img-1', status: 200, alt: null })],
      axeResults: [
        axeViolation({
          id: 'image-alt',
          nodes: [{ target: ['img'], html: '<img src="a.png">', elementId: 'img-1' }],
        }),
      ],
    });

    const altFindings = runAllAnalyzers(page).filter((f) => f.category === 'alt');

    expect(altFindings).toHaveLength(1);
    expect(altFindings[0]?.id).toBe('axe-image-alt');
  });

  it('keeps our own alt finding when axe did not cover that element', () => {
    const page = snapshot({
      images: [image({ id: 'img-1', status: 200, alt: null })],
      axeResults: [
        axeViolation({
          id: 'image-alt',
          nodes: [{ target: ['img'], html: '<img src="b.png">', elementId: 'other' }],
        }),
      ],
    });

    const ids = runAllAnalyzers(page)
      .filter((f) => f.category === 'alt')
      .map((f) => f.id);

    expect(ids).toContain('alt-missing-img-1');
  });

  it('maps a minor impact to info', () => {
    const page = snapshot({
      axeResults: [axeViolation({ id: 'region', impact: 'minor', help: 'All content should be in a landmark' })],
    });

    expect(runAllAnalyzers(page)[0]?.severity).toBe('info');
  });
});

describe('summarizeFindings', () => {
  it('counts each severity', () => {
    const counts = summarizeFindings(sortFindings(runAllAnalyzers(acceptancePage())));
    expect(counts.error).toBe(2);
    expect(counts.warning).toBeGreaterThanOrEqual(1);
  });
});
