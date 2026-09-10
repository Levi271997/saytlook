import type { AnalyzerOptions, Finding, PageSnapshot } from '@digitalfeet/analyzer';

export interface RenderResponse {
  snapshot: PageSnapshot;
  findings: Finding[];
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * In dev, Vite proxies `/api` and `/screenshots` to the API, so requests stay
 * same-origin. That matters for more than tidiness: the pixelmatch diff reads
 * screenshot pixels off a canvas, and a cross-origin image would taint it.
 */
const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL ?? '');

/**
 * Whether this build has an analysis backend behind it.
 *
 * Dev gets one from the Vite proxy; a production build only has one if
 * VITE_API_BASE_URL was set when it was built. The static GitHub Pages
 * deployment has neither, so the UI checks this to say so up front rather
 * than letting every action fail on a fetch to nowhere.
 */
export function isApiConfigured(): boolean {
  return import.meta.env.DEV || API_BASE.length > 0;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}`);
  }

  return payload as T;
}

/** Render a URL server-side and get back the snapshot plus its findings. */
export async function renderUrl(url: string, viewport: Viewport): Promise<RenderResponse> {
  const result = await post<RenderResponse>('/api/render', { url, viewport });
  return { ...result, snapshot: withLocalScreenshot(result.snapshot) };
}

/** Re-run the analyzers with different thresholds, without re-rendering. */
export async function reanalyze(
  snapshot: PageSnapshot,
  options?: Partial<AnalyzerOptions>,
): Promise<Finding[]> {
  const { findings } = await post<{ findings: Finding[] }>('/api/analyze', { snapshot, options });
  return findings;
}

/** Optional free pass: Nu HTML Checker. */
export async function validateHtml(url: string): Promise<Finding[]> {
  const { findings } = await post<{ findings: Finding[] }>('/api/validate-html', { url });
  return findings;
}

/** Optional free pass: LanguageTool. Rate-limited, so it is a manual action. */
export async function spellcheck(snapshot: PageSnapshot): Promise<Finding[]> {
  const { findings } = await post<{ findings: Finding[] }>('/api/spellcheck', { snapshot });
  return findings;
}

/**
 * Rewrite the API's absolute screenshot URL to a same-origin path so the dev
 * proxy serves it and the canvas stays untainted.
 */
function withLocalScreenshot(snapshot: PageSnapshot): PageSnapshot {
  const match = /\/screenshots\/[^/]+$/.exec(snapshot.screenshot);
  if (!match || !import.meta.env.DEV) return snapshot;
  return { ...snapshot, screenshot: match[0] };
}
