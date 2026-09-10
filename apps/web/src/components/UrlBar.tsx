import { useStore } from '../store.js';

/** Viewport presets - the responsive check from §6, riding on the same render. */
const VIEWPORTS = [
  { label: 'Mobile', width: 375, height: 812 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Desktop', width: 1440, height: 900 },
] as const;

export function UrlBar() {
  const url = useStore((state) => state.url);
  const setUrl = useStore((state) => state.setUrl);
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const render = useStore((state) => state.render);
  const loading = useStore((state) => state.loading);
  const snapshot = useStore((state) => state.snapshot);
  const history = useStore((state) => state.history);
  const restore = useStore((state) => state.restore);

  return (
    <header className="border-b border-slate-800 bg-slate-950 px-4 py-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void render();
        }}
      >
        <span className="mr-1 text-sm font-semibold text-slate-300">Saytlook QA</span>

        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://client-site.com/page"
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
        />

        <div className="flex overflow-hidden rounded border border-slate-700">
          {VIEWPORTS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setViewport({ width: preset.width, height: preset.height })}
              className={`px-2.5 py-1.5 text-xs transition ${
                viewport.width === preset.width
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
              title={`${preset.width} x ${preset.height}`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {loading ? 'Rendering...' : 'Render'}
        </button>

        {history.length > 0 && (
          <select
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            value=""
            onChange={(event) => {
              const entry = history.find((candidate) => candidate.capturedAt === event.target.value);
              if (entry) restore(entry);
            }}
            title="Earlier snapshots from this session"
          >
            <option value="">History ({history.length})</option>
            {history.map((entry) => (
              <option key={entry.capturedAt} value={entry.capturedAt}>
                {new Date(entry.capturedAt).toLocaleTimeString()} - {entry.viewport.width}px - {shortUrl(entry.url)}
              </option>
            ))}
          </select>
        )}
      </form>

      {snapshot && (
        <p className="mt-2 truncate text-xs text-slate-500">
          {snapshot.url} - captured {new Date(snapshot.capturedAt).toLocaleTimeString()} at {snapshot.viewport.width}x
          {snapshot.viewport.height} - page {snapshot.pageSize.width}x{snapshot.pageSize.height} -{' '}
          {snapshot.elements.length} elements, {snapshot.headings.length} headings, {snapshot.images.length} images
          {snapshot.warnings && snapshot.warnings.length > 0 && (
            <span className="text-amber-500" title={snapshot.warnings.join('\n')}>
              {' '}
              - {snapshot.warnings.length} capture warning{snapshot.warnings.length === 1 ? '' : 's'}
            </span>
          )}
        </p>
      )}
    </header>
  );
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').slice(0, 40);
}
