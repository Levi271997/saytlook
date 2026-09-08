import { useCallback, useRef, useState } from 'react';
import { computeDiff } from '../lib/diff.js';
import { useStore, type BlendMode, type StageView } from '../store.js';

const BLEND_MODES: { value: BlendMode; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Plain overlay at the chosen opacity' },
  { value: 'difference', label: 'Difference', hint: 'Onion-skin: matching pixels go black' },
  { value: 'multiply', label: 'Multiply', hint: 'Darkens where both layers have ink' },
];

/**
 * Feature 1's controls: load a Figma export, then align it against the render.
 *
 * No Figma API - a PNG/JPG export of the frame, per the scoping decision.
 */
export function DesignPanel() {
  const overlay = useStore((state) => state.overlay);
  const setOverlay = useStore((state) => state.setOverlay);
  const loadDesignImage = useStore((state) => state.loadDesignImage);
  const clearDesignImage = useStore((state) => state.clearDesignImage);
  const snapshot = useStore((state) => state.snapshot);

  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [diffing, setDiffing] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const accept = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;

      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        setDiffError('Upload a PNG, JPG or WebP export of the Figma frame.');
        return;
      }

      setDiffError(null);
      loadDesignImage(file);
    },
    [loadDesignImage],
  );

  const runDiff = useCallback(async () => {
    if (!snapshot || !overlay.imageUrl) return;

    setDiffing(true);
    setDiffError(null);

    try {
      const result = await computeDiff({
        screenshotUrl: snapshot.screenshot,
        designUrl: overlay.imageUrl,
        pageSize: snapshot.pageSize,
        designScale: overlay.scale,
        offsetX: overlay.offsetX,
        offsetY: overlay.offsetY,
      });

      setOverlay({ diffScore: result.score, diffMaskUrl: result.maskUrl, diffRegion: result.region });
    } catch (error) {
      setDiffError(error instanceof Error ? error.message : String(error));
    } finally {
      setDiffing(false);
    }
  }, [snapshot, overlay.imageUrl, overlay.scale, overlay.offsetX, overlay.offsetY, setOverlay]);

  if (!overlay.imageUrl) {
    return (
      <div className="p-3">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            accept(event.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={`cursor-pointer rounded border-2 border-dashed p-6 text-center transition ${
            dragOver ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 hover:border-slate-600'
          }`}
        >
          <p className="text-sm text-slate-300">Drop a Figma export here</p>
          <p className="mt-1 text-xs text-slate-500">PNG, JPG or WebP - or click to browse</p>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => accept(event.target.files)}
        />

        {diffError && <p className="mt-2 text-xs text-red-400">{diffError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-slate-400" title={overlay.imageName ?? ''}>
          {overlay.imageName}
        </p>
        <button type="button" onClick={clearDesignImage} className="shrink-0 text-xs text-slate-500 hover:text-red-400">
          Remove
        </button>
      </div>

      <Toggle
        label="Show overlay"
        checked={overlay.visible}
        onChange={(visible) => setOverlay({ visible })}
      />

      <Segmented<StageView>
        label="View"
        value={overlay.view}
        options={[
          { value: 'overlay', label: 'Overlay' },
          { value: 'side-by-side', label: 'Side by side' },
        ]}
        onChange={(view) => setOverlay({ view })}
      />

      <Slider
        label="Opacity"
        value={Math.round(overlay.opacity * 100)}
        suffix="%"
        min={0}
        max={100}
        step={1}
        onChange={(value) => setOverlay({ opacity: value / 100 })}
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Blend mode</label>
        <select
          value={overlay.blend}
          onChange={(event) => setOverlay({ blend: event.target.value as BlendMode })}
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 focus:outline-none"
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">
          {BLEND_MODES.find((mode) => mode.value === overlay.blend)?.hint}
        </p>
      </div>

      <Slider
        label="Scale"
        value={Math.round(overlay.scale * 1000) / 10}
        suffix="%"
        min={10}
        max={200}
        step={0.1}
        onChange={(value) => setOverlay({ scale: value / 100 })}
      />
      <p className="-mt-3 text-[11px] text-slate-500">
        100% fits the design to the page width. Aspect ratio is always locked.
      </p>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-400">Offset</label>
          <button
            type="button"
            onClick={() => setOverlay({ offsetX: 0, offsetY: 0, scale: 1 })}
            className="text-xs text-slate-500 hover:text-sky-400"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={overlay.offsetX} onChange={(offsetX) => setOverlay({ offsetX })} />
          <NumberField label="Y" value={overlay.offsetY} onChange={(offsetY) => setOverlay({ offsetY })} />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Drag the design to move it. Arrow keys nudge 1px, shift+arrow 10px.
        </p>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => void runDiff()}
          disabled={diffing || !snapshot}
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {diffing ? 'Comparing...' : 'Compute diff score'}
        </button>

        {overlay.diffScore !== null && (
          <div className="mt-2 rounded border border-slate-800 bg-slate-900 p-2 text-center">
            <p className="text-2xl font-semibold text-slate-100">{overlay.diffScore.toFixed(2)}%</p>
            <p className="text-[11px] text-slate-500">of compared pixels differ</p>
            <button
              type="button"
              onClick={() => setOverlay({ diffMaskUrl: null, diffRegion: null, diffScore: null })}
              className="mt-1 text-[11px] text-slate-500 hover:text-sky-400"
            >
              Clear mask
            </button>
          </div>
        )}

        {diffError && <p className="mt-2 text-xs text-red-400">{diffError}</p>}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-sky-500"
      />
      {label}
    </label>
  );
}

function Slider({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-400">{label}</label>
        <span className="text-xs tabular-nums text-slate-300">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-sky-500"
      />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full bg-transparent text-sm tabular-nums text-slate-200 focus:outline-none"
      />
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      <div className="flex overflow-hidden rounded border border-slate-700">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 px-2 py-1.5 text-xs transition ${
              value === option.value ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
