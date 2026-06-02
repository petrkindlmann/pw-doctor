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

  it('categorizes by FINAL score (confidence + resilience − fragility), not raw confidence', () => {
    // A robust getByTestId at 90 clears auto_apply; a getByText at 70 lands in
    // suggest; a getByText at 40 is skipped. Using stable, low-fragility
    // selectors so the bucketing reflects the threshold, not the penalty.
    const candidates = [
      makeCandidate({ confidence: 90, method: 'getByTestId', selector: 'submit' }),
      makeCandidate({ confidence: 70, method: 'getByText', selector: 'Sign in now' }),
      makeCandidate({ confidence: 40, method: 'getByText', selector: 'Welcome back friend' }),
    ];
    const ranked = rankCandidates(candidates, { autoApplyThreshold: 85, suggestThreshold: 50 });
    const byMethod = Object.fromEntries(ranked.map((r) => [r.candidate.method + r.candidate.selector, r.category]));
    expect(byMethod['getByTestIdsubmit']).toBe('auto_apply');
    expect(byMethod['getByTextSign in now']).toBe('suggest');
    expect(byMethod['getByTextWelcome back friend']).toBe('skip');
  });

  it('down-ranks a fragile high-confidence CSS selector below a robust one', () => {
    // Raw confidence is equal, but the nth-child CSS locator is fragile and
    // should lose to the getByRole candidate after the fragility penalty.
    const candidates = [
      makeCandidate({ confidence: 80, method: 'locator', selector: 'div.container > ul li:nth-child(3) a', strategy: 'structural_match' }),
      makeCandidate({ confidence: 80, method: 'getByRole', selector: 'link', strategy: 'attribute_match' }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].candidate.method).toBe('getByRole');
    // The fragile candidate should carry a recorded fragility and a penalty reason.
    const fragile = ranked.find((r) => r.candidate.method === 'locator')!;
    expect(fragile.candidate.fragility).toBeGreaterThan(0);
    expect(fragile.candidate.reasons?.some((r) => r.includes('fragility'))).toBe(true);
  });

  it('breaks ties deterministically (resilience, then strategy, then selector)', () => {
    // Equal final score, different methods → higher resilience wins.
    const a = makeCandidate({ confidence: 80, method: 'getByLabel', selector: 'x', strategy: 'attribute_match' });
    const b = makeCandidate({ confidence: 81, method: 'getByText', selector: 'y', strategy: 'text_match' });
    // getByLabel resilience 3 (80+3=83), getByText resilience 2 (81+2=83): tie on 83 → getByLabel wins.
    const ranked = rankCandidates([b, a]);
    expect(ranked[0].candidate.method).toBe('getByLabel');
  });

  it('returns empty array for empty input', () => {
    expect(rankCandidates([])).toEqual([]);
  });
});
