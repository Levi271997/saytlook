import { headingColor } from '@digitalfeet/analyzer';
import { useStore } from '../store.js';

/**
 * Feature 3: a labelled badge on every heading, colour-coded by level.
 *
 * Rendered inside the Stage's page layer, so all coordinates here are raw
 * full-page pixels. Only the badge itself is counter-scaled, so it stays
 * legible at any zoom.
 */
export function HeadingOverlay({ scale }: { scale: number }) {
  const snapshot = useStore((state) => state.snapshot);
  const selectFinding = useStore((state) => state.selectFinding);

  if (!snapshot) return null;

  return (
    <>
      {snapshot.headings.map((heading) => {
        const color = headingColor(heading.level);

        return (
          <div
            key={heading.id}
            className="absolute"
            style={{
              left: heading.box.x,
              top: heading.box.y,
              width: heading.box.width,
              height: heading.box.height,
              outline: `${1 / scale}px dashed ${color}`,
              backgroundColor: `${color}14`,
            }}
          >
            <button
              type="button"
              className="pointer-events-auto absolute left-0 top-0 cursor-pointer whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-tight text-white shadow"
              style={{
                backgroundColor: color,
                // Counter the page layer's scale so the badge is a constant
                // size on screen, then lift it clear of the heading box.
                transform: `scale(${1 / scale}) translateY(-100%)`,
                transformOrigin: 'top left',
              }}
              title={heading.text || '(empty heading)'}
              onClick={() =>
                selectFinding({
                  id: `heading-badge-${heading.id}`,
                  category: 'heading',
                  severity: 'info',
                  message: `H${heading.level}: ${heading.text || '(empty)'}`,
                  elementIds: [heading.id],
                })
              }
            >
              H{heading.level}
            </button>
          </div>
        );
      })}
    </>
  );
}
