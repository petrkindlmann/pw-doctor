import { describe, it, expect } from 'vitest';
import { rankCandidates, type RankedCandidate } from '../../src/repair/candidate-ranker.js';
import type { RepairCandidate } from '@pw-doctor/shared';

function makeCandidate(overrides: Partial<RepairCandidate>): RepairCandidate {
  return {
    selector: '.test',
    method: 'locator',
    confidence: 50,
    strategy: 'text_match',
    reasoning: 'test',
    elementMatch: {
      tag: 'button',
      text: 'Test',
      attributes: {},
      isVisible: true,
      isUnique: true,
    },
    ...overrides,
  };
}

describe('rankCandidates', () => {
  it('ranks by confidence (highest first)', () => {
    const candidates = [
      makeCandidate({ confidence: 60, selector: 'low' }),
      makeCandidate({ confidence: 90, selector: 'high' }),
      makeCandidate({ confidence: 75, selector: 'mid' }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].candidate.selector).toBe('high');
    expect(ranked[2].candidate.selector).toBe('low');
  });

  it('prefers getByTestId over locator at same confidence', () => {
    const candidates = [
      makeCandidate({ confidence: 80, method: 'locator', selector: 'a' }),
      makeCandidate({ confidence: 80, method: 'getByTestId', selector: 'b' }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].candidate.method).toBe('getByTestId');
  });

  it('categorizes by threshold', () => {
    const candidates = [
      makeCandidate({ confidence: 90 }),
      makeCandidate({ confidence: 70 }),
      makeCandidate({ confidence: 40 }),
    ];
    const ranked = rankCandidates(candidates, { autoApplyThreshold: 85, suggestThreshold: 50 });
    expect(ranked[0].category).toBe('auto_apply');
    expect(ranked[1].category).toBe('suggest');
    expect(ranked[2].category).toBe('skip');
  });

  it('returns empty array for empty input', () => {
    expect(rankCandidates([])).toEqual([]);
  });
});
