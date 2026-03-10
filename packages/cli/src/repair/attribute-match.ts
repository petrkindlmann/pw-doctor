import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer, DomElement } from '../core/dom-analyzer.js';

interface AttributeMatchInput {
  failedSelector: string;
  failedMethod: string;
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
 * Build a RepairCandidate from a DomElement that has a semantic attribute.
 */
function buildCandidate(target: DomElement, analyzer: DomAnalyzer): RepairCandidate | null {
  const text = target.text.trim();

  // Check for data-testid (highest priority)
  if (target.attributes['data-testid']) {
    const testId = target.attributes['data-testid'];
    const isUnique = analyzer.findByAttribute('data-testid', testId).length === 1;

    return {
      selector: testId,
      method: 'getByTestId',
      confidence: computeAttrConfidence(isUnique, target.isVisible, 'testid'),
      strategy: 'attribute_match',
      reasoning: `Element has data-testid="${testId}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique,
      },
    };
  }

  // Check for role attribute
  if (target.attributes['role']) {
    const role = target.attributes['role'];
    const isUnique = analyzer.findByAttribute('role', role).length === 1;
    return {
      selector: role,
      method: 'getByRole',
      confidence: computeAttrConfidence(isUnique, target.isVisible, 'role'),
      strategy: 'attribute_match',
      reasoning: `Element has role="${role}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique,
      },
    };
  }

  // Check for aria-label
  if (target.attributes['aria-label']) {
    const label = target.attributes['aria-label'];
    const isUnique = analyzer.findByAttribute('aria-label', label).length === 1;

    return {
      selector: label,
      method: 'getByLabel',
      confidence: computeAttrConfidence(isUnique, target.isVisible, 'label'),
      strategy: 'attribute_match',
      reasoning: `Element has aria-label="${label}"`,
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

export function tryAttributeMatch(input: AttributeMatchInput): RepairCandidate | null {
  const { failedSelector, analyzer } = input;

  // 1. Try to find the element using the old CSS selector directly
  const elements = analyzer.findByCss(failedSelector);
  if (elements.length > 0) {
    const candidate = buildCandidate(elements[0], analyzer);
    if (candidate) return candidate;
  }

  // 2. If CSS selector didn't match (broken), parse it for hints and search
  //    all elements with semantic attributes
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

  // Try to build a semantic candidate from each matching element
  // Return the best one (data-testid > role > aria-label)
  let bestCandidate: RepairCandidate | null = null;
  for (const el of candidateElements) {
    const candidate = buildCandidate(el, analyzer);
    if (candidate && (!bestCandidate || candidate.confidence > bestCandidate.confidence)) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function computeAttrConfidence(
  isUnique: boolean,
  isVisible: boolean,
  attrType: 'testid' | 'role' | 'label',
): number {
  let confidence = 50;

  if (attrType === 'testid') confidence += 15;
  else if (attrType === 'role') confidence += 10;
  else if (attrType === 'label') confidence += 8;

  if (isUnique) confidence += 20;
  else confidence -= 15;

  if (isVisible) confidence += 10;

  return Math.max(0, Math.min(100, confidence));
}
