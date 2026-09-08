/**
 * pixelmatch 6 ships no type declarations, and `@types/pixelmatch` describes
 * the CommonJS v5 API. This is the v6 signature, which is all we call.
 */
declare module 'pixelmatch' {
  interface PixelmatchOptions {
    /** Matching threshold, 0-1. Smaller is more sensitive. Default 0.1. */
    threshold?: number;
    /** Draw anti-aliased pixels as a distinct colour instead of ignoring them. */
    includeAA?: boolean;
    /** Opacity of the original image in the diff output, 0-1. */
    alpha?: number;
    aaColor?: [number, number, number];
    diffColor?: [number, number, number];
    diffColorAlt?: [number, number, number];
    diffMask?: boolean;
  }

  /** Returns the number of differing pixels. */
  export default function pixelmatch(
    img1: Uint8Array | Uint8ClampedArray,
    img2: Uint8Array | Uint8ClampedArray,
    output: Uint8Array | Uint8ClampedArray | null,
    width: number,
    height: number,
    options?: PixelmatchOptions,
  ): number;
}
