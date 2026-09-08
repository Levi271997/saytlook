/**
 * The single source of truth for the page snapshot contract.
 *
 * The API produces a `PageSnapshot`; the web app draws from it; the analyzers
 * in this package consume it. Never redefine these shapes elsewhere.
 *
 * Every box is in **full-page pixel space** (document coordinates, origin at
 * the top-left of the full-page screenshot), never viewport-relative.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementStyles {
  fontFamily: string;
  fontSize: number; // px
  lineHeight: number; // px (normal is resolved to a px value during extraction)
  fontWeight: number;
  color: string;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export interface ElementNode {
  /** Stable id assigned during extraction, e.g. `el-42`. */
  id: string;
  tag: string;
  box: Box;
  /** The element's *own* direct text (direct child text nodes only), trimmed. */
  text?: string;
  styles: ElementStyles;
  parentId?: string;

  // --- additive, still part of the contract ---
  /** Explicit ARIA role, if the author set one. */
  role?: string;
  /** Nearest enclosing landmark, used to skip nav/footer boilerplate. */
  landmark?: Landmark;
  /** True for elements whose computed display is block-ish (block, flex, grid, list-item). */
  isBlock?: boolean;
  /** display value, kept for spacing heuristics. */
  display?: string;
}

export type Landmark = 'nav' | 'header' | 'footer' | 'main' | 'aside' | 'form';

export interface HeadingNode {
  /** Matches an `ElementNode.id`. */
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** Full visible text of the heading (subtree), whitespace-normalized. */
  text: string;
  box: Box;
}

export interface ImageNode {
  id: string;
  src: string;
  alt: string | null;
  naturalWidth: number;
  naturalHeight: number;
  box: Box;
  /** HTTP status from the backend's HEAD check. Undefined if not checked. */
  status?: number;
  /** Set when the HEAD/GET check could not complete (DNS failure, timeout, ...). */
  checkError?: string;
}

export interface AxeNode {
  /** CSS selector path axe reported. */
  target: string[];
  html: string;
  failureSummary?: string;
  /** Our snapshot element id, resolved during extraction. Undefined if unmatched. */
  elementId?: string;
}

export interface AxeResult {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  description: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
}

export interface PageSnapshot {
  url: string;
  /** ISO timestamp. */
  capturedAt: string;
  viewport: { width: number; height: number };
  /** URL of the full-page PNG the backend saved. */
  screenshot: string;
  /** Full-page pixel dimensions; the coordinate space every box lives in. */
  pageSize: { width: number; height: number };
  elements: ElementNode[];
  headings: HeadingNode[];
  images: ImageNode[];
  /** Raw axe-core violations. */
  axeResults: AxeResult[];
  /** Non-fatal problems hit while capturing (nav warnings, axe failure, ...). */
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Findings (feature 2 + structural warnings from features 3/4)
// ---------------------------------------------------------------------------

export type FindingCategory =
  | 'typography'
  | 'image'
  | 'alt'
  | 'duplicate-text'
  | 'duplicate-section'
  | 'heading'
  | 'spacing'
  | 'accessibility';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  message: string;
  /** Elements to highlight on the Stage. */
  elementIds: string[];
  /** Optional extra context rendered in the panel (helpUrl, counts, samples). */
  details?: string;
  helpUrl?: string;
}

// ---------------------------------------------------------------------------
// Analyzer options
// ---------------------------------------------------------------------------

export interface TypographyOptions {
  /** Flag when the page uses more than this many distinct font families. */
  maxFontFamilies: number;
  /** Flag when the page uses more than this many distinct font sizes. */
  maxFontSizes: number;
  /** Flag any rendered text below this size. */
  minFontSize: number;
  /** Flag body text whose line-height is below this multiple of its font size. */
  minLineHeightRatio: number;
  /** Body text is text at or below this size; larger is treated as display type. */
  bodyTextMaxSize: number;
}

export interface DuplicateOptions {
  /** Minimum length for a text string to count as a duplicate candidate. */
  minTextLength: number;
  /** Case-insensitive substrings; any matching text is ignored. */
  ignoreText: string[];
  /** Landmarks whose content is treated as boilerplate and skipped. */
  ignoreLandmarks: Landmark[];
  /** A repeated subtree must clear one of these to be reported. */
  minSectionTextLength: number;
  minSectionChildren: number;
}

export interface SpacingOptions {
  /** Base spacing unit; gaps that are not a multiple of it are flagged as info. */
  baseUnit: number;
  /** Ignore gaps smaller than this when reporting rhythm problems. */
  minReportedGap: number;
  /** Two boxes must overlap by at least this fraction to count as stacked. */
  minOverlapRatio: number;
  /** Report rhythm inconsistencies as findings. */
  reportRhythm: boolean;
}

export interface AnalyzerOptions {
  typography: TypographyOptions;
  duplicates: DuplicateOptions;
  spacing: SpacingOptions;
}

export const DEFAULT_OPTIONS: AnalyzerOptions = {
  typography: {
    maxFontFamilies: 3,
    maxFontSizes: 8,
    minFontSize: 12,
    minLineHeightRatio: 1.2,
    bodyTextMaxSize: 20,
  },
  duplicates: {
    minTextLength: 25,
    ignoreText: [
      'all rights reserved',
      'privacy policy',
      'terms and conditions',
      'cookie',
      'read more',
      'learn more',
      'skip to content',
    ],
    ignoreLandmarks: ['nav', 'header', 'footer'],
    minSectionTextLength: 200,
    minSectionChildren: 5,
  },
  spacing: {
    baseUnit: 8,
    minReportedGap: 4,
    minOverlapRatio: 0.5,
    reportRhythm: false,
  },
};

/** Shallow-merge caller overrides onto the defaults, per analyzer section. */
export function resolveOptions(overrides?: Partial<AnalyzerOptions>): AnalyzerOptions {
  return {
    typography: { ...DEFAULT_OPTIONS.typography, ...overrides?.typography },
    duplicates: { ...DEFAULT_OPTIONS.duplicates, ...overrides?.duplicates },
    spacing: { ...DEFAULT_OPTIONS.spacing, ...overrides?.spacing },
  };
}
