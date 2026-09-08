import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export interface SavedScreenshot {
  /** Filename on disk. */
  file: string;
  /** Absolute URL the frontend loads as the Stage base layer. */
  url: string;
  /** True pixel dimensions of the PNG, read from its header. */
  size: { width: number; height: number };
}

let ensured = false;

async function ensureDir(): Promise<void> {
  if (ensured) return;
  await fs.mkdir(config.screenshotDir, { recursive: true });
  ensured = true;
}

/**
 * Screenshots go to a static dir on disk, not a database - deliberately, per
 * the "no persistence yet" decision. Filenames embed a hash of the URL so
 * re-rendering the same page overwrites nothing.
 */
export async function saveScreenshot(pageUrl: string, buffer: Buffer): Promise<SavedScreenshot> {
  await ensureDir();

  const hash = crypto.createHash('sha1').update(pageUrl).digest('hex').slice(0, 10);
  const file = `${hash}-${Date.now()}.png`;

  await fs.writeFile(path.join(config.screenshotDir, file), buffer);

  return {
    file,
    url: `${config.publicBaseUrl}/screenshots/${file}`,
    size: readPngSize(buffer),
  };
}

/**
 * Read width/height straight out of the PNG IHDR chunk.
 *
 * This is the authoritative page size: overlay coordinates are scaled against
 * the image the browser actually paints, so a disagreement between the DOM's
 * reported scrollHeight and the real screenshot would misalign every overlay.
 */
export function readPngSize(buffer: Buffer): { width: number; height: number } {
  const PNG_SIGNATURE = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw new Error('Screenshot is not a valid PNG');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/** Delete screenshots older than `maxAgeMs`. Called on boot to keep /tmp tidy. */
export async function pruneScreenshots(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  await ensureDir();

  const now = Date.now();
  let removed = 0;

  for (const file of await fs.readdir(config.screenshotDir)) {
    if (!file.endsWith('.png')) continue;
    const full = path.join(config.screenshotDir, file);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(full);
        removed++;
      }
    } catch {
      // Raced with another prune or an external delete; nothing to do.
    }
  }

  return removed;
}
