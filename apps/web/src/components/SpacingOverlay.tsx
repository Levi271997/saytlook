import { boxModelOf, computeVerticalRhythm, formatPx, type SpacingGap } from '@digitalfeet/analyzer';
import { useMemo } from 'react';
import { elementMap, useStore } from '../store.js';

/**
 * Feature 4: pixel spacing drawn onto the page.
 *
 * Two modes - hover an element to see its box model as labelled dimension
 * lines, or switch on vertical rhythm to label the gap between every
 * consecutive block down the main content column.
 *
 * Lives inside the Stage's page layer, so every coordinate is a full-page pixel.
 */
export function SpacingOverlay({ scale }: { scale: number }) {
  const snapshot = useStore((state) => state.snapshot);
  const mode = useStore((state) => state.spacingMode);
  const hoveredElementId = useStore((state) => state.hoveredElementId);

  const elements = useMemo(() => elementMap(snapshot), [snapshot]);
  const rhythm = useMemo(
    () => (snapshot && mode === 'rhythm' ? computeVerticalRhythm(snapshot) : []),
    [snapshot, mode],
  );

  if (!snapshot) return null;

  if (mode === 'rhythm') {
    return (
      <>
        {rhythm.map((gap) => (
          <DimensionLine key={gap.id} gap={gap} scale={scale} />
        ))}
      </>
    );
  }

  const hovered = hoveredElementId ? elements.get(hoveredElementId) : undefined;
  if (!hovered) return null;

  return <BoxModel elementId={hovered.id} scale={scale} />;
}

/** A gap drawn as a dimension line with caps and a px label. */
function DimensionLine({ gap, scale }: { gap: SpacingGap; scale: number }) {
  const thickness = 1 / scale;
  const capLength = 10 / scale;
  const vertical = gap.orientation === 'vertical';

  return (
    <>
      <div
        className="absolute bg-emerald-400"
        style={
          vertical
            ? {
                left: gap.line.x1 - thickness / 2,
                top: gap.line.y1,
                width: thickness,
                height: Math.max(thickness, gap.line.y2 - gap.line.y1),
              }
            : {
                left: gap.line.x1,
                top: gap.line.y1 - thickness / 2,
                width: Math.max(thickness, gap.line.x2 - gap.line.x1),
                height: thickness,
              }
        }
      />

      {/* End caps, so a zero-ish gap is still visible as a mark. */}
      {[vertical ? gap.line.y1 : gap.line.x1, vertical ? gap.line.y2 : gap.line.x2].map((position, i) => (
        <div
          key={i}
          className="absolute bg-emerald-400"
          style={
            vertical
              ? { left: gap.line.x1 - capLength / 2, top: position, width: capLength, height: thickness }
              : { left: position, top: gap.line.y1 - capLength / 2, width: thickness, height: capLength }
          }
        />
      ))}

      <Label x={gap.labelAt.x} y={gap.labelAt.y} scale={scale} tone="emerald">
        {gap.label}
      </Label>
    </>
  );
}

/** Margin and padding bands with a labelled value on each non-zero side. */
function BoxModel({ elementId, scale }: { elementId: string; scale: number }) {
  const snapshot = useStore((state) => state.snapshot);
  const element = snapshot?.elements.find((candidate) => candidate.id === elementId);
  if (!element) return null;

  const model = boxModelOf(element);
  const { margins, paddings, marginBox, borderBox, contentBox } = model;

  return (
    <>
      {/* Margin band */}
      <div
        className="absolute border border-dashed border-orange-400/70 bg-orange-400/15"
        style={{
          left: marginBox.x,
          top: marginBox.y,
          width: marginBox.width,
          height: marginBox.height,
          borderWidth: 1 / scale,
        }}
      />
      {/* The element itself */}
      <div
        className="absolute border border-sky-400"
        style={{
          left: borderBox.x,
          top: borderBox.y,
          width: borderBox.width,
          height: borderBox.height,
          borderWidth: 1 / scale,
        }}
      />
      {/* Padding band */}
      <div
        className="absolute bg-sky-400/15"
        style={{
          left: contentBox.x,
          top: contentBox.y,
          width: contentBox.width,
          height: contentBox.height,
        }}
      />

      {margins.top > 0 && (
        <Label x={borderBox.x + borderBox.width / 2} y={borderBox.y - margins.top / 2} scale={scale} tone="orange">
          {formatPx(margins.top)}
        </Label>
      )}
      {margins.bottom > 0 && (
        <Label
          x={borderBox.x + borderBox.width / 2}
          y={borderBox.y + borderBox.height + margins.bottom / 2}
          scale={scale}
          tone="orange"
        >
          {formatPx(margins.bottom)}
        </Label>
      )}
      {margins.left > 0 && (
        <Label x={borderBox.x - margins.left / 2} y={borderBox.y + borderBox.height / 2} scale={scale} tone="orange">
          {formatPx(margins.left)}
        </Label>
      )}
      {margins.right > 0 && (
        <Label
          x={borderBox.x + borderBox.width + margins.right / 2}
          y={borderBox.y + borderBox.height / 2}
          scale={scale}
          tone="orange"
        >
          {formatPx(margins.right)}
        </Label>
      )}

      {paddings.top > 0 && (
        <Label x={borderBox.x + borderBox.width / 2} y={borderBox.y + paddings.top / 2} scale={scale} tone="sky">
          {formatPx(paddings.top)}
        </Label>
      )}
      {paddings.bottom > 0 && (
        <Label
          x={borderBox.x + borderBox.width / 2}
          y={borderBox.y + borderBox.height - paddings.bottom / 2}
          scale={scale}
          tone="sky"
        >
          {formatPx(paddings.bottom)}
        </Label>
      )}
      {paddings.left > 0 && (
        <Label x={borderBox.x + paddings.left / 2} y={borderBox.y + borderBox.height / 2} scale={scale} tone="sky">
          {formatPx(paddings.left)}
        </Label>
      )}
      {paddings.right > 0 && (
        <Label
          x={borderBox.x + borderBox.width - paddings.right / 2}
          y={borderBox.y + borderBox.height / 2}
          scale={scale}
          tone="sky"
        >
          {formatPx(paddings.right)}
        </Label>
      )}

      <Label x={borderBox.x} y={borderBox.y} scale={scale} tone="slate" anchor="corner">
        {`<${element.tag}> ${Math.round(borderBox.width)} x ${Math.round(borderBox.height)}`}
      </Label>
    </>
  );
}

const TONES = {
  emerald: 'bg-emerald-500 text-emerald-50',
  orange: 'bg-orange-500 text-orange-50',
  sky: 'bg-sky-500 text-sky-50',
  slate: 'bg-slate-800 text-slate-100',
} as const;

/**
 * A label anchored at a page coordinate but drawn at a constant screen size.
 * The inverse scale keeps it readable whether the stage is at 25% or 100%.
 */
function Label({
  x,
  y,
  scale,
  tone,
  anchor = 'center',
  children,
}: {
  x: number;
  y: number;
  scale: number;
  tone: keyof typeof TONES;
  anchor?: 'center' | 'corner';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight shadow ${TONES[tone]}`}
      style={{
        left: x,
        top: y,
        transform:
          anchor === 'center'
            ? `scale(${1 / scale}) translate(-50%, -50%)`
            : `scale(${1 / scale}) translateY(-100%)`,
        transformOrigin: 'top left',
      }}
    >
      {children}
    </div>
  );
}
