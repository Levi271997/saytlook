import type { ElementNode, Finding, PageSnapshot } from '@digitalfeet/analyzer';
import { config } from './config.js';

const TIMEOUT_MS = 20_000;

/**
 * Optional free third-party passes (feature 2).
 *
 * Both are opt-in per request: the Nu checker is polite to hammer but slow, and
 * LanguageTool's public tier is aggressively rate-limited. Endpoints come from
 * env, never hardcoded.
 */

// ---------------------------------------------------------------------------
// Nu HTML Checker - validator.w3.org/nu, free, no key
// ---------------------------------------------------------------------------

interface NuMessage {
  type: 'error' | 'info' | 'non-document-error';
  subType?: string;
  message: string;
  extract?: string;
  lastLine?: number;
}

/**
 * Ask Nu to fetch and validate the URL itself, so we never ship the page HTML
 * across the wire.
 */
export async function validateHtml(url: string): Promise<Finding[]> {
  const endpoint = `${config.nuValidatorUrl}?doc=${encodeURIComponent(url)}&out=json`;

  const response = await fetch(endpoint, {
    headers: { 'user-agent': 'DigitalfeetQA/0.1 (internal QA tool)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Nu HTML Checker responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as { messages?: NuMessage[] };
  const messages = body.messages ?? [];

  return messages.slice(0, 100).map((message, i) => ({
    id: `nu-${i}`,
    category: 'accessibility' as const,
    severity: message.type === 'error' ? ('error' as const) : ('info' as const),
    message: message.message,
    details: [message.lastLine ? `Line ${message.lastLine}` : '', message.extract?.trim()]
      .filter(Boolean)
      .join(' - '),
    // Nu reports source positions, not elements, so nothing to highlight.
    elementIds: [],
  }));
}

// ---------------------------------------------------------------------------
// LanguageTool - api.languagetool.org, free tier
// ---------------------------------------------------------------------------

interface LanguageToolMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  context: { text: string; offset: number; length: number };
  rule: { id: string; category: { id: string; name: string } };
}

/** The free tier rejects anything larger. */
const MAX_TEXT_LENGTH = 19_000;

/**
 * Spell/grammar-check the page's visible copy.
 *
 * We send the text in snapshot order and remember which element each character
 * range came from, so a match can still highlight the right box on the Stage.
 */
export async function spellcheck(snapshot: PageSnapshot): Promise<Finding[]> {
  const { text, ranges } = buildTextIndex(snapshot.elements);
  if (text.trim().length === 0) return [];

  const response = await fetch(config.languageToolUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'DigitalfeetQA/0.1 (internal QA tool)',
    },
    body: new URLSearchParams({
      text,
      language: config.languageToolLang,
      // Style nits are noise for a QA pass; typos and grammar are the point.
      disabledCategories: 'REDUNDANCY,STYLE,COLLOQUIALISMS',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 429) {
    throw new Error('LanguageTool rate limit reached. Wait a minute and try again.');
  }
  if (!response.ok) {
    throw new Error(`LanguageTool responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as { matches?: LanguageToolMatch[] };

  return (body.matches ?? []).slice(0, 200).map((match, i) => {
    const elementId = elementAtOffset(ranges, match.offset);
    const suggestions = match.replacements
      .slice(0, 3)
      .map((r) => r.value)
      .join(', ');

    return {
      id: `lt-${i}-${match.rule.id}`,
      category: 'typography' as const,
      severity: 'info' as const,
      message: match.shortMessage?.trim() || match.message,
      details: [
        `"${match.context.text.trim()}"`,
        suggestions.length > 0 ? `Suggested: ${suggestions}` : '',
        match.rule.category.name,
      ]
        .filter(Boolean)
        .join(' - '),
      elementIds: elementId ? [elementId] : [],
    };
  });
}

interface TextRange {
  start: number;
  end: number;
  elementId: string;
}

/** Concatenate element text, tracking the offset span each element occupies. */
function buildTextIndex(elements: ElementNode[]): { text: string; ranges: TextRange[] } {
  const parts: string[] = [];
  const ranges: TextRange[] = [];
  let cursor = 0;

  for (const element of elements) {
    const own = element.text?.trim();
    if (!own) continue;
    if (cursor + own.length > MAX_TEXT_LENGTH) break;

    parts.push(own);
    ranges.push({ start: cursor, end: cursor + own.length, elementId: element.id });
    cursor += own.length + 1; // the joining newline
  }

  return { text: parts.join('\n'), ranges };
}

function elementAtOffset(ranges: TextRange[], offset: number): string | undefined {
  // Ranges are sorted and non-overlapping, so a binary search is exact.
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid];
    if (!range) break;
    if (offset < range.start) high = mid - 1;
    else if (offset >= range.end) low = mid + 1;
    else return range.elementId;
  }

  return undefined;
}
