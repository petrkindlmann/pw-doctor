import { describe, it, expect, vi } from 'vitest';
import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import type { AiRepairAdapter } from '../../src/ai/ai-adapter.js';
import type { AiRepairResponse } from '@pw-doctor/shared';
import type { SelectorFailure } from '../../src/core/test-runner.js';

// ---------------------------------------------------------------------------
// HTML with a single, visible element that carries a unique data-testid the
// accepted-case test targets, plus an unrelated form. No element should match
// the heuristic strategies on `.does-not-exist` so we can cleanly attribute
// any `ai` candidate to the AI path.
// ---------------------------------------------------------------------------
const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Account</title></head>
<body>
  <main>
    <h1>Account settings</h1>
    <button type="submit" data-testid="save-account" role="button">Save</button>
    <a href="/help" class="help-link">Need help?</a>
  </main>
</body>
</html>`;

function makeFailure(overrides: Partial<SelectorFailure> = {}): SelectorFailure {
  return {
    file: 'tests/account.spec.ts',
    line: 7,
    column: 18,
    // A selector that matches NOTHING, so heuristic strategies do not produce
    // a competing candidate and the only possible `ai` candidate is the AI one.
    selector: '.does-not-exist-anywhere-123',
    method: 'locator',
    testName: 'save account',
    error: 'Timeout 30000ms exceeded.',
    ...overrides,
  };
}

/**
 * Build a mock AI adapter that returns exactly the given candidates.
 * Mirrors the adapter shape used in tests/e2e/ai-heal.test.ts.
 */
function makeAdapterReturning(
  candidates: AiRepairResponse['candidates'],
): AiRepairAdapter {
  return {
    provider: 'anthropic',
    suggestRepair: vi.fn().mockResolvedValue({
      candidates,
      tokensUsed: 100,
      provider: 'anthropic',
    } satisfies AiRepairResponse),
  };
}

function aiCandidates(candidates: { strategy: string }[]) {
  return candidates.filter((c) => c.strategy === 'ai');
}

describe('AI rejection through the repair pipeline', () => {
  // -------------------------------------------------------------------------
  // 1. Injection selectors are rejected by validateAiSelector → no ai candidate
  // -------------------------------------------------------------------------
  describe('injection selectors are rejected (validator gate)', () => {
    it('rejects a backtick injection selector', async () => {
      const adapter = makeAdapterReturning([
        {
          selector: 'div`;process.exit()',
          method: 'locator',
          confidence: 95,
          reasoning: 'malicious',
        },
      ]);

      const { candidates } = await generateRepairCandidates(makeFailure(), SAMPLE_HTML, {
        aiAdapter: adapter,
      });

      expect(adapter.suggestRepair).toHaveBeenCalledTimes(1);
      expect(aiCandidates(candidates)).toHaveLength(0);
    });

    it('rejects a semicolon injection selector', async () => {
      const adapter = makeAdapterReturning([
        {
          selector: 'a; rm -rf /',
          method: 'locator',
          confidence: 95,
          reasoning: 'malicious',
        },
      ]);

      const { candidates } = await generateRepairCandidates(makeFailure(), SAMPLE_HTML, {
        aiAdapter: adapter,
      });

      expect(aiCandidates(candidates)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Valid syntax but matches nothing → rejected by the DOM hard gate
  // -------------------------------------------------------------------------
  it('rejects a syntactically valid selector that matches no DOM element', async () => {
    const adapter = makeAdapterReturning([
      {
        selector: '#does-not-exist',
        method: 'locator',
        confidence: 88,
        reasoning: 'guessed id',
      },
    ]);

    const { candidates } = await generateRepairCandidates(makeFailure(), SAMPLE_HTML, {
      aiAdapter: adapter,
    });

    expect(adapter.suggestRepair).toHaveBeenCalledTimes(1);
    // The selector passes the validator but the dom-hard-gate sees 0 matches.
    expect(aiCandidates(candidates)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 3. Valid selector matching exactly ONE visible element → accepted as `ai`
  // -------------------------------------------------------------------------
  it('accepts a valid selector matching exactly one visible element', async () => {
    const adapter = makeAdapterReturning([
      {
        selector: 'save-account',
        method: 'getByTestId',
        confidence: 92,
        reasoning: 'unique data-testid on the save button',
      },
    ]);

    const { candidates } = await generateRepairCandidates(makeFailure(), SAMPLE_HTML, {
      aiAdapter: adapter,
    });

    const ai = aiCandidates(candidates);
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({
      selector: 'save-account',
      method: 'getByTestId',
      strategy: 'ai',
      confidence: 92,
    });
  });

  // -------------------------------------------------------------------------
  // 4. Other code-injection / structural rejections by the validator
  // -------------------------------------------------------------------------
  describe('code-injection selectors are rejected', () => {
    const hostile: Array<{ name: string; selector: string }> = [
      { name: 'eval()', selector: 'eval("alert(1)")' },
      { name: 'require()', selector: 'require("fs")' },
      { name: 'import statement', selector: 'import fs from "fs"' },
      { name: 'newline', selector: '#a\n#b' },
      { name: 'over 500 chars', selector: 'a'.repeat(600) },
    ];

    for (const { name, selector } of hostile) {
      it(`rejects a selector with ${name}`, async () => {
        const adapter = makeAdapterReturning([
          {
            selector,
            method: 'locator',
            confidence: 99,
            reasoning: 'hostile',
          },
        ]);

        const { candidates } = await generateRepairCandidates(makeFailure(), SAMPLE_HTML, {
          aiAdapter: adapter,
        });

        expect(aiCandidates(candidates)).toHaveLength(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Mixed batch: hostile + dead + good in one AI response. Only the good one
  // survives, proving the pipeline filters per-candidate (continue), not all
  // or nothing.
  // -------------------------------------------------------------------------
  it('filters per-candidate: only the valid+matching one survives a mixed batch', async () => {
    const adapter = makeAdapterReturning([
      { selector: 'div`;x', method: 'locator', confidence: 99, reasoning: 'inject' },
      { selector: '#nope', method: 'locator', confidence: 80, reasoning: 'dead' },
      { selector: 'save-account', method: 'getByTestId', confidence: 90, reasoning: 'good' },
    ]);

    const { candidates } = await generateRepairCandidates(makeFailure(), SAMPLE_HTML, {
      aiAdapter: adapter,
    });

    const ai = aiCandidates(candidates);
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ selector: 'save-account', method: 'getByTestId' });
  });
});
