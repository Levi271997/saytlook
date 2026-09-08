export * from './types.js';
export * from './utils.js';
export * from './typography.js';
export * from './images.js';
export * from './duplicates.js';
export * from './headings.js';
export * from './spacing.js';
export * from './axe.js';

import { analyzeAxe, altElementIdsFromAxe } from './axe.js';
import { analyzeDuplicates } from './duplicates.js';
import { analyzeHeadings } from './headings.js';
import { analyzeImages } from './images.js';
import { analyzeSpacing } from './spacing.js';
import { analyzeTypography } from './typography.js';
import type { AnalyzerOptions, Finding, PageSnapshot, Severity } from './types.js';
import { resolveOptions } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Run every check against a snapshot and return one ranked list of findings.
 *
 * Pure: no DOM, no fetch, no side effects - which is what lets the same code
 * back a Chrome-extension build later.
 */
export function runAllAnalyzers(snapshot: PageSnapshot, overrides?: Partial<AnalyzerOptions>): Finding[] {
  const options = resolveOptions(overrides);

  const findings = [
    ...analyzeTypography(snapshot, options.typography),
    ...analyzeImages(snapshot),
    ...analyzeDuplicates(snapshot, options.duplicates),
    ...analyzeHeadings(snapshot),
    ...analyzeSpacing(snapshot, options.spacing),
    ...analyzeAxe(snapshot),
  ];

  return sortFindings(dedupeAltFindings(findings, snapshot));
}

/**
 * axe-core is the source of truth for alt text, so drop our own snapshot-based
 * alt finding wherever axe already flagged the same element.
 */
export function dedupeAltFindings(findings: Finding[], snapshot: PageSnapshot): Finding[] {
  const axeCovered = altElementIdsFromAxe(snapshot.axeResults);
  if (axeCovered.size === 0) return findings;

  return findings.filter((finding) => {
    if (finding.category !== 'alt') return true;
    if (finding.id.startsWith('axe-')) return true;
    return !finding.elementIds.every((id) => axeCovered.has(id));
  });
}

/** Errors first, then warnings, then info; stable within a severity. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Counts for the panel header. */
export function summarizeFindings(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 },
  );
}
