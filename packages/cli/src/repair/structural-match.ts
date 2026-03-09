import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer, DomElement } from '../core/dom-analyzer.js';

export interface StructuralMatchInput {
  failedSelector: string;
  failedMethod: string;
  analyzer: DomAnalyzer;
}

/** Non-CSS Playwright methods that this strategy cannot handle. */
const NON_CSS_METHODS = new Set([
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'getByTestId',
]);

interface SelectorHints {
  tag: string | null;
  classes: string[];
  id: string | null;
}

/**
 * Parse a CSS selector string into structural hints (tag, classes, id).
 * Returns null for selectors that don't look like CSS.
 */
function parseCssSelector(selector: string): SelectorHints | null {
  // Reject selectors that look like Playwright built-in locator strings
  if (/^(role=|text=|data-testid=)/.test(selector)) return null;
  // Reject empty selectors
  if (!selector.trim()) return null;
  // Reject XPath
  if (selector.startsWith('//') || selector.startsWith('xpath=')) return null;

  // Simple CSS selector parser: extract first segment's tag, classes, id
  // We only need the primary selector part (before any combinators for hint extraction)
  const primary = selector.split(/[\s>+~]/).filter(Boolean)[0] ?? '';
  if (!primary) return null;

  let tag: string | null = null;
  const classes: string[] = [];
  let id: string | null = null;

  // Extract tag name (starts at beginning, before any . or #)
  const tagMatch = primary.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) {
    tag = tagMatch[1].toLowerCase();
  }

  // Extract ID
  const idMatch = primary.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    id = idMatch[1];
  }

  // Extract classes
  const classMatches = primary.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const m of classMatches) {
    classes.push(m[1]);
  }

  // If we got absolutely nothing useful, return null
  if (!tag && classes.length === 0 && !id) return null;

  return { tag, classes, id };
}

/**
 * Score a candidate element based on structural similarity to the original selector.
 */
function scoreCandidate(
  element: DomElement,
  hints: SelectorHints,
): number {
  let score = 0;

  // Class name overlap: count matching / total original (0-1 ratio * 30 points)
  if (hints.classes.length > 0) {
    const elementClasses = (element.attributes['class'] ?? '').split(/\s+/).filter(Boolean);
    const matchingCount = hints.classes.filter((c) => elementClasses.includes(c)).length;
    score += (matchingCount / hints.classes.length) * 30;
  }

  // Same tag: +10 points
  if (hints.tag && element.tag === hints.tag) {
    score += 10;
  }

  // Has data-testid: +15 points (prefer semantic selectors)
  if (element.attributes['data-testid']) {
    score += 15;
  }

  // Is visible: +10 points
  if (element.isVisible) {
    score += 10;
  }

  // Is unique (by generated selector): +15 points
  if (element.isUnique) {
    score += 15;
  }

  return score;
}

/**
 * Generate a selector for the matched element.
 * Prefer data-testid → getByTestId, else build CSS selector from tag+unique attributes.
 */
function generateSelector(element: DomElement): { selector: string; method: string } {
  // Prefer data-testid
  if (element.attributes['data-testid']) {
    return {
      selector: element.attributes['data-testid'],
      method: 'getByTestId',
    };
  }

  // Build CSS selector from tag + unique attributes
  let css = element.tag || '*';

  if (element.attributes['id']) {
    css = `${element.tag || ''}#${element.attributes['id']}`;
  } else if (element.attributes['class']) {
    const classes = element.attributes['class'].split(/\s+/).filter(Boolean);
    css = (element.tag || '') + classes.map((c) => `.${c}`).join('');
  }

  return {
    selector: css,
    method: 'locator',
  };
}

/**
 * Attempt to find a structurally similar element when the original CSS selector fails.
 *
 * Algorithm:
 * 1. Parse the old CSS selector to extract hints (tag, classes, id)
 * 2. Search the DOM for elements with similar classes or same tag
 * 3. Score and rank candidates
 * 4. Return the best candidate if confidence >= 30
 */
export function tryStructuralMatch(input: StructuralMatchInput): RepairCandidate | null {
  const { failedSelector, failedMethod, analyzer } = input;

  // Non-CSS methods are not applicable for structural matching
  if (NON_CSS_METHODS.has(failedMethod)) return null;

  const hints = parseCssSelector(failedSelector);
  if (!hints) return null;

  // Collect candidate elements
  let candidates: DomElement[] = [];

  // If classes found, search by class similarity
  if (hints.classes.length > 0) {
    candidates = analyzer.findSimilarByClasses(hints.classes);
  }

  // If no class-based candidates found and we have a tag, search by tag
  if (candidates.length === 0 && hints.tag) {
    candidates = analyzer.findByTag(hints.tag);
  }

  // If still no candidates, bail out
  if (candidates.length === 0) return null;

  // Score each candidate
  let bestElement: DomElement | null = null;
  let bestScore = -1;

  for (const element of candidates) {
    const score = scoreCandidate(element, hints);
    if (score > bestScore) {
      bestScore = score;
      bestElement = element;
    }
  }

  if (!bestElement) return null;

  // Base confidence: 45 (50 - 5 structural_match penalty), plus scoring bonuses
  const confidence = Math.max(0, Math.min(100, 45 + bestScore));

  // Only return if confidence >= 30
  if (confidence < 30) return null;

  const { selector, method } = generateSelector(bestElement);

  return {
    selector,
    method,
    confidence,
    strategy: 'structural_match',
    reasoning: `Found structurally similar element via ${hints.classes.length > 0 ? 'class' : 'tag'} matching`,
    elementMatch: {
      tag: bestElement.tag,
      text: bestElement.text.trim(),
      attributes: bestElement.attributes,
      isVisible: bestElement.isVisible,
      isUnique: bestElement.isUnique,
    },
  };
}
