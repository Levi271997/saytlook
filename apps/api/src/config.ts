import 'dotenv/config';
import path from 'node:path';

function num(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const screenshotDir = process.env.SCREENSHOT_DIR ?? '.data/screenshots';

export const config = {
  port: num(process.env.PORT, 8787),

  /** Absolute path screenshots are written to. */
  screenshotDir: path.isAbsolute(screenshotDir) ? screenshotDir : path.resolve(process.cwd(), screenshotDir),

  /** Used to build absolute screenshot URLs the frontend can load. */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://localhost:${num(process.env.PORT, 8787)}`).replace(/\/$/, ''),

  renderTimeoutMs: num(process.env.RENDER_TIMEOUT_MS, 45_000),
  maxElements: num(process.env.MAX_ELEMENTS, 4000),

  /** Optional free third-party APIs. Endpoints are configurable, never hardcoded. */
  nuValidatorUrl: process.env.NU_VALIDATOR_URL ?? 'https://validator.w3.org/nu/',
  languageToolUrl: process.env.LANGUAGETOOL_URL ?? 'https://api.languagetool.org/v2/check',
  languageToolLang: process.env.LANGUAGETOOL_LANG ?? 'en-US',
} as const;

export const DEFAULT_VIEWPORT = { width: 1440, height: 900 } as const;

/** Presets behind the responsive-check switcher in the web app. */
export const VIEWPORT_PRESETS = [
  { label: 'Mobile', width: 375, height: 812 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Desktop', width: 1440, height: 900 },
] as const;
