import type { ElementNode, Finding, PageSnapshot, TypographyOptions } from './types.js';
import { DEFAULT_OPTIONS } from './types.js';
import { formatPx, groupBy, hasOwnText, isHeadingTag, isVisible, primaryFontFamily, round } from './utils.js';

/**
 * Typography consistency checks (feature 2).
 *
 * Pure: `(snapshot, options) => Finding[]`. No DOM, no fetch, no side effects.
 */
export function analyzeTypography(
  snapshot: PageSnapshot,
  options: TypographyOptions = DEFAULT_OPTIONS.typography,
): Finding[] {
  const findings: Finding[] = [];
  const texts = snapshot.elements.filter(
    (el): el is ElementNode & { text: string } => hasOwnText(el) && isVisible(el),
  );
  if (texts.length === 0) return findings;

  findings.push(...checkFontFamilies(texts, options));
  findings.push(...checkFontSizeVariety(texts, options));
  findings.push(...checkTinyText(texts, options));
  findings.push(...checkLineHeight(texts, options));

  return findings;
}

/** More than N distinct font families on one page usually means a mistake. */
function checkFontFamilies(texts: ElementNode[], options: TypographyOptions): Finding[] {
  const byFamily = groupBy(texts, (el) => primaryFontFamily(el.styles.fontFamily));
  byFamily.delete('');
  if (byFamily.size <= options.maxFontFamilies) return [];

  // Rank by usage so the panel names the rare, likely-accidental families.
  const ranked = [...byFamily.entries()].sort((a, b) => b[1].length - a[1].length);
  const strays = ranked.slice(options.maxFontFamilies);

  return [
    {
      id: 'typography-font-families',
      category: 'typography',
      severity: 'warning',
      message: `Page uses ${byFamily.size} distinct font families (expected at most ${options.maxFontFamilies}).`,
      details: `In use: ${ranked.map(([family, els]) => `${family} (${els.length})`).join(', ')}. Least used: ${strays
        .map(([family]) => family)
        .join(', ')}.`,
      elementIds: strays.flatMap(([, els]) => els.slice(0, 10).map((el) => el.id)),
    },
  ];
}

/** An unusually high count of distinct sizes points at an unenforced scale. */
function checkFontSizeVariety(texts: ElementNode[], options: TypographyOptions): Finding[] {
  const bySize = groupBy(texts, (el) => round(el.styles.fontSize, 1));
  if (bySize.size <= options.maxFontSizes) return [];

  const ranked = [...bySize.entries()].sort((a, b) => b[1].length - a[1].length);
  const strays = ranked.slice(options.maxFontSizes);
  const sizes = [...bySize.keys()].sort((a, b) => a - b);

  return [
    {
      id: 'typography-font-sizes',
      category: 'typography',
      severity: 'warning',
      message: `Page uses ${bySize.size} distinct font sizes (expected at most ${options.maxFontSizes}).`,
      details: `Sizes: ${sizes.map(formatPx).join(', ')}. Rarest: ${strays.map(([size]) => formatPx(size)).join(', ')}.`,
      elementIds: strays.flatMap(([, els]) => els.slice(0, 10).map((el) => el.id)),
    },
  ];
}

/** Text below the minimum readable size, grouped by size so the panel stays short. */
function checkTinyText(texts: ElementNode[], options: TypographyOptions): Finding[] {
  const tiny = texts.filter((el) => el.styles.fontSize > 0 && el.styles.fontSize < options.minFontSize);
  const bySize = groupBy(tiny, (el) => round(el.styles.fontSize, 1));

  return [...bySize.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, els]) => ({
      id: `typography-tiny-text-${size}`,
      category: 'typography' as const,
      severity: 'warning' as const,
      message: `${els.length} element${els.length === 1 ? '' : 's'} render text at ${formatPx(
        size,
      )}, below the ${formatPx(options.minFontSize)} minimum.`,
      details: sampleText(els),
      elementIds: els.map((el) => el.id),
    }));
}

/** Body copy set tighter than 1.2x its font size is hard to read. */
function checkLineHeight(texts: ElementNode[], options: TypographyOptions): Finding[] {
  const cramped = texts.filter((el) => {
    const { fontSize, lineHeight } = el.styles;
    if (fontSize <= 0 || lineHeight <= 0) return false;
    if (fontSize > options.bodyTextMaxSize) return false; // display type may be tight on purpose
    if (isHeadingTag(el.tag)) return false;
    return lineHeight < fontSize * options.minLineHeightRatio;
  });
  if (cramped.length === 0) return [];

  const byRatio = groupBy(cramped, (el) => round(el.styles.lineHeight / el.styles.fontSize, 2));

  return [...byRatio.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ratio, els]) => ({
      id: `typography-line-height-${ratio}`,
      category: 'typography' as const,
      severity: 'warning' as const,
      message: `${els.length} body text element${els.length === 1 ? '' : 's'} use a line-height of ${ratio}x font size (minimum ${options.minLineHeightRatio}x).`,
      details: sampleText(els),
      elementIds: els.map((el) => el.id),
    }));
}

function sampleText(els: ElementNode[]): string {
  const sample = els
    .slice(0, 3)
    .map((el) => (el.text ?? '').slice(0, 60))
    .filter((t) => t.length > 0);
  return sample.length > 0 ? `e.g. ${sample.map((t) => `"${t}"`).join(', ')}` : '';
}
