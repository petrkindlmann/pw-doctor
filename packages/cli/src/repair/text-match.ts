import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer, DomElement } from '../core/dom-analyzer.js';

interface TextMatchInput {
  failedSelector: string;
  failedMethod: string;
  contextCode: string;
  analyzer: DomAnalyzer;
}

/**
 * Parse a CSS selector string into structural hints (tag, classes, id).
 * Returns null for selectors that don't look like CSS.
 */
function parseSelectorHints(selector: string): { tag: string | null; classes: string[]; id: string | null } | null {
  if (/^(role=|text=|data-testid=)/.test(selector)) return null;
  if (!selector.trim()) return null;
  if (selector.startsWith('//') || selector.startsWith('xpath=')) return null;

  const primary = selector.split(/[\s>+~]/).filter(Boolean)[0] ?? '';
  if (!primary) return null;

  let tag: string | null = null;
  const classes: string[] = [];
  let id: string | null = null;

  const tagMatch = primary.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) tag = tagMatch[1].toLowerCase();

  const idMatch = primary.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) id = idMatch[1];

  const classMatches = primary.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const m of classMatches) classes.push(m[1]);

  if (!tag && classes.length === 0 && !id) return null;
  return { tag, classes, id };
}

/**
 * Common generic UI labels that are rarely unique on a page and make poor
 * getByText anchors (a page may have many "OK"/"Submit"/"Close" controls).
 */
const GENERIC_TEXT = new Set([
  'ok', 'yes', 'no', 'submit', 'cancel', 'close', 'save', 'delete', 'edit',
  'next', 'previous', 'prev', 'back', 'continue', 'done', 'go', 'search',
  'login', 'log in', 'logout', 'log out', 'sign in', 'sign up', 'register',
  'add', 'remove', 'apply', 'reset', 'clear', 'send', 'open', 'menu', 'home',
  'more', 'less', 'view', 'select', 'confirm', 'accept', 'decline', 'retry',
]);

/**
 * Text that is obviously volatile (pure numbers, dates, times, currency,
 * percentages) — binding a selector to it guarantees future breakage.
 */
function isDynamicText(text: string): boolean {
  return (
    /^[\d.,]+$/.test(text) ||                       // pure number
    /^[$€£¥]\s?[\d.,]+$/.test(text) ||              // currency
    /^\d+(\.\d+)?\s?%$/.test(text) ||               // percentage
    /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(text) || // date
    /^\d{1,2}:\d{2}(\s?[ap]m)?$/i.test(text)        // time
  );
}

/**
 * Try to build a text-based RepairCandidate from a DomElement. Screens out
 * generic and dynamic text, and penalizes single-word/very-short labels so a
 * text match loses to an attribute match at the ranker when it is risky.
 */
function tryBuildTextCandidate(target: DomElement, analyzer: DomAnalyzer): RepairCandidate | null {
  const text = target.text.trim();
  if (!text || text.length > 50) return null;
  if (isDynamicText(text)) return null;

  // Check if text content is unique
  const textMatches = analyzer.findByText(text);
  const isUnique = textMatches.length === 1;

  // Use getByText if text is unique and short enough
  if (isUnique && text.length <= 30) {
    const lower = text.toLowerCase();
    const isGeneric = GENERIC_TEXT.has(lower);
    const isSingleShortWord = !/\s/.test(text) && text.length < 4;
    const reasons = [`unique visible text "${text}"`];
    let confidence = computeTextMatchConfidence(target, isUnique);
    if (isGeneric) {
      confidence = Math.max(0, confidence - 20);
      reasons.push('generic label -20');
    }
    if (isSingleShortWord) {
      confidence = Math.max(0, confidence - 10);
      reasons.push('very short label -10');
    }
    return {
      selector: text,
      method: 'getByText',
      confidence,
      strategy: 'text_match',
      reasoning: isGeneric
        ? `Found unique element with generic text "${text}" (prefer a role/testid if available)`
        : `Found unique element with text "${text}"`,
      reasons,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique,
      },
    };
  }

  return null;
}

export function tryTextMatch(input: TextMatchInput): RepairCandidate | null {
  const { failedSelector, analyzer } = input;

  // Strategy: Find the element the old selector pointed to by matching
  // CSS class/ID in the DOM, then generate a text-based selector for it.

  // 1. Try to find the element using the old selector directly
  const elements = analyzer.findByCss(failedSelector);
  if (elements.length > 0) {
    const candidate = tryBuildTextCandidate(elements[0], analyzer);
    if (candidate) return candidate;
  }

  // 2. If CSS selector didn't match (broken), parse it for hints and search
  //    candidate elements to find one with unique text
  const hints = parseSelectorHints(failedSelector);
  if (!hints) return null;

  // Collect candidate elements based on selector hints
  let candidateElements: DomElement[] = [];

  // Search by class similarity
  if (hints.classes.length > 0) {
    candidateElements = analyzer.findSimilarByClasses(hints.classes);
  }

  // Search by tag if no class-based candidates
  if (candidateElements.length === 0 && hints.tag) {
    candidateElements = analyzer.findByTag(hints.tag);
  }

  // Search by id
  if (hints.id) {
    const idElements = analyzer.findByCss(`#${hints.id}`);
    for (const el of idElements) {
      if (!candidateElements.some((c) => c.cssPath === el.cssPath)) {
        candidateElements.push(el);
      }
    }
  }

  // Try to build a text candidate from each matching element
  // Return the best one (highest confidence)
  let bestCandidate: RepairCandidate | null = null;
  for (const el of candidateElements) {
    const candidate = tryBuildTextCandidate(el, analyzer);
    if (candidate && (!bestCandidate || candidate.confidence > bestCandidate.confidence)) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function computeTextMatchConfidence(
  element: { isVisible: boolean; attributes: Record<string, string> },
  isUnique: boolean,
): number {
  let confidence = 50;

  if (isUnique) confidence += 20;
  else confidence -= 15;
  if (element.isVisible) confidence += 10;

  return Math.max(0, Math.min(100, confidence));
}
