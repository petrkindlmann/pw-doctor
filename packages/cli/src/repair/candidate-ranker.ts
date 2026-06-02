import type { RepairCandidate, RepairStrategy } from '@pw-doctor/shared';
import { scoreSelectorStringFragility } from '../core/fragility-scorer.js';

export type CandidateCategory = 'auto_apply' | 'suggest' | 'skip';

export interface RankedCandidate {
  candidate: RepairCandidate;
  finalScore: number;
  category: CandidateCategory;
}

const METHOD_RESILIENCE: Record<string, number> = {
  getByTestId: 5,
  getByRole: 4,
  getByLabel: 3,
  getByText: 2,
  getByPlaceholder: 2,
  getByAltText: 2,
  getByTitle: 2,
  locator: 0,
};

/**
 * Strategy priority for deterministic tie-breaking. Higher wins. Attribute and
 * text matches are preferred over positional/structural ones at equal score.
 */
const STRATEGY_PRIORITY: Record<RepairStrategy, number> = {
  attribute_match: 5,
  text_match: 4,
  anchor_match: 3,
  ai: 2,
  structural_match: 1,
};

/**
 * How strongly selector fragility pulls the final score down. A `locator` CSS
 * selector full of nth-child/hashed classes can lose to a lower-confidence but
 * robust getByRole candidate.
 */
const FRAGILITY_WEIGHT = 0.25;

interface RankingOptions {
  autoApplyThreshold?: number;
  suggestThreshold?: number;
}

/**
 * Compute the final score for a candidate: confidence, plus a method-resilience
 * bonus, minus a fragility penalty. Mutates the candidate to record `fragility`
 * and append the penalty/bonus to its `reasons` breakdown so the reporter can
 * explain the ranking.
 */
function computeFinalScore(candidate: RepairCandidate): number {
  const resilience = METHOD_RESILIENCE[candidate.method] ?? 0;
  const { score: fragility } = scoreSelectorStringFragility(
    candidate.selector,
    candidate.method,
  );
  candidate.fragility = fragility;

  const penalty = Math.round(fragility * FRAGILITY_WEIGHT);
  const finalScore = candidate.confidence + resilience - penalty;

  const reasons = candidate.reasons ?? [];
  if (resilience) reasons.push(`${candidate.method} resilience +${resilience}`);
  if (penalty) reasons.push(`fragility (${fragility}) -${penalty}`);
  candidate.reasons = reasons;

  return finalScore;
}

export function rankCandidates(
  candidates: RepairCandidate[],
  options?: RankingOptions,
): RankedCandidate[] {
  const autoThreshold = options?.autoApplyThreshold ?? 85;
  const suggestThreshold = options?.suggestThreshold ?? 50;

  return candidates
    .map((candidate) => {
      const finalScore = computeFinalScore(candidate);

      // Bucketize on the FINAL score (after resilience + fragility), so the
      // auto-apply gate and the ranking agree. A fragile selector that scores
      // 90 raw but 70 final will not silently auto-apply.
      let category: CandidateCategory;
      if (finalScore >= autoThreshold) {
        category = 'auto_apply';
      } else if (finalScore >= suggestThreshold) {
        category = 'suggest';
      } else {
        category = 'skip';
      }

      return { candidate, finalScore, category };
    })
    .sort((a, b) => {
      // Deterministic tie-break chain so ranking never depends on input order.
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      const rb = METHOD_RESILIENCE[b.candidate.method] ?? 0;
      const ra = METHOD_RESILIENCE[a.candidate.method] ?? 0;
      if (rb !== ra) return rb - ra;
      const pb = STRATEGY_PRIORITY[b.candidate.strategy] ?? 0;
      const pa = STRATEGY_PRIORITY[a.candidate.strategy] ?? 0;
      if (pb !== pa) return pb - pa;
      return a.candidate.selector.localeCompare(b.candidate.selector);
    });
}

export function selectBestCandidate(
  candidates: RepairCandidate[],
  options?: RankingOptions,
): RankedCandidate | null {
  const ranked = rankCandidates(candidates, options);
  return ranked.length > 0 ? ranked[0] : null;
}
