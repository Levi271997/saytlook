import type { AxeResult, Finding, PageSnapshot, Severity } from './types.js';

/**
 * Map raw axe-core violations onto our Finding shape (feature 2).
 *
 * axe runs inside the Playwright page, so this stays a pure transform: the
 * backend hands us `axeResults`, we turn them into panel rows.
 */
export function analyzeAxe(snapshot: PageSnapshot): Finding[] {
  return snapshot.axeResults.map(toFinding);
}

/** axe rules that are really about alt text, so they file under that category. */
const ALT_RULES = new Set(['image-alt', 'input-image-alt', 'area-alt', 'role-img-alt', 'object-alt']);

function toFinding(violation: AxeResult): Finding {
  const elementIds = violation.nodes
    .map((node) => node.elementId)
    .filter((id): id is string => typeof id === 'string');

  const targets = violation.nodes
    .slice(0, 3)
    .map((node) => node.target.join(' '))
    .filter((t) => t.length > 0);

  return {
    id: `axe-${violation.id}`,
    category: ALT_RULES.has(violation.id) ? 'alt' : 'accessibility',
    severity: severityFor(violation.impact),
    message: `${violation.help} (${violation.nodes.length} element${violation.nodes.length === 1 ? '' : 's'})`,
    details: targets.length > 0 ? `axe rule "${violation.id}". Affects: ${targets.join(', ')}` : `axe rule "${violation.id}".`,
    helpUrl: violation.helpUrl,
    elementIds,
  };
}

function severityFor(impact: AxeResult['impact']): Severity {
  switch (impact) {
    case 'critical':
    case 'serious':
      return 'error';
    case 'moderate':
      return 'warning';
    default:
      return 'info';
  }
}

/** Element ids axe already reported an alt-text violation for. */
export function altElementIdsFromAxe(axeResults: AxeResult[]): Set<string> {
  const ids = new Set<string>();
  for (const violation of axeResults) {
    if (!ALT_RULES.has(violation.id)) continue;
    for (const node of violation.nodes) {
      if (node.elementId) ids.add(node.elementId);
    }
  }
  return ids;
}
