import { createRequire } from 'node:module';
import type { PageSnapshot } from '@digitalfeet/analyzer';
import { chromium, type Browser, type Page } from 'playwright';
import { config, DEFAULT_VIEWPORT } from './config.js';
import { autoScrollPage, collectAxeResults, extractSnapshotData } from './extract.js';
import { checkImages } from './imageCheck.js';
import { saveScreenshot } from './storage.js';

const require = createRequire(import.meta.url);

export interface RenderRequest {
  url: string;
  viewport?: { width: number; height: number };
  /** Skip the axe-core pass (it is the slowest step) when only overlays are needed. */
  runAxe?: boolean;
  /** Skip the image HEAD pass. */
  checkImageStatus?: boolean;
}

/**
 * One Chromium instance is reused across requests - this is an internal tool
 * for a handful of developers, not a browser farm.
 */
let browserPromise: Promise<Browser> | undefined;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--font-render-hinting=none'],
      })
      .catch((error: unknown) => {
        // Without this the rejected promise stays cached and every later render
        // fails too - including after the missing browser has been installed.
        browserPromise = undefined;
        throw error;
      });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = undefined;
  await browser.close();
}

/**
 * Render a URL and return the full `PageSnapshot` the whole app draws from:
 * a full-page screenshot plus every element box and computed style, all in
 * full-page coordinates.
 */
export async function renderSnapshot(request: RenderRequest): Promise<PageSnapshot> {
  const url = normalizeUrl(request.url);
  const viewport = request.viewport ?? { ...DEFAULT_VIEWPORT };
  const warnings: string[] = [];

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport,
    // deviceScaleFactor 1 keeps screenshot pixels equal to CSS pixels, which is
    // what makes the snapshot boxes line up with the image without extra maths.
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    await shimBundlerHelpers(page);
    await gotoWithFallback(page, url, warnings);
    await settlePage(page, warnings);

    const buffer = await page.screenshot({ fullPage: true, type: 'png' });
    const screenshot = await saveScreenshot(url, buffer);

    // Extraction stamps data-dfqa-id on every element; axe runs after so it can
    // resolve its selector targets back to those ids.
    const extracted = await page.evaluate(extractSnapshotData, { maxElements: config.maxElements });

    if (extracted.truncated) {
      warnings.push(`Page exceeded the ${config.maxElements}-element cap; deeper elements were not captured.`);
    }
    if (screenshot.size.height < extracted.pageSize.height - 2) {
      warnings.push(
        `Screenshot is ${screenshot.size.height}px tall but the document is ${Math.round(
          extracted.pageSize.height,
        )}px; the page may exceed Chromium's capture limit.`,
      );
    }

    const axeResults = request.runAxe === false ? [] : await runAxe(page, warnings);

    const images =
      request.checkImageStatus === false ? extracted.images : await checkImages(extracted.images, page.url());

    return {
      url: page.url(),
      capturedAt: new Date().toISOString(),
      viewport: extracted.viewport,
      screenshot: screenshot.url,
      // The PNG is what the Stage scales, so its dimensions define the space.
      pageSize: screenshot.size,
      elements: extracted.elements,
      headings: extracted.headings,
      images,
      axeResults,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } finally {
    await context.close();
  }
}

/**
 * Playwright serializes an evaluated function to source and runs it in the
 * page. esbuild - which `tsx` uses in dev - compiles functions with a
 * `__name(fn, "name")` wrapper to preserve names, and that helper only exists
 * in the module scope back here, so the serialized source throws
 * `__name is not defined` inside the browser.
 *
 * Defining an identity `__name` in the page before any evaluate runs makes the
 * extraction work under both `tsx` (dev) and plain `tsc` output (build).
 */
async function shimBundlerHelpers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    scope.__name ??= (fn: unknown) => fn;
  });
}

/**
 * `networkidle` is the ideal signal but never fires on pages with polling or
 * long-lived connections, so we commit on `domcontentloaded` and treat idle as
 * best-effort.
 */
async function gotoWithFallback(page: Page, url: string, warnings: string[]): Promise<void> {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: config.renderTimeoutMs,
  });

  if (response && !response.ok()) {
    warnings.push(`Page responded with HTTP ${response.status()}.`);
  }

  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
    warnings.push('Page never reached network idle; captured after a 15s wait.');
  });
}

/** Trigger lazy loads, let fonts land, then measure from a settled layout. */
async function settlePage(page: Page, warnings: string[]): Promise<void> {
  await page.evaluate(autoScrollPage).catch(() => {
    warnings.push('Auto-scroll failed; lazy-loaded content may be missing.');
  });

  await page
    .evaluate(() => document.fonts?.ready.then(() => undefined))
    .catch(() => {
      warnings.push('Fonts did not finish loading; typography measurements may be off.');
    });

  await page.waitForTimeout(400);
}

async function runAxe(page: Page, warnings: string[]) {
  try {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    return await page.evaluate(collectAxeResults);
  } catch (error) {
    warnings.push(`axe-core did not run: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/** Accept `example.com` as readily as a full URL - this is a paste-a-URL tool. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error('A URL is required');

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`Not a valid URL: ${input}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  return parsed.toString();
}
