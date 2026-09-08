import type { ElementNode, Finding, PageSnapshot } from '@digitalfeet/analyzer';
import { useMemo } from 'react';
import { create } from 'zustand';
import { renderUrl, spellcheck, validateHtml, type Viewport } from './lib/api.js';
import type { DiffRegion } from './lib/diff.js';

export type BlendMode = 'normal' | 'difference' | 'multiply';
export type StageView = 'overlay' | 'side-by-side';
export type SpacingMode = 'hover' | 'rhythm';

export interface OverlaySettings {
  /** Object URL of the uploaded Figma export, or null when none is loaded. */
  imageUrl: string | null;
  imageName: string | null;
  visible: boolean;
  /** 0-1. */
  opacity: number;
  blend: BlendMode;
  /** 1 = fit the design to the page width. */
  scale: number;
  /** Offsets are stored in full-page pixels, like every other coordinate. */
  offsetX: number;
  offsetY: number;
  view: StageView;
  /** Percentage of differing pixels from the pixelmatch pass, once run. */
  diffScore: number | null;
  diffMaskUrl: string | null;
  /** Page-space rectangle the diff covered, so the mask can be positioned. */
  diffRegion: DiffRegion | null;
}

export interface Layers {
  headings: boolean;
  spacing: boolean;
  errors: boolean;
  figma: boolean;
}

export interface HistoryEntry {
  url: string;
  capturedAt: string;
  viewport: Viewport;
  snapshot: PageSnapshot;
  findings: Finding[];
}

const MAX_HISTORY = 8;

const INITIAL_OVERLAY: OverlaySettings = {
  imageUrl: null,
  imageName: null,
  visible: true,
  opacity: 0.5,
  blend: 'normal',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  view: 'overlay',
  diffScore: null,
  diffMaskUrl: null,
  diffRegion: null,
};

interface QAState {
  url: string;
  viewport: Viewport;
  loading: boolean;
  error: string | null;

  snapshot: PageSnapshot | null;
  findings: Finding[];
  /** Findings from the optional third-party passes, kept separate so a failed
   *  or rate-limited call never discards the main analyzer results. */
  extraFindings: Finding[];
  extraStatus: string | null;

  history: HistoryEntry[];

  layers: Layers;
  spacingMode: SpacingMode;
  zoom: number | 'fit';

  hoveredElementId: string | null;
  selectedFindingId: string | null;
  /** Elements the Stage should flash and scroll to. */
  focusedElementIds: string[];
  focusNonce: number;

  overlay: OverlaySettings;

  setUrl: (url: string) => void;
  setViewport: (viewport: Viewport) => void;
  render: () => Promise<void>;
  restore: (entry: HistoryEntry) => void;

  toggleLayer: (layer: keyof Layers) => void;
  setSpacingMode: (mode: SpacingMode) => void;
  setZoom: (zoom: number | 'fit') => void;

  setHoveredElement: (id: string | null) => void;
  selectFinding: (finding: Finding | null) => void;

  setOverlay: (patch: Partial<OverlaySettings>) => void;
  loadDesignImage: (file: File) => void;
  clearDesignImage: () => void;
  nudgeOverlay: (dx: number, dy: number) => void;

  runHtmlValidation: () => Promise<void>;
  runSpellcheck: () => Promise<void>;
  clearExtraFindings: () => void;
}

export const useStore = create<QAState>((set, get) => ({
  url: '',
  viewport: { width: 1440, height: 900 },
  loading: false,
  error: null,

  snapshot: null,
  findings: [],
  extraFindings: [],
  extraStatus: null,

  history: [],

  layers: { headings: false, spacing: false, errors: true, figma: false },
  spacingMode: 'hover',
  zoom: 'fit',

  hoveredElementId: null,
  selectedFindingId: null,
  focusedElementIds: [],
  focusNonce: 0,

  overlay: { ...INITIAL_OVERLAY },

  setUrl: (url) => set({ url }),
  setViewport: (viewport) => set({ viewport }),

  render: async () => {
    const { url, viewport } = get();
    if (url.trim().length === 0) {
      set({ error: 'Enter a URL first.' });
      return;
    }

    set({ loading: true, error: null, extraFindings: [], extraStatus: null });

    try {
      const { snapshot, findings } = await renderUrl(url, viewport);

      set((state) => ({
        snapshot,
        findings,
        loading: false,
        selectedFindingId: null,
        focusedElementIds: [],
        // Re-rendering keeps the design overlay loaded but drops the stale diff.
        overlay: { ...state.overlay, diffScore: null, diffMaskUrl: null, diffRegion: null },
        history: [
          { url: snapshot.url, capturedAt: snapshot.capturedAt, viewport, snapshot, findings },
          ...state.history.filter((entry) => entry.capturedAt !== snapshot.capturedAt),
        ].slice(0, MAX_HISTORY),
      }));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  restore: (entry) =>
    set({
      url: entry.url,
      viewport: entry.viewport,
      snapshot: entry.snapshot,
      findings: entry.findings,
      extraFindings: [],
      extraStatus: null,
      error: null,
      selectedFindingId: null,
      focusedElementIds: [],
    }),

  toggleLayer: (layer) => set((state) => ({ layers: { ...state.layers, [layer]: !state.layers[layer] } })),
  setSpacingMode: (spacingMode) => set({ spacingMode }),
  setZoom: (zoom) => set({ zoom }),

  setHoveredElement: (hoveredElementId) => set({ hoveredElementId }),

  selectFinding: (finding) =>
    set((state) => ({
      selectedFindingId: finding?.id ?? null,
      focusedElementIds: finding?.elementIds ?? [],
      // Bumping the nonce re-triggers the scroll/flash even for the same finding.
      focusNonce: state.focusNonce + 1,
    })),

  setOverlay: (patch) => set((state) => ({ overlay: { ...state.overlay, ...patch } })),

  loadDesignImage: (file) => {
    const previous = get().overlay.imageUrl;
    if (previous) URL.revokeObjectURL(previous);

    set((state) => ({
      layers: { ...state.layers, figma: true },
      overlay: {
        ...state.overlay,
        imageUrl: URL.createObjectURL(file),
        imageName: file.name,
        visible: true,
        // A freshly loaded design starts fit-to-width and unshifted.
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        diffScore: null,
        diffMaskUrl: null,
        diffRegion: null,
      },
    }));
  },

  clearDesignImage: () => {
    const { imageUrl } = get().overlay;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    set((state) => ({
      layers: { ...state.layers, figma: false },
      overlay: { ...INITIAL_OVERLAY },
    }));
  },

  nudgeOverlay: (dx, dy) =>
    set((state) => ({
      overlay: {
        ...state.overlay,
        offsetX: state.overlay.offsetX + dx,
        offsetY: state.overlay.offsetY + dy,
      },
    })),

  runHtmlValidation: async () => {
    const snapshot = get().snapshot;
    if (!snapshot) return;

    set({ extraStatus: 'Running Nu HTML Checker...' });
    try {
      const findings = await validateHtml(snapshot.url);
      set((state) => ({
        extraFindings: [...state.extraFindings.filter((f) => !f.id.startsWith('nu-')), ...findings],
        extraStatus: `Nu HTML Checker: ${findings.length} message${findings.length === 1 ? '' : 's'}.`,
      }));
    } catch (error) {
      set({ extraStatus: error instanceof Error ? error.message : String(error) });
    }
  },

  runSpellcheck: async () => {
    const snapshot = get().snapshot;
    if (!snapshot) return;

    set({ extraStatus: 'Running LanguageTool...' });
    try {
      const findings = await spellcheck(snapshot);
      set((state) => ({
        extraFindings: [...state.extraFindings.filter((f) => !f.id.startsWith('lt-')), ...findings],
        extraStatus: `LanguageTool: ${findings.length} suggestion${findings.length === 1 ? '' : 's'}.`,
      }));
    } catch (error) {
      set({ extraStatus: error instanceof Error ? error.message : String(error) });
    }
  },

  clearExtraFindings: () => set({ extraFindings: [], extraStatus: null }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Every finding shown in the panel: analyzer results plus opt-in extras.
 *
 * This has to be a hook rather than a plain `useStore(selector)`: a selector
 * that builds a fresh array every call never compares equal to the previous
 * result, so zustand would re-render on a loop. Memoizing on the two source
 * arrays keeps the reference stable until one of them actually changes.
 */
export function useAllFindings(): Finding[] {
  const findings = useStore((state) => state.findings);
  const extraFindings = useStore((state) => state.extraFindings);

  return useMemo(
    () => (extraFindings.length === 0 ? findings : [...findings, ...extraFindings]),
    [findings, extraFindings],
  );
}

/** Count only - a primitive selector, so it is safe to read directly. */
export function useFindingCount(): number {
  return useStore((state) => state.findings.length + state.extraFindings.length);
}

/** Element lookup for overlays; the snapshot is a flat list. */
export function elementMap(snapshot: PageSnapshot | null): Map<string, ElementNode> {
  const map = new Map<string, ElementNode>();
  if (!snapshot) return map;
  for (const element of snapshot.elements) map.set(element.id, element);
  return map;
}
