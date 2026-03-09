import { describe, it, expect } from 'vitest';
import { computeFragilityScore } from '../../src/core/fragility-scorer.js';
import type { SelectorInfo } from '@pw-doctor/shared';

function makeSelector(overrides: Partial<SelectorInfo>): SelectorInfo {
  return {
    filePath: 'test.spec.ts',
    line: 1,
    column: 0,
    selectorValue: '.btn',
    selectorType: 'css',
    apiMethod: 'locator',
    isDynamic: false,
    contextCode: '',
    fragilityScore: 0,
    ...overrides,
  };
}

describe('computeFragilityScore', () => {
  it('scores data-testid as low fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'testid', selectorValue: 'submit-btn' }),
    );
    expect(score).toBeLessThan(30);
  });

  it('scores role selectors as low fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'role', selectorValue: 'button' }),
    );
    expect(score).toBeLessThan(30);
  });

  it('scores CSS class selectors as medium-high fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'css', selectorValue: '.btn-primary' }),
    );
    expect(score).toBeGreaterThan(50);
  });

  it('scores xpath as very high fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'xpath', selectorValue: '//div[1]/span' }),
    );
    expect(score).toBeGreaterThan(70);
  });

  it('scores dynamic selectors as maximum fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'dynamic', isDynamic: true }),
    );
    expect(score).toBeGreaterThan(80);
  });

  it('penalizes nth-child usage', () => {
    const without = computeFragilityScore(
      makeSelector({ selectorValue: '.list-item' }),
    );
    const with_ = computeFragilityScore(
      makeSelector({ selectorValue: '.list-item:nth-child(3)' }),
    );
    expect(with_).toBeGreaterThan(without);
  });

  it('clamps score between 0 and 100', () => {
    const score = computeFragilityScore(
      makeSelector({
        selectorType: 'testid',
        selectorValue: '[data-testid="x"]',
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
