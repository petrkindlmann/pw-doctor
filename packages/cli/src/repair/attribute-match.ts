import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer } from '../core/dom-analyzer.js';

interface AttributeMatchInput {
  failedSelector: string;
  failedMethod: string;
  analyzer: DomAnalyzer;
}

export function tryAttributeMatch(input: AttributeMatchInput): RepairCandidate | null {
  const { failedSelector, analyzer } = input;

  // 1. Find the element using the old CSS selector
  const elements = analyzer.findByCss(failedSelector);
  if (elements.length === 0) return null;

  const target = elements[0];
  const text = target.text.trim();

  // 2. Check for data-testid (highest priority)
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

  // 3. Check for role attribute
  if (target.attributes['role']) {
    const role = target.attributes['role'];
    return {
      selector: role,
      method: 'getByRole',
      confidence: computeAttrConfidence(false, target.isVisible, 'role'),
      strategy: 'attribute_match',
      reasoning: `Element has role="${role}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique: false,
      },
    };
  }

  // 4. Check for aria-label
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
