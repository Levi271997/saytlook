import { runAllAnalyzers, type PageSnapshot } from '@digitalfeet/analyzer';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config, DEFAULT_VIEWPORT, VIEWPORT_PRESETS } from './config.js';
import { closeBrowser, renderSnapshot } from './render.js';
import { pruneScreenshots } from './storage.js';
import { spellcheck, validateHtml } from './thirdParty.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// The Stage loads the base layer straight from here.
app.use('/screenshots', express.static(config.screenshotDir, { maxAge: '1h' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, viewports: VIEWPORT_PRESETS, defaultViewport: DEFAULT_VIEWPORT });
});

/**
 * The one endpoint everything hangs off: render a URL server-side and return
 * the snapshot plus the findings from the shared analyzer package.
 */
app.post('/api/render', asyncRoute(async (req, res) => {
  const { url, viewport, runAxe, checkImageStatus } = req.body ?? {};

  if (typeof url !== 'string' || url.trim().length === 0) {
    res.status(400).json({ error: 'Body must include a "url" string.' });
    return;
  }

  const snapshot = await renderSnapshot({
    url,
    viewport: parseViewport(viewport),
    runAxe: runAxe !== false,
    checkImageStatus: checkImageStatus !== false,
  });

  res.json({ snapshot, findings: runAllAnalyzers(snapshot) });
}));

/**
 * Re-run the analyzers over a snapshot the client already holds, with different
 * thresholds. Cheap, and it avoids a second Playwright render just to change
 * the max-font-families setting.
 */
app.post('/api/analyze', asyncRoute(async (req, res) => {
  const { snapshot, options } = req.body ?? {};

  if (!isSnapshot(snapshot)) {
    res.status(400).json({ error: 'Body must include a "snapshot" object.' });
    return;
  }

  res.json({ findings: runAllAnalyzers(snapshot, options) });
}));

/** Optional free third-party pass: Nu HTML Checker. */
app.post('/api/validate-html', asyncRoute(async (req, res) => {
  const { url } = req.body ?? {};

  if (typeof url !== 'string' || url.trim().length === 0) {
    res.status(400).json({ error: 'Body must include a "url" string.' });
    return;
  }

  res.json({ findings: await validateHtml(url) });
}));

/** Optional free third-party pass: LanguageTool. Rate-limited, hence opt-in. */
app.post('/api/spellcheck', asyncRoute(async (req, res) => {
  const { snapshot } = req.body ?? {};

  if (!isSnapshot(snapshot)) {
    res.status(400).json({ error: 'Body must include a "snapshot" object.' });
    return;
  }

  res.json({ findings: await spellcheck(snapshot) });
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[api]', message);
  res.status(500).json({ error: message });
});

function parseViewport(input: unknown): { width: number; height: number } | undefined {
  if (typeof input !== 'object' || input === null) return undefined;

  const { width, height } = input as { width?: unknown; height?: unknown };
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;

  return {
    width: clamp(Math.round(width), 320, 3840),
    height: clamp(Math.round(height), 320, 2160),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isSnapshot(value: unknown): value is PageSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as PageSnapshot).elements) &&
    typeof (value as PageSnapshot).pageSize === 'object'
  );
}

/** Express 4 does not forward async rejections, so wrap every async handler. */
function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

const server = app.listen(config.port, () => {
  console.log(`[api] listening on ${config.publicBaseUrl}`);
  console.log(`[api] screenshots -> ${config.screenshotDir}`);
  void pruneScreenshots().then((removed) => {
    if (removed > 0) console.log(`[api] pruned ${removed} screenshot(s) older than 24h`);
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(() => {
      void closeBrowser().finally(() => process.exit(0));
    });
  });
}

export { app };
