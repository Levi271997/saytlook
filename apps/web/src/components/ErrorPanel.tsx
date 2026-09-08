import type { Finding, FindingCategory, Severity } from '@digitalfeet/analyzer';
import { summarizeFindings } from '@digitalfeet/analyzer';
import { useMemo, useState } from 'react';
import { useAllFindings, useStore } from '../store.js';

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  typography: 'Typography',
  image: 'Broken images',
  alt: 'Alt text',
  'duplicate-text': 'Duplicated text',
  'duplicate-section': 'Duplicated sections',
  heading: 'Heading structure',
  spacing: 'Spacing',
  accessibility: 'Accessibility (axe-core)',
};

const SEVERITY_STYLES: Record<Severity, string> = {
  error: 'bg-red-500/15 text-red-300 border-red-500/40',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
};

/**
 * Feature 2's panel. Every row is clickable: selecting one flashes the
 * offending element on the Stage and scrolls it into view.
 */
export function ErrorPanel() {
  const findings = useAllFindings();
  const selectedFindingId = useStore((state) => state.selectedFindingId);
  const selectFinding = useStore((state) => state.selectFinding);
  const snapshot = useStore((state) => state.snapshot);
  const extraStatus = useStore((state) => state.extraStatus);
  const runHtmlValidation = useStore((state) => state.runHtmlValidation);
  const runSpellcheck = useStore((state) => state.runSpellcheck);

  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');

  const counts = useMemo(() => summarizeFindings(findings), [findings]);

  const grouped = useMemo(() => {
    const visible = severityFilter === 'all' ? findings : findings.filter((f) => f.severity === severityFilter);
    const map = new Map<FindingCategory, Finding[]>();

    for (const finding of visible) {
      const bucket = map.get(finding.category);
      if (bucket) bucket.push(finding);
      else map.set(finding.category, [finding]);
    }

    return [...map.entries()];
  }, [findings, severityFilter]);

  if (!snapshot) {
    return <p className="p-4 text-sm text-slate-500">Render a page to see findings.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-800 p-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label={`All ${findings.length}`} active={severityFilter === 'all'} onClick={() => setSeverityFilter('all')} />
          <FilterChip
            label={`Errors ${counts.error}`}
            active={severityFilter === 'error'}
            tone="error"
            onClick={() => setSeverityFilter('error')}
          />
          <FilterChip
            label={`Warnings ${counts.warning}`}
            active={severityFilter === 'warning'}
            tone="warning"
            onClick={() => setSeverityFilter('warning')}
          />
          <FilterChip
            label={`Info ${counts.info}`}
            active={severityFilter === 'info'}
            tone="info"
            onClick={() => setSeverityFilter('info')}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runHtmlValidation()}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            title="Free W3C Nu HTML Checker pass"
          >
            Validate HTML
          </button>
          <button
            type="button"
            onClick={() => void runSpellcheck()}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            title="Free LanguageTool pass - rate limited"
          >
            Spellcheck
          </button>
          <button
            type="button"
            onClick={() => exportReport(snapshot.url, findings, snapshot.screenshot)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Export JSON
          </button>
        </div>

        {extraStatus && <p className="mt-2 text-xs text-slate-400">{extraStatus}</p>}
      </div>

      <div className="flex-1 overflow-auto">
        {grouped.length === 0 && (
          <p className="p-4 text-sm text-emerald-400">No findings. The page is clean for these checks.</p>
        )}

        {grouped.map(([category, items]) => (
          <section key={category}>
            <h3 className="sticky top-0 bg-slate-900/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur">
              {CATEGORY_LABELS[category]} ({items.length})
            </h3>

            <ul>
              {items.map((finding) => (
                <li key={finding.id}>
                  <button
                    type="button"
                    onClick={() => selectFinding(finding)}
                    className={`w-full border-l-2 px-3 py-2 text-left transition ${
                      selectedFindingId === finding.id
                        ? 'border-sky-400 bg-slate-800'
                        : 'border-transparent hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          SEVERITY_STYLES[finding.severity]
                        }`}
                      >
                        {finding.severity}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm leading-snug text-slate-200">{finding.message}</p>
                        {finding.details && <p className="mt-1 text-xs leading-snug text-slate-500">{finding.details}</p>}
                        <p className="mt-1 text-[11px] text-slate-600">
                          {finding.elementIds.length > 0
                            ? `${finding.elementIds.length} element${finding.elementIds.length === 1 ? '' : 's'} - click to highlight`
                            : 'No element to highlight'}
                          {finding.helpUrl && (
                            <>
                              {' - '}
                              <a
                                href={finding.helpUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                docs
                              </a>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone?: Severity;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
        active ? 'border-sky-500 bg-sky-500/20 text-sky-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800'
      } ${!active && tone ? SEVERITY_STYLES[tone].split(' ')[1] : ''}`}
    >
      {label}
    </button>
  );
}

/** Report export (§6): findings plus the screenshot URL, ready for a ticket. */
function exportReport(url: string, findings: Finding[], screenshot: string) {
  const report = {
    url,
    screenshot,
    generatedAt: new Date().toISOString(),
    summary: summarizeFindings(findings),
    findings,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = href;
  link.download = `qa-report-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  URL.revokeObjectURL(href);
}
