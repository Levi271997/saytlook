import { describe, expect, it } from 'vitest';
import { analyzeTypography } from '../typography.js';
import { DEFAULT_OPTIONS } from '../types.js';
import { box, el, snapshot } from './fixtures.js';

const opts = DEFAULT_OPTIONS.typography;

describe('analyzeTypography', () => {
  it('returns nothing for a consistent page', () => {
    const page = snapshot({
      elements: [
        el({ id: 'a', tag: 'p', text: 'Hello there', styles: { fontSize: 16, lineHeight: 24 } }),
        el({ id: 'b', tag: 'p', text: 'Second paragraph', styles: { fontSize: 16, lineHeight: 24 } }),
      ],
    });

    expect(analyzeTypography(page, opts)).toEqual([]);
  });

  it('flags more than the allowed number of font families', () => {
    const families = ['Inter', 'Georgia', 'Courier', 'Comic Sans MS'];
    const page = snapshot({
      elements: families.map((family, i) =>
        el({ id: `f-${i}`, tag: 'p', text: `Text in ${family}`, styles: { fontFamily: `${family}, sans-serif` } }),
      ),
    });

    const findings = analyzeTypography(page, opts);
    const familyFinding = findings.find((f) => f.id === 'typography-font-families');

    expect(familyFinding).toBeDefined();
    expect(familyFinding?.severity).toBe('warning');
    expect(familyFinding?.message).toContain('4 distinct font families');
  });

  it('does not flag families when exactly at the limit', () => {
    const page = snapshot({
      elements: ['Inter', 'Georgia', 'Courier'].map((family, i) =>
        el({ id: `f-${i}`, tag: 'p', text: `Sample copy ${i}`, styles: { fontFamily: family } }),
      ),
    });

    expect(analyzeTypography(page, opts).find((f) => f.id === 'typography-font-families')).toBeUndefined();
  });

  it('ignores the quoted-name and fallback parts when counting families', () => {
    const page = snapshot({
      elements: [
        el({ id: 'a', tag: 'p', text: 'One', styles: { fontFamily: '"Inter", Helvetica, sans-serif' } }),
        el({ id: 'b', tag: 'p', text: 'Two', styles: { fontFamily: "Inter, Arial, sans-serif" } }),
        el({ id: 'c', tag: 'p', text: 'Three', styles: { fontFamily: 'inter' } }),
      ],
    });

    expect(analyzeTypography(page, opts).find((f) => f.id === 'typography-font-families')).toBeUndefined();
  });

  it('flags text smaller than the minimum size and groups it by size', () => {
    const page = snapshot({
      elements: [
        el({ id: 'a', tag: 'span', text: 'Legal copy', styles: { fontSize: 10, lineHeight: 16 } }),
        el({ id: 'b', tag: 'span', text: 'More legal copy', styles: { fontSize: 10, lineHeight: 16 } }),
        el({ id: 'c', tag: 'p', text: 'Normal copy', styles: { fontSize: 16, lineHeight: 24 } }),
      ],
    });

    const finding = analyzeTypography(page, opts).find((f) => f.id === 'typography-tiny-text-10');

    expect(finding).toBeDefined();
    expect(finding?.elementIds).toEqual(['a', 'b']);
    expect(finding?.message).toContain('10px');
  });

  it('flags cramped line-height on body copy', () => {
    const page = snapshot({
      elements: [el({ id: 'a', tag: 'p', text: 'Tightly set body copy', styles: { fontSize: 16, lineHeight: 17 } })],
    });

    const findings = analyzeTypography(page, opts);
    const lineHeight = findings.find((f) => f.category === 'typography' && f.id.startsWith('typography-line-height'));

    expect(lineHeight).toBeDefined();
    expect(lineHeight?.elementIds).toEqual(['a']);
  });

  it('does not flag tight line-height on display type or headings', () => {
    const page = snapshot({
      elements: [
        el({ id: 'hero', tag: 'h1', text: 'Big hero headline', styles: { fontSize: 48, lineHeight: 50 } }),
        el({ id: 'sub', tag: 'h2', text: 'Subhead', styles: { fontSize: 18, lineHeight: 19 } }),
      ],
    });

    expect(
      analyzeTypography(page, opts).filter((f) => f.id.startsWith('typography-line-height')),
    ).toEqual([]);
  });

  it('ignores elements with no text and zero-size boxes', () => {
    const page = snapshot({
      elements: [
        el({ id: 'empty', tag: 'div' }),
        el({ id: 'hidden', tag: 'p', text: 'Hidden copy', box: box(0, 0, 0, 0), styles: { fontSize: 4 } }),
      ],
    });

    expect(analyzeTypography(page, opts)).toEqual([]);
  });
});
