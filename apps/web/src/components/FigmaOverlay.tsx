import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store.js';

/**
 * Feature 1: the uploaded design image, laid over the rendered page.
 *
 * This is the one overlay that does *not* live inside the Stage's transformed
 * page layer. A CSS transform on an ancestor creates a new stacking context,
 * and `mix-blend-mode: difference` would then blend against that layer instead
 * of against the screenshot - which is exactly the comparison we want. So the
 * offsets are stored in full-page pixels like everything else and converted to
 * display pixels once, here.
 */
export function FigmaOverlay({
  scale,
  pageSize,
}: {
  scale: number;
  pageSize: { width: number; height: number };
}) {
  const overlay = useStore((state) => state.overlay);
  const setOverlay = useStore((state) => state.setOverlay);
  const nudgeOverlay = useStore((state) => state.nudgeOverlay);

  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number }>();

  // Arrow keys nudge 1px, shift+arrow 10px - in page pixels, so a nudge means
  // the same thing whatever the stage zoom is.
  useEffect(() => {
    if (!overlay.imageUrl) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const step = event.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };

      const move = moves[event.key];
      if (!move) return;

      event.preventDefault();
      nudgeOverlay(move[0], move[1]);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlay.imageUrl, nudgeOverlay]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: overlay.offsetX,
        originY: overlay.offsetY,
      };
    },
    [overlay.offsetX, overlay.offsetY],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      const drag = dragState.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      // Screen delta back into page pixels.
      setOverlay({
        offsetX: drag.originX + (event.clientX - drag.startX) / scale,
        offsetY: drag.originY + (event.clientY - drag.startY) / scale,
      });
    },
    [scale, setOverlay],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLImageElement>) => {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = undefined;
  }, []);

  if (!overlay.imageUrl || !overlay.visible) return null;

  // scale 1 means fit-to-width; the height follows the image's aspect ratio.
  const displayWidth = pageSize.width * overlay.scale * scale;

  return (
    <>
      <img
        src={overlay.imageUrl}
        alt={overlay.imageName ?? 'Design overlay'}
        className="absolute left-0 top-0 max-w-none cursor-move select-none"
        draggable={false}
        style={{
          width: displayWidth,
          transform: `translate(${overlay.offsetX * scale}px, ${overlay.offsetY * scale}px)`,
          opacity: overlay.opacity,
          mixBlendMode: overlay.blend,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {overlay.diffMaskUrl && overlay.diffRegion && (
        <img
          src={overlay.diffMaskUrl}
          alt="Pixel difference mask"
          className="pointer-events-none absolute max-w-none select-none"
          style={{
            left: overlay.diffRegion.x * scale,
            top: overlay.diffRegion.y * scale,
            width: overlay.diffRegion.width * scale,
            height: overlay.diffRegion.height * scale,
          }}
        />
      )}
    </>
  );
}
