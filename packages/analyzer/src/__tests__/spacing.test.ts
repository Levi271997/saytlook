import { describe, expect, it } from 'vitest';
import {
  analyzeSpacing,
  boxModelOf,
  computeSiblingGaps,
  computeVerticalRhythm,
  findMainColumn,
  isMultipleOf,
} from '../spacing.js';
import { DEFAULT_OPTIONS } from '../types.js';
import { box, el, snapshot, stackedColumnSnapshot } from './fixtures.js';

const opts = DEFAULT_OPTIONS.spacing;

describe('computeVerticalRhythm', () => {
  it('labels the gaps down the main column with the computed px values', () => {
    const page = stackedColumnSnapshot([24, 40]);
    const gaps = computeVerticalRhythm(page, opts);

    expect(gaps.map((g) => g.distance)).toEqual([24, 40]);
    expect(gaps.map((g) => g.label)).toEqual(['24px', '40px']);
    expect(gaps.map((g) => [g.fromId, g.toId])).toEqual([
      ['sec-0', 'sec-1'],
      ['sec-1', 'sec-2'],
    ]);
  });

  it('draws each dimension line across the gap, centred on the shared width', () => {
    const gaps = computeVerticalRhythm(stackedColumnSnapshot([24]), opts);
    const gap = gaps[0];

    expect(gap?.line).toEqual({ x1: 720, y1: 200, x2: 720, y2: 224 });
    expect(gap?.labelAt).toEqual({ x: 720, y: 212 });
  });

  it('returns nothing when there is no identifiable main column', () => {
    expect(computeVerticalRhythm(snapshot(), opts)).toEqual([]);
  });
});

describe('computeSiblingGaps', () => {
  it('measures horizontal gaps between elements in a row', () => {
    const page = snapshot({
      elements: [
        el({ id: 'row', tag: 'div', box: box(0, 0, 1000, 200) }),
        el({ id: 'a', parentId: 'row', box: box(0, 0, 300, 200) }),
        el({ id: 'b', parentId: 'row', box: box(332, 0, 300, 200) }),
      ],
    });

    const horizontal = computeSiblingGaps(page, opts).filter((g) => g.orientation === 'horizontal');
    expect(horizontal).toHaveLength(1);
    expect(horizontal[0]?.distance).toBe(32);
    expect(horizontal[0]?.line).toEqual({ x1: 300, y1: 100, x2: 332, y2: 100 });
  });

  it('does not pair elements that barely overlap on the cross axis', () => {
    const page = snapshot({
      elements: [
        el({ id: 'wrap', tag: 'div', box: box(0, 0, 1000, 400) }),
        el({ id: 'a', parentId: 'wrap', box: box(0, 0, 200, 100) }),
        el({ id: 'b', parentId: 'wrap', box: box(900, 200, 100, 100) }),
      ],
    });

    expect(computeSiblingGaps(page, opts)).toEqual([]);
  });

  it('ignores overlapping siblings rather than reporting a negative gap', () => {
    const page = snapshot({
      elements: [
        el({ id: 'wrap', tag: 'div', box: box(0, 0, 1000, 400) }),
        el({ id: 'a', parentId: 'wrap', box: box(0, 0, 800, 200) }),
        el({ id: 'b', parentId: 'wrap', box: box(0, 100, 800, 200) }),
      ],
    });

    expect(computeSiblingGaps(page, opts).every((g) => g.distance >= 0)).toBe(true);
  });
});

describe('findMainColumn', () => {
  it('prefers an explicit main landmark', () => {
    expect(findMainColumn(stackedColumnSnapshot([24, 24]))?.id).toBe('main');
  });

  it('falls back to the wrapper holding the most substantial blocks', () => {
    const page = snapshot({
      elements: [
        el({ id: 'body', tag: 'body', box: box(0, 0, 1440, 900) }),
        el({ id: 'wrap', tag: 'div', parentId: 'body', box: box(0, 0, 1440, 900) }),
        el({ id: 's1', tag: 'section', parentId: 'wrap', box: box(0, 0, 1440, 200) }),
        el({ id: 's2', tag: 'section', parentId: 'wrap', box: box(0, 224, 1440, 200) }),
        el({ id: 's3', tag: 'section', parentId: 'wrap', box: box(0, 448, 1440, 200) }),
      ],
    });

    expect(findMainColumn(page)?.id).toBe('wrap');
  });
});

describe('boxModelOf', () => {
  it('derives the margin and content rectangles from the computed styles', () => {
    const element = el({
      id: 'card',
      box: box(100, 200, 400, 300),
      styles: {
        marginTop: 16,
        marginBottom: 24,
        marginLeft: 8,
        marginRight: 8,
        paddingTop: 20,
        paddingBottom: 20,
        paddingLeft: 32,
        paddingRight: 32,
      },
    });

    const model = boxModelOf(element);

    expect(model.marginBox).toEqual({ x: 92, y: 184, width: 416, height: 340 });
    expect(model.contentBox).toEqual({ x: 132, y: 220, width: 336, height: 260 });
    expect(model.borderBox).toEqual({ x: 100, y: 200, width: 400, height: 300 });
  });

  it('never returns a negative content box when padding exceeds the box', () => {
    const element = el({
      id: 'tiny',
      box: box(0, 0, 10, 10),
      styles: { paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 40 },
    });

    const model = boxModelOf(element);
    expect(model.contentBox.width).toBe(0);
    expect(model.contentBox.height).toBe(0);
  });
});

describe('rhythm reporting', () => {
  it('is off by default', () => {
    expect(analyzeSpacing(stackedColumnSnapshot([23, 23]), opts)).toEqual([]);
  });

  it('flags gaps that miss the base unit when enabled', () => {
    const findings = analyzeSpacing(stackedColumnSnapshot([23, 23]), { ...opts, reportRhythm: true });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]?.message).toContain('8px base unit');
  });

  it('accepts gaps on the grid', () => {
    expect(analyzeSpacing(stackedColumnSnapshot([24, 32]), { ...opts, reportRhythm: true })).toEqual([]);
  });
});

describe('isMultipleOf', () => {
  it('tolerates sub-pixel layout noise', () => {
    expect(isMultipleOf(23.7, 8)).toBe(true);
    expect(isMultipleOf(24.3, 8)).toBe(true);
    expect(isMultipleOf(21, 8)).toBe(false);
    expect(isMultipleOf(0, 8)).toBe(true);
  });
});
