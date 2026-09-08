import type { ElementNode } from '@digitalfeet/analyzer';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { elementMap, useStore } from '../store.js';
import { ErrorOverlay } from './ErrorOverlay.js';
import { FigmaOverlay } from './FigmaOverlay.js';
import { HeadingOverlay } from './HeadingOverlay.js';
import { SpacingOverlay } from './SpacingOverlay.js';

/**
 * The base layer everything draws on: the full-page screenshot, scaled to fit,
 * with every overlay positioned in full-page pixel space above it.
 *
 * The coordinate rule for the whole app lives here. The screenshot is displayed
 * at `pageSize * scale`, and overlays render inside a layer that is sized in
 * raw page pixels and then CSS-transformed by the same `scale`. Overlay code
 * therefore only ever deals in snapshot coordinates - it never multiplies by
 * the scale itself.
 */
export function Stage() {
  const snapshot = useStore((state) => state.snapshot);
  const loading = useStore((state) => state.loading);
  const error = useStore((state) => state.error);
  const zoom = useStore((state) => state.zoom);
  const layers = useStore((state) => state.layers);
  const overlay = useStore((state) => state.overlay);
  const spacingMode = useStore((state) => state.spacingMode);
  const focusedElementIds = useStore((state) => state.focusedElementIds);
  const focusNonce = useStore((state) => state.focusNonce);
  const setHoveredElement = useStore((state) => state.setHoveredElement);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const elements = useMemo(() => elementMap(snapshot), [snapshot]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setContainerWidth(node.clientWidth);

    return () => observer.disconnect();
  }, []);

  const pageSize = snapshot?.pageSize ?? { width: 1, height: 1 };
  const sideBySide = layers.figma && overlay.view === 'side-by-side' && overlay.imageUrl !== null;

  // In side-by-side the screenshot only gets half the width, so fit accordingly.
  const available = Math.max(0, (containerWidth - 48) / (sideBySide ? 2 : 1));
  const fitScale = available > 0 ? available / pageSize.width : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;

  // Scroll the first focused element into view whenever a finding is clicked.
  useEffect(() => {
    if (focusedElementIds.length === 0 || !snapshot) return;
    const node = scrollRef.current;
    if (!node) return;

    const boxes = focusedElementIds
      .map((id) => elements.get(id)?.box)
      .filter((box): box is NonNullable<typeof box> => box !== undefined);
    if (boxes.length === 0) return;

    const top = Math.min(...boxes.map((box) => box.y));
    node.scrollTo({ top: Math.max(0, top * scale - node.clientHeight / 3), behavior: 'smooth' });
  }, [focusNonce, focusedElementIds, elements, scale, snapshot]);

  /**
   * Hit-test the element under the cursor for the spacing inspector. Testing
   * against the snapshot boxes beats rendering a hover target per element -
   * a real page can carry thousands.
   */
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!snapshot || !layers.spacing || spacingMode !== 'hover') return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / scale;
      const y = (event.clientY - bounds.top) / scale;

      setHoveredElement(smallestElementAt(snapshot.elements, x, y)?.id ?? null);
    },
    [snapshot, layers.spacing, spacingMode, scale, setHoveredElement],
  );

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div className="max-w-md">
          <h2 className="text-lg font-medium text-slate-300">
            {loading ? 'Rendering the page...' : 'Paste a URL to begin'}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {loading
              ? 'Navigating with Playwright, waiting for network idle, then capturing the full page.'
              : 'The page is rendered server-side and captured as a full-page screenshot. Every overlay is drawn from the element boxes in that same capture.'}
          </p>
          {error && (
            <p className="mt-4 rounded border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
        </div>
      </div>
    );
  }

  const displayWidth = pageSize.width * scale;
  const displayHeight = pageSize.height * scale;

  return (
    <div ref={scrollRef} className="stage-scroll h-full overflow-auto bg-slate-900 p-6">
      {error && (
        <p className="mb-4 rounded border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className={sideBySide ? 'flex items-start gap-4' : ''}>
        <div
          className="relative shrink-0 bg-white shadow-2xl shadow-black/40"
          style={{ width: displayWidth, height: displayHeight }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredElement(null)}
        >
          <img
            src={snapshot.screenshot}
            alt={`Full-page render of ${snapshot.url}`}
            className="block h-full w-full select-none"
            draggable={false}
          />

          {/*
            The design overlay sits directly beside the screenshot in the same
            stacking context - a CSS transform on an ancestor would create a new
            one and stop `mix-blend-mode: difference` blending against the page.
          */}
          {layers.figma && overlay.view === 'overlay' && <FigmaOverlay scale={scale} pageSize={pageSize} />}

          <PageLayer scale={scale} pageSize={pageSize}>
            {layers.errors && <ErrorOverlay />}
            {layers.spacing && <SpacingOverlay scale={scale} />}
            {layers.headings && <HeadingOverlay scale={scale} />}
            <FocusHighlights ids={focusedElementIds} elements={elements} scale={scale} />
          </PageLayer>
        </div>

        {sideBySide && overlay.imageUrl && (
          <div className="shrink-0 bg-white shadow-2xl shadow-black/40" style={{ width: displayWidth }}>
            <img src={overlay.imageUrl} alt="Uploaded design" className="block w-full select-none" draggable={false} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hosts overlays in raw page coordinates. Sized in page pixels and scaled as a
 * whole, so children never convert coordinates themselves.
 */
function PageLayer({
  scale,
  pageSize,
  children,
}: {
  scale: number;
  pageSize: { width: number; height: number };
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 origin-top-left"
      style={{ width: pageSize.width, height: pageSize.height, transform: `scale(${scale})` }}
    >
      {children}
    </div>
  );
}

/** The pulsing outline shown when a finding is clicked in the panel. */
function FocusHighlights({
  ids,
  elements,
  scale,
}: {
  ids: string[];
  elements: Map<string, ElementNode>;
  scale: number;
}) {
  if (ids.length === 0) return null;

  return (
    <>
      {ids.map((id) => {
        const element = elements.get(id);
        if (!element) return null;

        return (
          <div
            key={id}
            className="finding-flash absolute border-2 border-sky-400 bg-sky-400/20"
            style={{
              left: element.box.x,
              top: element.box.y,
              width: element.box.width,
              height: element.box.height,
              // Keep the outline one screen pixel thick at any zoom.
              borderWidth: 2 / scale,
            }}
          />
        );
      })}
    </>
  );
}

/**
 * The deepest, smallest box containing the point - the element a developer
 * means when they hover, rather than the page wrapper that also contains it.
 */
function smallestElementAt(elements: ElementNode[], x: number, y: number): ElementNode | undefined {
  let best: ElementNode | undefined;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const element of elements) {
    const { box } = element;
    if (box.width <= 0 || box.height <= 0) continue;
    if (x < box.x || x > box.x + box.width) continue;
    if (y < box.y || y > box.y + box.height) continue;

    const area = box.width * box.height;
    if (area < bestArea) {
      best = element;
      bestArea = area;
    }
  }

  return best;
}
