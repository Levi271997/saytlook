import { analyzeHeadings, buildHeadingOutline, headingColor, type HeadingOutlineNode } from '@digitalfeet/analyzer';
import { useMemo } from 'react';
import { useStore } from '../store.js';

/**
 * Feature 3's side panel: the heading outline as a tree, plus the structure
 * warnings from the analyzer.
 */
export function HeadingPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const selectFinding = useStore((state) => state.selectFinding);
  const selectedFindingId = useStore((state) => state.selectedFindingId);

  const outline = useMemo(() => (snapshot ? buildHeadingOutline(snapshot.headings) : []), [snapshot]);
  const warnings = useMemo(() => (snapshot ? analyzeHeadings(snapshot) : []), [snapshot]);

  if (!snapshot) {
    return <p className="p-4 text-sm text-slate-500">Render a page to see its heading outline.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      {warnings.length > 0 && (
        <div className="border-b border-slate-800 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Structure warnings ({warnings.length})
          </h3>
          <ul className="space-y-1.5">
            {warnings.map((warning) => (
              <li key={warning.id}>
                <button
                  type="button"
                  onClick={() => selectFinding(warning)}
                  className={`w-full rounded border px-2 py-1.5 text-left text-xs leading-snug transition ${
                    selectedFindingId === warning.id
                      ? 'border-sky-500 bg-sky-500/10 text-slate-200'
                      : 'border-slate-800 text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  {warning.message}
                  {warning.details && <span className="mt-0.5 block text-slate-500">{warning.details}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Outline ({snapshot.headings.length} headings)
        </h3>

        {outline.length === 0 ? (
          <p className="text-sm text-slate-500">This page has no headings at all.</p>
        ) : (
          <OutlineList nodes={outline} depth={0} />
        )}
      </div>
    </div>
  );
}

function OutlineList({ nodes, depth }: { nodes: HeadingOutlineNode[]; depth: number }) {
  const selectFinding = useStore((state) => state.selectFinding);

  return (
    <ul className={depth > 0 ? 'ml-3 border-l border-slate-800 pl-2' : ''}>
      {nodes.map((node) => (
        <li key={node.heading.id} className="py-0.5">
          <button
            type="button"
            className="flex w-full items-start gap-2 rounded px-1 py-1 text-left hover:bg-slate-800/60"
            onClick={() =>
              selectFinding({
                id: `heading-outline-${node.heading.id}`,
                category: 'heading',
                severity: 'info',
                message: `H${node.heading.level}: ${node.heading.text || '(empty)'}`,
                elementIds: [node.heading.id],
              })
            }
          >
            <span
              className="mt-0.5 shrink-0 rounded px-1 text-[10px] font-bold text-white"
              style={{ backgroundColor: headingColor(node.heading.level) }}
            >
              H{node.heading.level}
            </span>
            <span className="min-w-0 truncate text-xs text-slate-300">
              {node.heading.text || <em className="text-red-400">(empty heading)</em>}
            </span>
          </button>

          {node.children.length > 0 && <OutlineList nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}
