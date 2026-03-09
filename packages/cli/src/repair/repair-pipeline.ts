import type { RepairCandidate } from '@pw-doctor/shared';
import type { SelectorFailure } from '../core/test-runner.js';
import { DomAnalyzer } from '../core/dom-analyzer.js';
import { tryTextMatch } from './text-match.js';
import { tryAttributeMatch } from './attribute-match.js';
import { rankCandidates, selectBestCandidate, type RankedCandidate } from './candidate-ranker.js';

export function generateRepairCandidates(
  failure: SelectorFailure,
  html: string,
): RepairCandidate[] {
  const analyzer = new DomAnalyzer(html);
  const candidates: RepairCandidate[] = [];

  // Strategy 1: Attribute match (highest confidence for semantic selectors)
  const attrCandidate = tryAttributeMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    analyzer,
  });
  if (attrCandidate) candidates.push(attrCandidate);

  // Strategy 2: Text match
  const textCandidate = tryTextMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    contextCode: '',
    analyzer,
  });
  if (textCandidate) candidates.push(textCandidate);

  return candidates;
}

export interface RepairPlan {
  failure: SelectorFailure;
  bestCandidate: RankedCandidate | null;
  allCandidates: RankedCandidate[];
}

export function buildRepairPlan(
  failure: SelectorFailure,
  html: string,
  options?: { autoApplyThreshold?: number; suggestThreshold?: number },
): RepairPlan {
  const candidates = generateRepairCandidates(failure, html);
  const ranked = rankCandidates(candidates, options);
  const best = selectBestCandidate(candidates, options);

  return {
    failure,
    bestCandidate: best,
    allCandidates: ranked,
  };
}
