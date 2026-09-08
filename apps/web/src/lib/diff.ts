import pixelmatch from 'pixelmatch';

export interface DiffRegion {
  /** The compared rectangle, in full-page pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiffResult {
  /** Percentage of pixels that differ inside the compared region. */
  score: number;
  /** Data URL of the diff mask, sized to `region`. */
  maskUrl: string;
  region: DiffRegion;
  comparedPixels: number;
}

export interface DiffInput {
  screenshotUrl: string;
  designUrl: string;
  pageSize: { width: number; height: number };
  /** 1 = design fitted to the full page width. */
  designScale: number;
  offsetX: number;
  offsetY: number;
  /** Pixel threshold passed to pixelmatch; higher tolerates more variance. */
  threshold?: number;
}

/** Diffing at full page resolution is slow and adds nothing; 1200px is plenty. */
const MAX_DIFF_WIDTH = 1200;

/**
 * Align the design against the rendered screenshot and report how much of it
 * differs (feature 1 bonus).
 *
 * Only the region where the two actually overlap is compared - otherwise the
 * empty margin around a part-page design would dominate the score.
 */
export async function computeDiff(input: DiffInput): Promise<DiffResult> {
  const [screenshot, design] = await Promise.all([loadImage(input.screenshotUrl), loadImage(input.designUrl)]);

  // The design's footprint in full-page coordinates.
  const designWidth = input.pageSize.width * input.designScale;
  const designHeight = (design.naturalHeight / design.naturalWidth) * designWidth;

  const x0 = Math.max(0, input.offsetX);
  const y0 = Math.max(0, input.offsetY);
  const x1 = Math.min(input.pageSize.width, input.offsetX + designWidth);
  const y1 = Math.min(input.pageSize.height, input.offsetY + designHeight);

  const regionWidth = x1 - x0;
  const regionHeight = y1 - y0;

  if (regionWidth <= 1 || regionHeight <= 1) {
    throw new Error('The design and the page do not overlap. Reset the offset and try again.');
  }

  const factor = Math.min(1, MAX_DIFF_WIDTH / regionWidth);
  const width = Math.max(1, Math.round(regionWidth * factor));
  const height = Math.max(1, Math.round(regionHeight * factor));

  // Crop the same page-space rectangle out of each image.
  const pageRatio = screenshot.naturalWidth / input.pageSize.width;
  const screenshotData = drawCrop(screenshot, {
    sx: x0 * pageRatio,
    sy: y0 * pageRatio,
    sw: regionWidth * pageRatio,
    sh: regionHeight * pageRatio,
    width,
    height,
  });

  const designRatio = design.naturalWidth / designWidth;
  const designData = drawCrop(design, {
    sx: (x0 - input.offsetX) * designRatio,
    sy: (y0 - input.offsetY) * designRatio,
    sw: regionWidth * designRatio,
    sh: regionHeight * designRatio,
    width,
    height,
  });

  const { canvas, context } = createCanvas(width, height);
  const mask = context.createImageData(width, height);

  const changed = pixelmatch(screenshotData.data, designData.data, mask.data, width, height, {
    threshold: input.threshold ?? 0.1,
    includeAA: false,
    alpha: 0.15,
  });

  context.putImageData(mask, 0, 0);

  return {
    score: (changed / (width * height)) * 100,
    maskUrl: canvas.toDataURL('image/png'),
    region: { x: x0, y: y0, width: regionWidth, height: regionHeight },
    comparedPixels: width * height,
  };
}

interface CropSpec {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  width: number;
  height: number;
}

function drawCrop(image: HTMLImageElement, spec: CropSpec): ImageData {
  const { canvas, context } = createCanvas(spec.width, spec.height);

  // Flatten onto white; a transparent PNG export would otherwise read as a
  // difference everywhere the design has no pixels.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, spec.width, spec.height);
  context.drawImage(image, spec.sx, spec.sy, spec.sw, spec.sh, 0, 0, spec.width, spec.height);

  return context.getImageData(0, 0, spec.width, spec.height);
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not get a 2D canvas context');

  return { canvas, context };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Screenshots come from the same origin via the dev proxy, so the canvas
    // stays readable; this keeps it that way if the API is ever served directly.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}
