import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer } from '../core/dom-analyzer.js';

interface TextMatchInput {
  failedSelector: string;
  failedMethod: string;
  contextCode: string;
  analyzer: DomAnalyzer;
}

export function tryTextMatch(input: TextMatchInput): RepairCandidate | null {
  const { failedSelector, analyzer } = input;

  // Strategy: Find the element the old selector pointed to by matching
  // CSS class/ID in the DOM, then generate a text-based selector for it.

  // 1. Try to find the element using the old selector
  const elements = analyzer.findByCss(failedSelector);
  if (elements.length === 0) return null;

  // 2. Get the text content of the matched element
  const target = elements[0];
  const text = target.text.trim();
  if (!text || text.length > 50) return null;

  // 3. Check if text content is unique
  const textMatches = analyzer.findByText(text);
  const isUnique = textMatches.length === 1;

  // 4. Use getByText if text is unique
  if (isUnique && text.length <= 30) {
    return {
      selector: text,
      method: 'getByText',
      confidence: computeTextMatchConfidence(target, isUnique),
      strategy: 'text_match',
      reasoning: `Found unique element with text "${text}"`,
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
