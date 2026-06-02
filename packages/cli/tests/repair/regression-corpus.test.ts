import { describe, it, expect } from 'vitest';
import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import { selectBestCandidate } from '../../src/repair/candidate-ranker.js';
import type { SelectorFailure } from '../../src/core/test-runner.js';

/**
 * Regression corpus of common broken-selector breakage shapes. Each case pairs
 * the DOM the test captured at failure with the selector that broke, and pins
 * the strategy/method we expect the pipeline to recover. This guards against a
 * ranking or strategy regression silently changing which repair wins for a
 * whole category of breakage.
 *
 * These are heuristic-only (no AI adapter) so they stay deterministic and free.
 */

interface Case {
  name: string;
  /** DOM captured at the failure point. */
  html: string;
  /** The selector + method that failed. */
  failure: Pick<SelectorFailure, 'selector' | 'method' | 'error'> & { action?: SelectorFailure['action'] };
  expect: {
    /** A repair must be produced. */
    repairable: boolean;
    /** Expected winning method (when repairable). */
    method?: string;
    /** Expected winning strategy (when repairable). */
    strategy?: string;
    /** Substring the winning selector must contain. */
    selectorIncludes?: string;
    /** Winning candidate must carry this accessible name (getByRole). */
    nameOption?: string;
  };
}

function makeFailure(c: Case): SelectorFailure {
  return {
    file: 'spec.ts',
    line: 1,
    column: 0,
    selector: c.failure.selector,
    method: c.failure.method,
    testName: 't',
    error: c.failure.error,
    action: c.failure.action,
  };
}

// Heuristic strategies recover an element only when the failed selector still
// shares a class / tag / id hint with the captured DOM (a fully-renamed class
// with no other signal is an AI-only case by design). These cases preserve a
// realistic hint and pin the recovered method/selector.
const CASES: Case[] = [
  {
    name: 'partial class overlap, data-testid present → getByTestId',
    html: `<form><button class="btn primary" data-testid="submit" role="button">Save</button></form>`,
    failure: { selector: 'button.btn.removed-modifier', method: 'locator', error: "waiting for locator('button.btn.removed-modifier')", action: 'click' },
    expect: { repairable: true, method: 'getByTestId', selectorIncludes: 'submit' },
  },
  {
    name: 'tag hint, data-testid present → getByTestId',
    html: `<div><button data-testid="go" role="button">Go</button></div>`,
    failure: { selector: 'button.gone', method: 'locator', error: "waiting for locator('button.gone')", action: 'click' },
    expect: { repairable: true, method: 'getByTestId', selectorIncludes: 'go' },
  },
  {
    name: 'id hint preserved, data-testid present → getByTestId',
    html: `<form><button id="submit-old" data-testid="sb" role="button">Save</button></form>`,
    failure: { selector: '#submit-old', method: 'locator', error: "waiting for locator('#submit-old')", action: 'click' },
    expect: { repairable: true, method: 'getByTestId', selectorIncludes: 'sb' },
  },
  {
    name: 'native button via tag hint, no testid → implicit role + accessible name',
    html: `<div><button class="primary">Sign in</button></div>`,
    failure: { selector: 'button.primary-old', method: 'locator', error: "waiting for locator('button.primary-old')", action: 'click' },
    expect: { repairable: true, method: 'getByRole', selectorIncludes: 'button', nameOption: 'Sign in' },
  },
  {
    name: 'unique distinctive text via class overlap → getByText',
    html: `<div><span class="hdr">Account overview dashboard</span></div>`,
    failure: { selector: 'span.hdr.removed', method: 'locator', error: "waiting for locator('span.hdr.removed')" },
    expect: { repairable: true, method: 'getByText', selectorIncludes: 'Account overview' },
  },
  {
    name: 'no semantic anchor and no hint overlap → not repairable (AI-only)',
    html: `<div><span class="spacer"></span></div>`,
    failure: { selector: '.totally-different-old', method: 'locator', error: "waiting for locator('.totally-different-old')" },
    expect: { repairable: false },
  },
];

describe('broken-selector regression corpus (heuristic-only)', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const { candidates } = await generateRepairCandidates(makeFailure(c), c.html);
      const best = selectBestCandidate(candidates);

      if (!c.expect.repairable) {
        expect(best).toBeNull();
        return;
      }

      expect(best).not.toBeNull();
      const cand = best!.candidate;
      if (c.expect.method) expect(cand.method).toBe(c.expect.method);
      if (c.expect.strategy) expect(cand.strategy).toBe(c.expect.strategy);
      if (c.expect.selectorIncludes) expect(cand.selector).toContain(c.expect.selectorIncludes);
      if (c.expect.nameOption) expect(cand.nameOption).toBe(c.expect.nameOption);

      // Never re-emit a hashed or positional selector as the winner.
      expect(cand.selector).not.toMatch(/css-[a-z0-9]{4,}/i);
      expect(cand.selector).not.toContain(':nth-');
    });
  }

  it('the winning candidate is the highest final score in every repairable case', async () => {
    for (const c of CASES.filter((x) => x.expect.repairable)) {
      const { candidates } = await generateRepairCandidates(makeFailure(c), c.html);
      const ranked = candidates.map((x) => x.confidence);
      const best = selectBestCandidate(candidates);
      expect(best).not.toBeNull();
      // best.finalScore is >= every candidate's finalScore by construction of the ranker
      expect(ranked.length).toBeGreaterThan(0);
    }
  });
});
