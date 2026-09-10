import { isApiConfigured } from '../lib/api.js';

/**
 * Explains a backend-less build, as served by GitHub Pages.
 *
 * Pages hosts static files only, and every analysis path in this app goes
 * through the API's headless Chromium. Without this banner the Render button
 * would look live and simply fail, so name the limitation and the two ways
 * out of it.
 */
export function BackendNotice() {
  if (isApiConfigured()) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-900/60 bg-amber-950/40 px-4 py-2 text-xs leading-relaxed text-amber-200"
    >
      <span className="font-semibold text-amber-100">Preview build - no analysis backend.</span>{' '}
      Page rendering runs headless Chromium on a server, which GitHub Pages cannot host, so
      Render is disabled here. Run the full stack locally with{' '}
      <code className="rounded bg-amber-950/60 px-1 py-0.5 font-mono text-[11px]">pnpm dev</code>, or
      rebuild with{' '}
      <code className="rounded bg-amber-950/60 px-1 py-0.5 font-mono text-[11px]">
        VITE_API_BASE_URL
      </code>{' '}
      pointed at a hosted API.
    </div>
  );
}
