import { describe, it, expect } from 'vitest';
import {
  computeFragilityScore,
  scoreFragility,
  scoreSelectorStringFragility,
  enrichWithFragility,
} from '../../src/core/fragility-scorer.js';
import type { SelectorInfo, SelectorType } from '@pw-doctor/shared';

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

/** Score a raw CSS selector value (base type held constant at css). */
function css(value: string): number {
  return computeFragilityScore(makeSelector({ selectorType: 'css', selectorValue: value }));
}

describe('fragility per-penalty deltas (css base held constant)', () => {
  it('nth-child adds +15 over the same-shape selector without it', () => {
    // Both have combinators=0, dotCount=1, so only the nth-child token differs.
    const withToken = css('.item:nth-child(2)');
    const without = css('.item');
    expect(withToken - without).toBe(15);
  });

  it('nth-of-type adds +15 over the same-shape selector without it', () => {
    const withToken = css('.item:nth-of-type(2)');
    const without = css('.item');
    expect(withToken - without).toBe(15);
  });

  it('Playwright chained ">>" adds +10 (combinator count held equal)', () => {
    // "div>>span" and "div>span>p" both count 2 combinators (+8 chain),
    // isolating the +10 ">>" penalty as the only difference.
    const withToken = css('div>>span');
    const without = css('div>span>p');
    expect(withToken - without).toBe(10);
  });

  it(':has() relational adds +5 (dot count held equal)', () => {
    // ".item:has(.x)" and ".item.x" both have dotCount=2 (no class-chain penalty),
    // isolating the +5 :has() penalty.
    const withToken = css('.item:has(.x)');
    const without = css('.item.x');
    expect(withToken - without).toBe(5);
  });

  it(':nth() adds +10 over the same-shape selector without it', () => {
    const withToken = css('.item:nth(2)');
    const without = css('.item');
    expect(withToken - without).toBe(10);
  });

  it('more than two class dots adds +10', () => {
    // 4 dots (>2) triggers the long-class-chain penalty; 2 dots does not.
    const withToken = css('.a.b.c.d');
    const without = css('.a.b');
    expect(withToken - without).toBe(10);
  });
});

describe('hashed / generated class penalty', () => {
  it('emotion-style "css-1a2b3c" scores higher than a semantic class', () => {
    expect(css('css-1a2b3c')).toBeGreaterThan(css('login-button'));
  });

  it('hex-suffixed class "btn-9f3a2b1" scores higher than a semantic class', () => {
    expect(css('btn-9f3a2b1')).toBeGreaterThan(css('login-button'));
  });
});

describe('layout-only / utility class penalty', () => {
  it('.container scores higher than a semantic class', () => {
    expect(css('.container')).toBeGreaterThan(css('.login-button'));
  });

  it('.row scores higher than a semantic class', () => {
    expect(css('.row')).toBeGreaterThan(css('.login-button'));
  });

  it('.col-md-6 scores higher than a semantic class', () => {
    expect(css('.col-md-6')).toBeGreaterThan(css('.login-button'));
  });
});

describe('long descendant chain penalty', () => {
  it('a 3+ combinator chain gets the long-chain penalty over a plain tag', () => {
    const chain = css('div > ul > li > a');
    const plain = css('div');
    // chain has many combinators (>=3) => +15 long-chain; plain has none.
    expect(chain - plain).toBe(15);
  });

  it('the long-chain reason names the combinator count', () => {
    const { reasons } = scoreFragility(
      makeSelector({ selectorType: 'css', selectorValue: 'div > ul > li > a' }),
    );
    expect(reasons.some((r) => /descendant chain/.test(r))).toBe(true);
  });
});

describe('specificity bonuses', () => {
  it('a clean static id "#submit-form" scores lower than a bare ".btn"', () => {
    expect(css('#submit-form')).toBeLessThan(css('.btn'));
  });

  it('presence of data-testid lowers the score', () => {
    // Same attribute-selector shape, only the attribute name differs.
    const withTestid = css('[data-testid=submit]');
    const withoutTestid = css('[data-foo=submit]');
    expect(withTestid).toBeLessThan(withoutTestid);
    expect(withTestid - withoutTestid).toBe(-20);
  });
});

describe('type base-score ordering', () => {
  const baseFor = (selectorType: SelectorType): number =>
    // "x" has no penalties or bonuses, so this isolates the base score.
    computeFragilityScore(makeSelector({ selectorType, selectorValue: 'x' }));

  it('is monotonic across the unambiguous types', () => {
    expect(baseFor('testid')).toBeLessThan(baseFor('role'));
    expect(baseFor('role')).toBeLessThan(baseFor('label'));
    expect(baseFor('label')).toBeLessThan(baseFor('title'));
    expect(baseFor('title')).toBeLessThan(baseFor('placeholder'));
    expect(baseFor('placeholder')).toBeLessThan(baseFor('text'));
    expect(baseFor('text')).toBeLessThan(baseFor('css'));
    expect(baseFor('css')).toBeLessThan(baseFor('xpath'));
    expect(baseFor('xpath')).toBeLessThan(baseFor('dynamic'));
  });

  it('placeholder and alttext share the same base score', () => {
    expect(baseFor('placeholder')).toBe(baseFor('alttext'));
  });

  it('exposes the documented numeric base scores', () => {
    expect(baseFor('testid')).toBe(10);
    expect(baseFor('role')).toBe(15);
    expect(baseFor('label')).toBe(20);
    expect(baseFor('title')).toBe(25);
    expect(baseFor('placeholder')).toBe(30);
    expect(baseFor('alttext')).toBe(30);
    expect(baseFor('text')).toBe(40);
    expect(baseFor('css')).toBe(65);
    expect(baseFor('xpath')).toBe(80);
    expect(baseFor('dynamic')).toBe(90);
  });
});

describe('scoreSelectorStringFragility', () => {
  it('matches the type ordering for known Playwright methods', () => {
    const testid = scoreSelectorStringFragility('submit', 'getByTestId').score;
    const role = scoreSelectorStringFragility('button', 'getByRole').score;
    expect(testid).toBe(10);
    expect(role).toBe(15);
    expect(testid).toBeLessThan(role);
  });

  it('detects a clean static id inside locator() and applies the id base + bonus', () => {
    const { score, reasons } = scoreSelectorStringFragility('#submit-form', 'locator');
    // id base 35 + clean-static-id bonus -10 = 25.
    expect(score).toBe(25);
    expect(reasons.some((r) => /clean static id/.test(r))).toBe(true);
  });
});

describe('scoreFragility reasons', () => {
  it('always returns a non-empty reasons array (base reason present)', () => {
    const { reasons } = scoreFragility(
      makeSelector({ selectorType: 'css', selectorValue: '.btn' }),
    );
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("a fragile selector's reasons include the penalty label", () => {
    const { reasons } = scoreFragility(
      makeSelector({ selectorType: 'css', selectorValue: '.item:nth-child(2)' }),
    );
    expect(reasons.some((r) => r.includes('nth-child'))).toBe(true);
  });
});

describe('score clamping to [0, 100]', () => {
  it('clamps a heavily penalized selector at 100', () => {
    const value =
      'div:nth-child(2) > ul:nth-of-type(3) >> li.a.b.c.d css-1a2b3c .container';
    const { score, reasons } = scoreFragility(
      makeSelector({ selectorType: 'dynamic', selectorValue: value }),
    );
    expect(score).toBe(100);
    expect(reasons.some((r) => /clamped to 100/.test(r))).toBe(true);
  });

  it('never produces a score below 0 even with stacked bonuses', () => {
    // testid base 10 with data-testid bonus would underflow without clamping.
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'testid', selectorValue: '[data-testid=x]' }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('enrichWithFragility', () => {
  it('populates fragilityScore on each selector to match computeFragilityScore', () => {
    const input = [
      makeSelector({ selectorType: 'testid', selectorValue: 'submit-btn' }),
      makeSelector({ selectorType: 'css', selectorValue: '.item:nth-child(2)' }),
    ];
    const enriched = enrichWithFragility(input);
    expect(enriched).toHaveLength(2);
    for (let i = 0; i < input.length; i++) {
      expect(enriched[i].fragilityScore).toBe(computeFragilityScore(input[i]));
    }
    // does not mutate input
    expect(input[0].fragilityScore).toBe(0);
  });
});
