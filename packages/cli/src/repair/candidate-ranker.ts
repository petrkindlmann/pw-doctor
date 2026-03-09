import type { RepairCandidate } from '@pw-doctor/shared';

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

interface RankingOptions {
  autoApplyThreshold?: number;
  suggestThreshold?: number;
}

export function rankCandidates(
  candidates: RepairCandidate[],
  options?: RankingOptions,
): RankedCandidate[] {
  const autoThreshold = options?.autoApplyThreshold ?? 85;
  const suggestThreshold = options?.suggestThreshold ?? 50;

  return candidates
    .map((candidate) => {
      const resilience = METHOD_RESILIENCE[candidate.method] ?? 0;
      const finalScore = candidate.confidence + resilience;

      let category: CandidateCategory;
      if (candidate.confidence >= autoThreshold) {
        category = 'auto_apply';
      } else if (candidate.confidence >= suggestThreshold) {
        category = 'suggest';
      } else {
        category = 'skip';
      }

      return { candidate, finalScore, category };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

export function selectBestCandidate(
  candidates: RepairCandidate[],
  options?: RankingOptions,
): RankedCandidate | null {
  const ranked = rankCandidates(candidates, options);
  return ranked.length > 0 ? ranked[0] : null;
}
