import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer, DomElement } from '../core/dom-analyzer.js';

export interface AnchorMatchInput {
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

/** Escape a value for use inside a CSS attribute selector: [attr="value"] */
function cssEscapeAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** Heading tags, ordered by specificity. */
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/** Landmark tags for finding stable anchor elements. */
const LANDMARK_TAGS = ['nav', 'main', 'aside', 'header', 'footer', 'section', 'article'] as const;

interface AnchorElement {
  element: DomElement;
  type: 'data-testid' | 'role' | 'heading' | 'aria-label' | 'landmark';
  anchorSelector: string;
}

interface AnchorCandidate {
  target: DomElement;
  anchor: AnchorElement;
  selector: string;
  score: number;
}

/**
 * Extract tag-hint from the failed CSS selector for guessing what kind of element
 * the test was targeting. E.g., `.submit-btn` suggests a button.
 */
function guessTargetTags(selector: string): string[] {
  const tags: string[] = [];
  const lower = selector.toLowerCase();

  // Tag-hint keywords in class/id names
  if (/btn|button|submit/.test(lower)) tags.push('button', 'input');
  if (/\blink\b|anchor/.test(lower)) tags.push('a');
  if (/\binput\b|\bfield\b|textbox|textarea/.test(lower)) tags.push('input', 'textarea');
  if (/img|image|photo|avatar/.test(lower)) tags.push('img');
  if (/\bselect\b|dropdown/.test(lower)) tags.push('select');
  if (/heading|title/.test(lower)) tags.push('h1', 'h2', 'h3', 'h4', 'h5', 'h6');
  if (/\blist\b/.test(lower)) tags.push('ul', 'ol');
  if (/\btable\b/.test(lower)) tags.push('table');
  if (/\bform\b/.test(lower)) tags.push('form');
  if (/\bprice\b|\btotal\b|\bamount\b|\bcost\b/.test(lower)) tags.push('span', 'div', 'p');
  if (/\blabel\b/.test(lower)) tags.push('label');
  if (/\bnav\b/.test(lower)) tags.push('nav');

  return tags;
}

/**
 * Parse the primary tag from a CSS selector.
 */
function parsePrimaryTag(selector: string): string | null {
  if (/^(role=|text=|data-testid=)/.test(selector)) return null;
  if (!selector.trim()) return null;
  if (selector.startsWith('//') || selector.startsWith('xpath=')) return null;

  const primary = selector.split(/[\s>+~]/).filter(Boolean)[0] ?? '';
  const tagMatch = primary.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  return tagMatch ? tagMatch[1].toLowerCase() : null;
}

/**
 * Find stable anchor elements in the DOM.
 */
function findAnchors(analyzer: DomAnalyzer): AnchorElement[] {
  const anchors: AnchorElement[] = [];
  const seenPaths = new Set<string>();

  function addIfNew(element: DomElement, type: AnchorElement['type'], anchorSelector: string) {
    if (!seenPaths.has(element.cssPath)) {
      seenPaths.add(element.cssPath);
      anchors.push({ element, type, anchorSelector });
    }
  }

  // 1. Elements with data-testid (highest priority anchors)
  const testIdElements = analyzer.findByCss('[data-testid]');
  for (const el of testIdElements) {
    if (el.attributes['data-testid']) {
      addIfNew(el, 'data-testid', `[data-testid="${cssEscapeAttr(el.attributes['data-testid'])}"]`);
    }
  }

  // 2. Elements with role attribute
  const roleElements = analyzer.findByCss('[role]');
  for (const el of roleElements) {
    if (el.attributes['role']) {
      addIfNew(el, 'role', `[role="${cssEscapeAttr(el.attributes['role'])}"]`);
    }
  }

  // 3. Heading elements with text content
  for (const tag of HEADING_TAGS) {
    const headings = analyzer.findByTag(tag);
    for (const el of headings) {
      const text = el.text.trim();
      if (text && text.length <= 60) {
        addIfNew(el, 'heading', el.cssPath);
      }
    }
  }

  // 4. Elements with aria-label
  const ariaLabelElements = analyzer.findByCss('[aria-label]');
  for (const el of ariaLabelElements) {
    if (el.attributes['aria-label']) {
      addIfNew(el, 'aria-label', `[aria-label="${cssEscapeAttr(el.attributes['aria-label'])}"]`);
    }
  }

  // 5. Landmark elements
  for (const tag of LANDMARK_TAGS) {
    const landmarks = analyzer.findByTag(tag);
    for (const el of landmarks) {
      addIfNew(el, 'landmark', el.cssPath);
    }
  }

  return anchors;
}

/**
 * Score an anchor based on its type.
 */
function scoreAnchor(anchor: AnchorElement): number {
  switch (anchor.type) {
    case 'data-testid': return 15;
    case 'role': return 10;
    case 'heading': return 10;
    case 'aria-label': return 8;
    case 'landmark': return 5;
    default: return 0;
  }
}

/**
 * Build candidate selectors using the anchor's CSS path to find nearby targets.
 * Returns CSS selectors that combine the anchor context with potential targets.
 */
function buildRelativeSelectors(
  anchor: AnchorElement,
  targetTags: string[],
  analyzer: DomAnalyzer,
): AnchorCandidate[] {
  const candidates: AnchorCandidate[] = [];
  const anchorCssPath = anchor.element.cssPath;
  const anchorSelector = anchor.anchorSelector;

  // Determine which selectors to use for the anchor in combined CSS
  // For data-testid and role and aria-label, use the attribute selector (globally unique)
  // For headings and landmarks, we need to use the cssPath
  const anchorCss = (anchor.type === 'data-testid' || anchor.type === 'role' || anchor.type === 'aria-label')
    ? anchorSelector
    : anchorCssPath;

  if (!anchorCss) return candidates;

  // Strategy A: Look for target elements as siblings of the anchor
  // CSS: anchorSelector ~ targetTag, anchorSelector + targetTag
  for (const tag of targetTags) {
    // General sibling combinator
    const siblingSelector = `${anchorCss} ~ ${tag}`;
    const siblingMatches = analyzer.findByCss(siblingSelector);
    for (const target of siblingMatches) {
      candidates.push({
        target,
        anchor,
        selector: siblingSelector,
        score: computeScore(anchor, target),
      });
    }

    // Adjacent sibling combinator
    const adjacentSelector = `${anchorCss} + ${tag}`;
    const adjacentMatches = analyzer.findByCss(adjacentSelector);
    for (const target of adjacentMatches) {
      candidates.push({
        target,
        anchor,
        selector: adjacentSelector,
        score: computeScore(anchor, target) + 5, // slight bonus for adjacency
      });
    }
  }

  // Strategy B: Look for target elements as descendants of the anchor's parent
  // Use the anchor's parent path and search for descendants
  const parentPath = getParentCssPath(anchorCssPath);
  if (parentPath) {
    for (const tag of targetTags) {
      const descendantSelector = `${parentPath} > ${tag}`;
      const descendantMatches = analyzer.findByCss(descendantSelector);
      for (const target of descendantMatches) {
        // Skip if the target is the anchor itself
        if (target.cssPath === anchor.element.cssPath) continue;
        candidates.push({
          target,
          anchor,
          selector: descendantSelector,
          score: computeScore(anchor, target),
        });
      }
    }
  }

  // Strategy C: Look for targets as children of the anchor
  for (const tag of targetTags) {
    const childSelector = `${anchorCss} ${tag}`;
    const childMatches = analyzer.findByCss(childSelector);
    for (const target of childMatches) {
      candidates.push({
        target,
        anchor,
        selector: childSelector,
        score: computeScore(anchor, target),
      });
    }
  }

  return candidates;
}

function computeScore(anchor: AnchorElement, target: DomElement): number {
  let score = scoreAnchor(anchor);
  if (target.isVisible) score += 10;
  if (target.isUnique) score += 15;
  return score;
}

function getParentCssPath(cssPath: string): string | null {
  const parts = cssPath.split(' > ');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(' > ');
}

/**
 * Check whether a CSS selector string looks valid (basic heuristic).
 */
function isValidCssSelector(selector: string): boolean {
  if (!selector.trim()) return false;
  if (selector.startsWith('//') || selector.startsWith('xpath=')) return false;
  // Must contain at least one alphanumeric character or attribute bracket
  return /[a-zA-Z\[\]]/.test(selector);
}

/**
 * Attempt to find a target element using stable anchor elements in the DOM.
 *
 * This strategy works when the original CSS selector is broken but the page
 * structure is largely intact — stable anchors (headings, landmarks, data-testid
 * elements) can be used to locate the target relative to them.
 */
export function tryAnchorMatch(input: AnchorMatchInput): RepairCandidate | null {
  const { failedSelector, failedMethod, analyzer } = input;

  // Only applies to CSS-based selectors
  if (NON_CSS_METHODS.has(failedMethod)) return null;

  // Reject empty or non-CSS selectors
  if (!failedSelector.trim()) return null;
  if (failedSelector.startsWith('//') || failedSelector.startsWith('xpath=')) return null;
  if (/^(role=|text=|data-testid=)/.test(failedSelector)) return null;

  // Find anchor elements in the DOM
  const anchors = findAnchors(analyzer);
  if (anchors.length === 0) return null;

  // Determine what kind of element we're looking for
  const primaryTag = parsePrimaryTag(failedSelector);
  const guessedTags = guessTargetTags(failedSelector);
  const targetTags = primaryTag
    ? [primaryTag, ...guessedTags.filter((t) => t !== primaryTag)]
    : guessedTags;

  // If we have no tag hints at all, bail out — anchor match needs some
  // signal about what kind of element we're looking for to avoid false positives
  if (targetTags.length === 0) return null;
  const searchTags = targetTags;

  // Collect all candidates from all anchors
  let allCandidates: AnchorCandidate[] = [];
  for (const anchor of anchors) {
    const candidates = buildRelativeSelectors(anchor, searchTags, analyzer);
    allCandidates.push(...candidates);
  }

  if (allCandidates.length === 0) return null;

  // Deduplicate by target cssPath — keep highest-scoring entry for each target
  const bestByPath = new Map<string, AnchorCandidate>();
  for (const candidate of allCandidates) {
    const existing = bestByPath.get(candidate.target.cssPath);
    if (!existing || candidate.score > existing.score) {
      bestByPath.set(candidate.target.cssPath, candidate);
    }
  }
  allCandidates = Array.from(bestByPath.values());

  // Filter out targets that the failed selector itself still matches
  // (if the old selector still works, this strategy isn't needed for that element)
  const oldMatches = analyzer.findByCss(failedSelector);
  const oldMatchPaths = new Set(oldMatches.map((el) => el.cssPath));
  allCandidates = allCandidates.filter((c) => !oldMatchPaths.has(c.target.cssPath));

  // If old selector still has matches, we filtered them out. If nothing left, bail.
  if (allCandidates.length === 0) return null;

  // Pick the best candidate
  allCandidates.sort((a, b) => b.score - a.score);
  const best = allCandidates[0];

  // Validate the selector
  if (!isValidCssSelector(best.selector)) return null;

  // Verify the selector actually works in the DOM
  const verification = analyzer.findByCss(best.selector);
  if (verification.length === 0) return null;

  // Base confidence: 45 + scoring bonuses
  const confidence = Math.max(0, Math.min(100, 45 + best.score));

  // Only return if confidence >= 30
  if (confidence < 30) return null;

  return {
    selector: best.selector,
    method: 'locator',
    confidence,
    strategy: 'anchor_match',
    reasoning: `Found element via ${best.anchor.type} anchor "${best.anchor.element.text.trim().slice(0, 40) || best.anchor.anchorSelector}"`,
    elementMatch: {
      tag: best.target.tag,
      text: best.target.text.trim(),
      attributes: best.target.attributes,
      isVisible: best.target.isVisible,
      isUnique: best.target.isUnique,
    },
  };
}
