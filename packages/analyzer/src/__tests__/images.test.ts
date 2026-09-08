import { describe, expect, it } from 'vitest';
import { analyzeImages, shortSrc } from '../images.js';
import { box, image, snapshot } from './fixtures.js';

describe('analyzeImages', () => {
  it('passes a healthy image with alt text', () => {
    const page = snapshot({ images: [image({ id: 'img-1', status: 200 })] });
    expect(analyzeImages(page)).toEqual([]);
  });

  it('flags a non-2xx status as an error', () => {
    const page = snapshot({
      images: [image({ id: 'img-1', status: 404, src: 'https://example.com/missing.png' })],
    });

    const findings = analyzeImages(page);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('image');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('404');
    expect(findings[0]?.elementIds).toEqual(['img-1']);
  });

  it('flags an image that decoded to zero width', () => {
    const page = snapshot({
      images: [image({ id: 'img-1', status: 200, naturalWidth: 0, naturalHeight: 0 })],
    });

    const findings = analyzeImages(page);
    expect(findings[0]?.message).toContain('naturalWidth is 0');
    expect(findings[0]?.severity).toBe('error');
  });

  it('does not flag zero-width SVGs, which legitimately report no intrinsic size', () => {
    const page = snapshot({
      images: [image({ id: 'img-1', status: 200, naturalWidth: 0, src: 'https://example.com/logo.svg' })],
    });

    expect(analyzeImages(page)).toEqual([]);
  });

  it('reports a failed request with the underlying error', () => {
    const page = snapshot({
      images: [image({ id: 'img-1', checkError: 'ENOTFOUND cdn.example.com' })],
    });

    const findings = analyzeImages(page);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.details).toContain('ENOTFOUND');
  });

  it('flags a missing alt attribute as an error', () => {
    const page = snapshot({ images: [image({ id: 'img-1', alt: null, status: 200 })] });

    const findings = analyzeImages(page);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('alt');
    expect(findings[0]?.severity).toBe('error');
  });

  it('treats an empty alt on a small image as info, and on a large image as a warning', () => {
    const page = snapshot({
      images: [
        image({ id: 'icon', alt: '', status: 200, box: box(0, 0, 24, 24) }),
        image({ id: 'hero', alt: '   ', status: 200, box: box(0, 0, 1200, 600) }),
      ],
    });

    const findings = analyzeImages(page);
    expect(findings.find((f) => f.elementIds[0] === 'icon')?.severity).toBe('info');
    expect(findings.find((f) => f.elementIds[0] === 'hero')?.severity).toBe('warning');
  });

  it('reports a broken image and a missing alt on the same page independently', () => {
    const page = snapshot({
      images: [
        image({ id: 'broken', status: 500 }),
        image({ id: 'noalt', status: 200, alt: null }),
      ],
    });

    const findings = analyzeImages(page);
    expect(findings.map((f) => f.category).sort()).toEqual(['alt', 'image']);
  });
});

describe('shortSrc', () => {
  it('reduces a URL to its filename', () => {
    expect(shortSrc('https://cdn.example.com/a/b/hero-image.png?v=3')).toBe('hero-image.png');
  });

  it('labels data URIs without dumping the payload', () => {
    expect(shortSrc('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')).toContain('data URI');
  });

  it('falls back gracefully on a relative src', () => {
    expect(shortSrc('/assets/logo.svg')).toBe('logo.svg');
  });
});
