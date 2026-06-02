import { describe, it, expect } from 'vitest';
import {
  rankCandidates,
  selectBestCandidate,
} from '../../src/repair/candidate-ranker.js';
import { scoreSelectorStringFragility } from '../../src/core/fragility-scorer.js';
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

// Mirror the ranker's finalScore math so the boundary cases are pinned to the
// real fragility scorer instead of hand-copied constants.
const METHOD_RESILIENCE: Record<string, number> = {
  getByTestId: 5,
  getByRole: 4,
  getByLabel: 3,
  getByText: 2,
  locator: 0,
};

function expectedFinalScore(selector: string, method: string, confidence: number): number {
  const { score: fragility } = scoreSelectorStringFragility(selector, method);
  const resilience = METHOD_RESILIENCE[method] ?? 0;
  const penalty = Math.round(fragility * 0.25);
  return confidence + resilience - penalty;
}

describe('rankCandidates — bucket boundaries', () => {
  it('a candidate whose FINAL score is exactly autoApplyThreshold buckets to auto_apply (>=)', () => {
    // getByTestId('x'): fragility 10 → penalty round(10*0.25)=3, resilience +5.
    // finalScore = confidence + 5 - 3 = confidence + 2.
    // Pick confidence 83 and threshold 85 so finalScore == 85 exactly.
    const fragility = scoreSelectorStringFragility('x', 'getByTestId').score;
    expect(fragility).toBe(10);
    const penalty = Math.round(fragility * 0.25);
    expect(penalty).toBe(3);

    const confidence = 83;
    const threshold = 85;
    const finalScore = expectedFinalScore('x', 'getByTestId', confidence);
    expect(finalScore).toBe(threshold); // exact boundary

    const [ranked] = rankCandidates(
      [makeCandidate({ selector: 'x', method: 'getByTestId', confidence, strategy: 'attribute_match' })],
      { autoApplyThreshold: threshold, suggestThreshold: 50 },
    );
    expect(ranked.finalScore).toBe(threshold);
    expect(ranked.category).toBe('auto_apply');
  });

  it('a candidate whose FINAL score is exactly suggestThreshold buckets to suggest (>=) and not auto_apply', () => {
    // Same getByTestId('x') shape: finalScore = confidence + 2.
    // confidence 48, suggestThreshold 50 → finalScore == 50 exactly, below auto 85.
    const confidence = 48;
    const suggestThreshold = 50;
    const finalScore = expectedFinalScore('x', 'getByTestId', confidence);
    expect(finalScore).toBe(suggestThreshold);

    const [ranked] = rankCandidates(
      [makeCandidate({ selector: 'x', method: 'getByTestId', confidence, strategy: 'attribute_match' })],
      { autoApplyThreshold: 85, suggestThreshold },
    );
    expect(ranked.finalScore).toBe(suggestThreshold);
    expect(ranked.category).toBe('suggest');
  });

  it('one point below suggestThreshold buckets to skip (strict boundary check)', () => {
    // finalScore = confidence + 2; confidence 47 → 49, just under suggest 50.
    const confidence = 47;
    const finalScore = expectedFinalScore('x', 'getByTestId', confidence);
    expect(finalScore).toBe(49);

    const [ranked] = rankCandidates(
      [makeCandidate({ selector: 'x', method: 'getByTestId', confidence, strategy: 'attribute_match' })],
      { autoApplyThreshold: 85, suggestThreshold: 50 },
    );
    expect(ranked.category).toBe('skip');
  });
});

describe('rankCandidates — METHOD_RESILIENCE ladder ordering', () => {
  it('orders getByTestId > getByRole > getByLabel > getByText > locator at equal confidence and simple selectors', () => {
    const confidence = 80;
    // Confirm each method maps to a low-fragility type with a strictly
    // descending final score, so the ranked order reflects the ladder.
    const expected = [
      { method: 'getByTestId', selector: 'one' },
      { method: 'getByRole', selector: 'two' },
      { method: 'getByLabel', selector: 'three' },
      { method: 'getByText', selector: 'four' },
      { method: 'locator', selector: 'five' },
    ];
    const scores = expected.map((e) => expectedFinalScore(e.selector, e.method, confidence));
    // Strictly descending — the ladder is unambiguous, no ties to resolve.
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThan(scores[i]);
    }

    // Deliberately shuffle input so we exercise the sort, not insertion order.
    const candidates = [
      makeCandidate({ confidence, method: 'getByText', selector: 'four', strategy: 'text_match' }),
      makeCandidate({ confidence, method: 'locator', selector: 'five', strategy: 'structural_match' }),
      makeCandidate({ confidence, method: 'getByTestId', selector: 'one', strategy: 'attribute_match' }),
      makeCandidate({ confidence, method: 'getByLabel', selector: 'three', strategy: 'attribute_match' }),
      makeCandidate({ confidence, method: 'getByRole', selector: 'two', strategy: 'attribute_match' }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked.map((r) => r.candidate.method)).toEqual([
      'getByTestId',
      'getByRole',
      'getByLabel',
      'getByText',
      'locator',
    ]);
  });
});

describe('rankCandidates — deterministic full tie-break', () => {
  it('orders two fully-tied candidates by selector localeCompare', () => {
    // Identical method (resilience), strategy, and selector fragility shape →
    // identical finalScore. Only the selector string differs; lower
    // localeCompare sorts first and the result is stable regardless of input
    // order.
    const high = makeCandidate({
      confidence: 70,
      method: 'getByTestId',
      selector: 'zeta',
      strategy: 'attribute_match',
    });
    const low = makeCandidate({
      confidence: 70,
      method: 'getByTestId',
      selector: 'alpha',
      strategy: 'attribute_match',
    });

    // Same final score (same confidence + resilience + fragility-shape).
    const sZeta = expectedFinalScore('zeta', 'getByTestId', 70);
    const sAlpha = expectedFinalScore('alpha', 'getByTestId', 70);
    expect(sZeta).toBe(sAlpha);

    // Order is independent of input order.
    const r1 = rankCandidates([high, low]);
    const r2 = rankCandidates([low, high]);
    expect(r1.map((r) => r.candidate.selector)).toEqual(['alpha', 'zeta']);
    expect(r2.map((r) => r.candidate.selector)).toEqual(['alpha', 'zeta']);
    expect('alpha'.localeCompare('zeta')).toBeLessThan(0);
  });
});

describe('selectBestCandidate', () => {
  it('returns the head of rankCandidates for non-empty input', () => {
    const candidates = [
      makeCandidate({ confidence: 60, method: 'locator', selector: 'lo' }),
      makeCandidate({ confidence: 90, method: 'getByTestId', selector: 'hi', strategy: 'attribute_match' }),
    ];
    const best = selectBestCandidate(candidates);
    const ranked = rankCandidates(candidates);
    expect(best).not.toBeNull();
    expect(best).toEqual(ranked[0]);
    expect(best!.candidate.selector).toBe('hi');
  });

  it('returns null for empty input', () => {
    expect(selectBestCandidate([])).toBeNull();
  });
});

describe('rankCandidates — fragility recording', () => {
  it('records a numeric candidate.fragility and appends a fragility reason when penalty > 0', () => {
    // locator on a CSS selector → high base fragility (65), penalty 16 > 0.
    const candidate = makeCandidate({
      confidence: 80,
      method: 'locator',
      selector: 'div.container > ul li:nth-child(3) a',
      strategy: 'structural_match',
    });
    const [ranked] = rankCandidates([candidate]);

    expect(typeof ranked.candidate.fragility).toBe('number');
    expect(ranked.candidate.fragility).toBeGreaterThan(0);

    const { score: fragility } = scoreSelectorStringFragility(
      candidate.selector,
      'locator',
    );
    expect(ranked.candidate.fragility).toBe(fragility);

    const penalty = Math.round(fragility * 0.25);
    expect(penalty).toBeGreaterThan(0);
    const reasons = ranked.candidate.reasons ?? [];
    expect(reasons.some((r) => r.includes(`fragility (${fragility}) -${penalty}`))).toBe(true);
  });

  it('does not append a fragility reason when the penalty rounds to 0', () => {
    // getByTestId('x') → fragility 10, penalty round(2.5)=3, which is > 0, so
    // pick a selector whose fragility rounds the penalty to 0. fragility must
    // be 0 or 1 for round(f*0.25)==0. data-testid on testid type subtracts 20
    // then clamps to 0.
    const selector = '[data-testid="ok"]';
    const { score: fragility } = scoreSelectorStringFragility(selector, 'getByTestId');
    const penalty = Math.round(fragility * 0.25);
    expect(penalty).toBe(0);

    const candidate = makeCandidate({
      confidence: 80,
      method: 'getByTestId',
      selector,
      strategy: 'attribute_match',
    });
    const [ranked] = rankCandidates([candidate]);
    expect(ranked.candidate.fragility).toBe(fragility);
    const reasons = ranked.candidate.reasons ?? [];
    expect(reasons.some((r) => r.includes('fragility'))).toBe(false);
    // resilience reason is still recorded since getByTestId resilience is 5.
    expect(reasons.some((r) => r.includes('getByTestId resilience +5'))).toBe(true);
  });
});
