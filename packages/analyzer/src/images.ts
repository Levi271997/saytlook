import type { Finding, ImageNode, PageSnapshot } from './types.js';
import { boxArea } from './utils.js';

/** An `alt=""` on an image this large is very unlikely to be decorative. */
const DECORATIVE_AREA_LIMIT = 100 * 100;

/**
 * Broken-image and alt-text checks (feature 2).
 *
 * `status` is filled in by the backend's HEAD pass; `naturalWidth` comes from
 * the rendered page. Either one failing means the image did not load.
 */
export function analyzeImages(snapshot: PageSnapshot): Finding[] {
  return [...checkBrokenImages(snapshot.images), ...checkAltText(snapshot.images)];
}

export function checkBrokenImages(images: ImageNode[]): Finding[] {
  const findings: Finding[] = [];

  for (const image of images) {
    const label = shortSrc(image.src);

    if (image.checkError !== undefined) {
      findings.push({
        id: `image-unreachable-${image.id}`,
        category: 'image',
        severity: 'error',
        message: `Image request failed: ${label}`,
        details: image.checkError,
        elementIds: [image.id],
      });
      continue;
    }

    if (image.status !== undefined && (image.status < 200 || image.status >= 300)) {
      findings.push({
        id: `image-status-${image.id}`,
        category: 'image',
        severity: 'error',
        message: `Image returned HTTP ${image.status}: ${label}`,
        elementIds: [image.id],
      });
      continue;
    }

    // Loaded with zero intrinsic size - decoded as broken even if the request was 200.
    if (image.naturalWidth === 0 && !isSvgSource(image.src)) {
      findings.push({
        id: `image-empty-${image.id}`,
        category: 'image',
        severity: 'error',
        message: `Image failed to decode (naturalWidth is 0): ${label}`,
        elementIds: [image.id],
      });
    }
  }

  return findings;
}

/**
 * Our own snapshot pass over alt text. axe-core is the source of truth for
 * `image-alt` violations - `mergeFindings` in index.ts drops ours where axe
 * already reported the same element.
 */
export function checkAltText(images: ImageNode[]): Finding[] {
  const findings: Finding[] = [];

  for (const image of images) {
    const label = shortSrc(image.src);

    if (image.alt === null) {
      findings.push({
        id: `alt-missing-${image.id}`,
        category: 'alt',
        severity: 'error',
        message: `Image has no alt attribute: ${label}`,
        details: 'Add descriptive alt text, or alt="" if the image is purely decorative.',
        elementIds: [image.id],
      });
      continue;
    }

    if (image.alt.trim() === '') {
      const looksDecorative = boxArea(image.box) <= DECORATIVE_AREA_LIMIT;
      findings.push({
        id: `alt-empty-${image.id}`,
        category: 'alt',
        severity: looksDecorative ? 'info' : 'warning',
        message: looksDecorative
          ? `Small image has empty alt text (likely decorative): ${label}`
          : `Image has empty alt text but is ${Math.round(image.box.width)}x${Math.round(
              image.box.height,
            )}px - confirm it is decorative: ${label}`,
        elementIds: [image.id],
      });
    }
  }

  return findings;
}

function isSvgSource(src: string): boolean {
  return /\.svg(\?|#|$)/i.test(src) || src.startsWith('data:image/svg');
}

/**
 * Filenames are what a developer recognizes; full CDN URLs are noise.
 *
 * Parsed by hand rather than with `URL` so this package needs no DOM or Node
 * lib types and stays portable to a Chrome-extension build.
 */
export function shortSrc(src: string, maxLength = 60): string {
  if (src.startsWith('data:')) return `${src.slice(0, 24)}... (data URI)`;

  const path = src
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '') // strip scheme and host
    .replace(/[?#].*$/, ''); // strip query and fragment

  const file = path.split('/').filter(Boolean).pop() ?? src;
  return file.length > maxLength ? `${file.slice(0, maxLength)}...` : file;
}
