import type { DomAnalyzer, DomElement } from '../core/dom-analyzer.js';

export interface DomGateCandidate {
  selector: string;
  method: string;
}

export interface DomGateResult {
  passes: boolean;
  reason?: string;
}

export function verifyAgainstDom(
  candidate: DomGateCandidate,
  analyzer: DomAnalyzer,
): DomGateResult {
  let matches: DomElement[];

  try {
    matches = findMatches(candidate, analyzer);
  } catch {
    return { passes: false, reason: 'selector query threw an error' };
  }

  if (matches.length === 0) {
    return { passes: false, reason: 'no elements matched' };
  }

  if (matches.length > 1) {
    return { passes: false, reason: `matched ${matches.length} elements, expected 1` };
  }

  if (!matches[0].isVisible) {
    return { passes: false, reason: 'matched element is not visible' };
  }

  return { passes: true };
}

function findMatches(candidate: DomGateCandidate, analyzer: DomAnalyzer): DomElement[] {
  switch (candidate.method) {
    case 'locator':
      return analyzer.findByCss(candidate.selector);
    case 'getByTestId':
      return analyzer.findByAttribute('data-testid', candidate.selector);
    case 'getByRole':
      return analyzer.findByAttribute('role', candidate.selector);
    case 'getByText':
      return analyzer.findByText(candidate.selector);
    case 'getByLabel':
      return analyzer.findByAttribute('aria-label', candidate.selector);
    case 'getByPlaceholder':
      return analyzer.findByAttribute('placeholder', candidate.selector);
    case 'getByAltText':
      return analyzer.findByAttribute('alt', candidate.selector);
    case 'getByTitle':
      return analyzer.findByAttribute('title', candidate.selector);
    default:
      return [];
  }
}
