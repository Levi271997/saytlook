import { describe, expect, it } from 'vitest';
import { analyzeHeadings, buildHeadingOutline, headingColor } from '../headings.js';
import { heading, snapshot } from './fixtures.js';

describe('analyzeHeadings', () => {
  it('accepts a well-formed outline', () => {
    const page = snapshot({
      headings: [
        heading('h-1', 1, 'Digitalfeet'),
        heading('h-2', 2, 'Services'),
        heading('h-3', 3, 'Design'),
        heading('h-4', 2, 'Work'),
      ],
    });

    expect(analyzeHeadings(page)).toEqual([]);
  });

  it('flags a skipped heading level when H2 is followed by H4', () => {
    const page = snapshot({
      headings: [heading('h-1', 1, 'Title'), heading('h-2', 2, 'Section'), heading('h-3', 4, 'Detail')],
    });

    const finding = analyzeHeadings(page).find((f) => f.id.startsWith('heading-skipped-level'));

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain('H2 is followed by H4');
    expect(finding?.elementIds).toEqual(['h-2', 'h-3']);
  });

  it('does not flag jumping back up several levels', () => {
    const page = snapshot({
      headings: [heading('a', 1, 'Title'), heading('b', 4, 'Deep'), heading('c', 2, 'Back up')],
    });

    const skips = analyzeHeadings(page).filter((f) => f.id.startsWith('heading-skipped-level'));
    expect(skips).toHaveLength(1);
    expect(skips[0]?.elementIds).toEqual(['a', 'b']);
  });

  it('flags more than one H1', () => {
    const page = snapshot({ headings: [heading('a', 1, 'One'), heading('b', 1, 'Two')] });

    const finding = analyzeHeadings(page).find((f) => f.id === 'heading-multiple-h1');
    expect(finding?.message).toContain('2 H1 headings');
    expect(finding?.elementIds).toEqual(['a', 'b']);
  });

  it('flags a page with headings but no H1', () => {
    const page = snapshot({ headings: [heading('a', 2, 'Section')] });
    expect(analyzeHeadings(page).find((f) => f.id === 'heading-no-h1')).toBeDefined();
  });

  it('says nothing about H1 on a page with no headings at all', () => {
    expect(analyzeHeadings(snapshot())).toEqual([]);
  });

  it('flags empty heading text as an error', () => {
    const page = snapshot({ headings: [heading('a', 1, 'Title'), heading('b', 2, '   ')] });

    const finding = analyzeHeadings(page).find((f) => f.id === 'heading-empty');
    expect(finding?.severity).toBe('error');
    expect(finding?.elementIds).toEqual(['b']);
  });
});

describe('buildHeadingOutline', () => {
  it('nests headings by level', () => {
    const outline = buildHeadingOutline([
      heading('a', 1, 'Title'),
      heading('b', 2, 'Section'),
      heading('c', 3, 'Sub'),
      heading('d', 2, 'Section two'),
    ]);

    expect(outline).toHaveLength(1);
    expect(outline[0]?.children.map((c) => c.heading.id)).toEqual(['b', 'd']);
    expect(outline[0]?.children[0]?.children.map((c) => c.heading.id)).toEqual(['c']);
  });

  it('handles an outline that starts below H1', () => {
    const outline = buildHeadingOutline([heading('a', 3, 'Deep'), heading('b', 4, 'Deeper')]);

    expect(outline.map((n) => n.heading.id)).toEqual(['a']);
    expect(outline[0]?.children.map((c) => c.heading.id)).toEqual(['b']);
  });

  it('treats sibling headings of equal level as siblings', () => {
    const outline = buildHeadingOutline([heading('a', 2, 'One'), heading('b', 2, 'Two')]);
    expect(outline).toHaveLength(2);
  });

  it('returns an empty outline for no headings', () => {
    expect(buildHeadingOutline([])).toEqual([]);
  });
});

describe('headingColor', () => {
  it('gives every level a distinct colour and falls back for out-of-range input', () => {
    const colors = [1, 2, 3, 4, 5, 6].map(headingColor);
    expect(new Set(colors).size).toBe(6);
    expect(headingColor(9)).toBe('#94a3b8');
  });
});
