import type { Severity } from '@digitalfeet/analyzer';
import { useMemo } from 'react';
import { useAllFindings, useStore } from '../store.js';

const SEVERITY_COLOR: Record<Severity, string> = {
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#38bdf8',
};

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Feature 2's Stage half: a thin outline on every element a finding points at,
 * coloured by severity. Clicking a row in the ErrorPanel adds the pulsing
 * highlight on top of this (see Stage's FocusHighlights).
 *
 * Drawn inside the page layer, so coordinates are full-page pixels.
 */
export function ErrorOverlay() {
  const snapshot = useStore((state) => state.snapshot);
  const findings = useAllFindings();
  const selectFinding = useStore((state) => state.selectFinding);

  /** An element can be hit by several findings; the worst one wins the colour. */
  const worstByElement = useMemo(() => {
    const map = new Map<string, Severity>();

    for (const finding of findings) {
      for (const id of finding.elementIds) {
        const current = map.get(id);
        if (!current || SEVERITY_RANK[finding.severity] < SEVERITY_RANK[current]) {
          map.set(id, finding.severity);
        }
      }
    }

    return map;
  }, [findings]);

  const findingByElement = useMemo(() => {
    const map = new Map<string, (typeof findings)[number]>();
    for (const finding of findings) {
      for (const id of finding.elementIds) {
        if (!map.has(id)) map.set(id, finding);
      }
    }
    return map;
  }, [findings]);

  if (!snapshot) return null;

  return (
    <>
      {[...worstByElement.entries()].map(([id, severity]) => {
        const element = snapshot.elements.find((candidate) => candidate.id === id);
        if (!element) return null;

        const color = SEVERITY_COLOR[severity];
        const finding = findingByElement.get(id);

        return (
          <button
            key={id}
            type="button"
            className="pointer-events-auto absolute cursor-pointer"
            style={{
              left: element.box.x,
              top: element.box.y,
              width: element.box.width,
              height: element.box.height,
              outline: `2px solid ${color}`,
              backgroundColor: `${color}1f`,
            }}
            title={finding?.message}
            onClick={() => finding && selectFinding(finding)}
          />
        );
      })}
    </>
  );
}
