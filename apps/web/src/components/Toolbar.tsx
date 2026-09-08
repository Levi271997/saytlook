import { useStore, type Layers } from '../store.js';

const LAYERS: { key: keyof Layers; label: string; hint: string }[] = [
  { key: 'errors', label: 'Errors', hint: 'Outline every element a finding points at' },
  { key: 'headings', label: 'Headings', hint: 'Badge every H1-H6 on the page' },
  { key: 'spacing', label: 'Spacing', hint: 'Box model on hover, or vertical rhythm' },
  { key: 'figma', label: 'Design', hint: 'Overlay the uploaded Figma export' },
];

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1] as const;

/** Layer toggles and stage zoom - the controls that apply to the Stage itself. */
export function Toolbar() {
  const layers = useStore((state) => state.layers);
  const toggleLayer = useStore((state) => state.toggleLayer);
  const zoom = useStore((state) => state.zoom);
  const setZoom = useStore((state) => state.setZoom);
  const spacingMode = useStore((state) => state.spacingMode);
  const setSpacingMode = useStore((state) => state.setSpacingMode);
  const overlay = useStore((state) => state.overlay);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
      <div className="flex items-center gap-1">
        {LAYERS.map((layer) => (
          <button
            key={layer.key}
            type="button"
            onClick={() => toggleLayer(layer.key)}
            title={layer.hint}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              layers[layer.key] ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {layer.label}
          </button>
        ))}
      </div>

      {layers.spacing && (
        <div className="flex items-center gap-1 border-l border-slate-800 pl-3">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Spacing</span>
          {(['hover', 'rhythm'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSpacingMode(mode)}
              className={`rounded px-2 py-1 text-xs transition ${
                spacingMode === mode ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
              title={
                mode === 'hover'
                  ? 'Hover an element to see its margins and padding'
                  : 'Label the gap between every consecutive block in the main column'
              }
            >
              {mode === 'hover' ? 'Box model' : 'Vertical rhythm'}
            </button>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Zoom</span>
        <button
          type="button"
          onClick={() => setZoom('fit')}
          className={`rounded px-2 py-1 text-xs transition ${
            zoom === 'fit' ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          Fit
        </button>
        {ZOOM_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setZoom(level)}
            className={`rounded px-2 py-1 text-xs tabular-nums transition ${
              zoom === level ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {level * 100}%
          </button>
        ))}
      </div>

      {layers.figma && overlay.imageUrl && (
        <span className="text-[11px] text-slate-500">
          Offset {Math.round(overlay.offsetX)}, {Math.round(overlay.offsetY)} - arrows nudge
        </span>
      )}
    </div>
  );
}
