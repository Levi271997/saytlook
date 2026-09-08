import { describe, expect, it } from 'vitest';
import { analyzeDuplicates } from '../duplicates.js';
import { DEFAULT_OPTIONS } from '../types.js';
import { box, el, snapshot } from './fixtures.js';

const opts = DEFAULT_OPTIONS.duplicates;
const LONG = 'We build fast, accessible websites for ambitious brands.';

describe('duplicate text', () => {
  it('flags an identical paragraph appearing twice', () => {
    const page = snapshot({
      elements: [
        el({ id: 'p1', tag: 'p', text: LONG, box: box(0, 0, 600, 40) }),
        el({ id: 'p2', tag: 'p', text: LONG, box: box(0, 400, 600, 40) }),
      ],
    });

    const findings = analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-text');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.elementIds).toEqual(['p1', 'p2']);
    expect(findings[0]?.message).toContain('repeated 2 times');
  });

  it('matches across whitespace and casing differences', () => {
    const page = snapshot({
      elements: [
        el({ id: 'p1', tag: 'p', text: LONG }),
        el({ id: 'p2', tag: 'p', text: `  we BUILD fast,   accessible websites for ambitious brands.  ` }),
      ],
    });

    expect(analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-text')).toHaveLength(1);
  });

  it('ignores strings at or below the minimum length', () => {
    const short = 'Short enough to repeat';
    const page = snapshot({
      elements: [el({ id: 'a', tag: 'p', text: short }), el({ id: 'b', tag: 'p', text: short })],
    });

    expect(analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-text')).toEqual([]);
  });

  it('ignores boilerplate in nav and footer landmarks', () => {
    const page = snapshot({
      elements: [
        el({ id: 'n', tag: 'a', text: LONG, landmark: 'nav' }),
        el({ id: 'f', tag: 'a', text: LONG, landmark: 'footer' }),
      ],
    });

    expect(analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-text')).toEqual([]);
  });

  it('honours the configurable ignore list', () => {
    const text = 'Copyright 2026 Digitalfeet. All rights reserved worldwide.';
    const page = snapshot({
      elements: [el({ id: 'a', tag: 'p', text }), el({ id: 'b', tag: 'p', text })],
    });

    expect(analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-text')).toEqual([]);
  });
});

describe('duplicate sections', () => {
  const cardCopy = 'A'.repeat(60);

  function card(prefix: string, y: number) {
    return [
      el({ id: `${prefix}`, tag: 'article', parentId: 'grid', box: box(0, y, 400, 300) }),
      el({ id: `${prefix}-h`, tag: 'h3', parentId: prefix, text: 'Strategy and design', box: box(0, y, 400, 40) }),
      el({ id: `${prefix}-p1`, tag: 'p', parentId: prefix, text: cardCopy, box: box(0, y + 40, 400, 100) }),
      el({ id: `${prefix}-p2`, tag: 'p', parentId: prefix, text: cardCopy, box: box(0, y + 140, 400, 100) }),
      el({ id: `${prefix}-p3`, tag: 'p', parentId: prefix, text: cardCopy, box: box(0, y + 240, 400, 60) }),
    ];
  }

  it('flags two structurally and textually identical blocks', () => {
    const page = snapshot({
      elements: [
        el({ id: 'grid', tag: 'div', box: box(0, 0, 1200, 700) }),
        ...card('card-a', 0),
        ...card('card-b', 350),
      ],
    });

    const findings = analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-section');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.elementIds).toEqual(['card-a', 'card-b']);
  });

  it('reports the outermost duplicate only, not every nested child', () => {
    const page = snapshot({
      elements: [
        el({ id: 'grid', tag: 'div', box: box(0, 0, 1200, 700) }),
        ...card('card-a', 0),
        ...card('card-b', 350),
      ],
    });

    const findings = analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-section');
    const reported = findings.flatMap((f) => f.elementIds);
    expect(reported).not.toContain('card-a-p1');
  });

  it('does not flag blocks that share a shape but differ in copy', () => {
    const page = snapshot({
      elements: [
        el({ id: 'grid', tag: 'div', box: box(0, 0, 1200, 700) }),
        ...card('card-a', 0),
        el({ id: 'card-b', tag: 'article', parentId: 'grid', box: box(0, 350, 400, 300) }),
        el({ id: 'card-b-h', tag: 'h3', parentId: 'card-b', text: 'Engineering', box: box(0, 350, 400, 40) }),
        el({ id: 'card-b-p1', tag: 'p', parentId: 'card-b', text: 'B'.repeat(60), box: box(0, 390, 400, 100) }),
        el({ id: 'card-b-p2', tag: 'p', parentId: 'card-b', text: 'C'.repeat(60), box: box(0, 490, 400, 100) }),
        el({ id: 'card-b-p3', tag: 'p', parentId: 'card-b', text: 'D'.repeat(60), box: box(0, 590, 400, 60) }),
      ],
    });

    expect(analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-section')).toEqual([]);
  });

  it('skips blocks that are not substantial enough', () => {
    const page = snapshot({
      elements: [
        el({ id: 'wrap', tag: 'div', box: box(0, 0, 600, 200) }),
        el({ id: 'a', tag: 'div', parentId: 'wrap', box: box(0, 0, 600, 40) }),
        el({ id: 'a-t', tag: 'span', parentId: 'a', text: 'Tiny', box: box(0, 0, 100, 20) }),
        el({ id: 'b', tag: 'div', parentId: 'wrap', box: box(0, 60, 600, 40) }),
        el({ id: 'b-t', tag: 'span', parentId: 'b', text: 'Tiny', box: box(0, 60, 100, 20) }),
      ],
    });

    expect(analyzeDuplicates(page, opts).filter((f) => f.category === 'duplicate-section')).toEqual([]);
  });
});
