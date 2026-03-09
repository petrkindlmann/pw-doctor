import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { buildRepairPlan } from '../../src/repair/repair-pipeline.js';
import { redactHtml } from '../../src/core/dom-redactor.js';
import { patchSelector } from '../../src/core/ast-patcher.js';
import type { AiRepairAdapter } from '../../src/ai/ai-adapter.js';
import type { AiRepairInput, AiRepairResponse } from '@pw-doctor/shared';
import { promptForCandidate, type InteractiveChoice } from '../../src/interactive/prompt.js';
import type { RankedCandidate } from '../../src/repair/candidate-ranker.js';
import type { RepairCandidate } from '@pw-doctor/shared';
import type { SelectorFailure } from '../../src/core/test-runner.js';

// ---------------------------------------------------------------------------
// Sample HTML with a <script> tag (to verify redaction strips it),
// and selector-relevant attributes (data-testid, role, etc.)
// ---------------------------------------------------------------------------
const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <script>window.__SECRET = 'abc123';</script>
  <main>
    <h1>Welcome Back</h1>
    <form data-testid="login-form" role="form">
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="Enter email" data-testid="email-input" />
      <label for="password">Password</label>
      <input id="password" type="password" placeholder="Enter password" />
      <button type="submit" class="btn-primary submit-btn" role="button" data-testid="login-submit">
        Sign In
      </button>
      <a href="/forgot" class="forgot-link">Forgot password?</a>
    </form>
  </main>
  <script src="https://cdn.example.com/tracker.js"></script>
</body>
</html>`;

const SAMPLE_TEST_CODE = `import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('/login');
  await page.locator('.submit-btn').click();
  await expect(page).toHaveURL('/dashboard');
});
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFailure(overrides: Partial<SelectorFailure> = {}): SelectorFailure {
  return {
    file: 'tests/login.spec.ts',
    line: 5,
    column: 14,
    selector: '.submit-btn',
    method: 'locator',
    testName: 'login flow',
    error: 'Timeout 30000ms exceeded.',
    ...overrides,
  };
}

function makeMockAdapter(response?: Partial<AiRepairResponse>): AiRepairAdapter {
  return {
    provider: 'anthropic',
    suggestRepair: vi.fn().mockResolvedValue({
      candidates: [
        {
          selector: 'login-submit',
          method: 'getByTestId',
          confidence: 90,
          reasoning: 'Found data-testid="login-submit" on the submit button',
        },
      ],
      tokensUsed: 500,
      provider: 'anthropic',
      ...response,
    } satisfies AiRepairResponse),
  };
}

function makeRankedCandidate(
  overrides: Partial<RepairCandidate> = {},
  score?: number,
  category?: 'auto_apply' | 'suggest' | 'skip',
): RankedCandidate {
  const candidate: RepairCandidate = {
    selector: '.submit-btn',
    method: 'locator',
    confidence: 80,
    strategy: 'attribute_match',
    reasoning: 'matched by attribute',
    elementMatch: {
      tag: 'button',
      text: 'Submit',
      attributes: {},
      isVisible: true,
      isUnique: true,
    },
    ...overrides,
  };
  return {
    candidate,
    finalScore: score ?? candidate.confidence,
    category: category ?? 'suggest',
  };
}

function createMockInput(lines: string[]): PassThrough {
  const pt = new PassThrough();
  let i = 0;
  const feedNext = () => {
    if (i < lines.length) {
      pt.write(lines[i] + '\n');
      i++;
      setImmediate(feedNext);
    } else {
      setImmediate(() => pt.end());
    }
  };
  setImmediate(feedNext);
  return pt;
}

function createMockOutput(): Writable & { data: string } {
  const chunks: string[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  }) as Writable & { data: string };
  Object.defineProperty(writable, 'data', {
    get: () => chunks.join(''),
  });
  return writable;
}

// ===========================================================================
// Test Suite 1: Full AI Heal Loop
// ===========================================================================

describe('Full AI Heal Loop', () => {
  it('buildRepairPlan merges heuristic and AI candidates', async () => {
    const mockAdapter = makeMockAdapter();
    const failure = makeFailure();

    const plan = await buildRepairPlan(failure, SAMPLE_HTML, {
      aiAdapter: mockAdapter,
    });

    // Should have called AI adapter
    expect(mockAdapter.suggestRepair).toHaveBeenCalledTimes(1);

    // Should have both heuristic and AI candidates
    const strategies = plan.allCandidates.map((rc) => rc.candidate.strategy);
    expect(strategies).toContain('ai');

    // Heuristic strategies should also be present (attribute_match, text_match, etc.)
    const nonAiStrategies = strategies.filter((s) => s !== 'ai');
    expect(nonAiStrategies.length).toBeGreaterThan(0);

    // AI candidate from the mock should be included
    const aiCandidate = plan.allCandidates.find((rc) => rc.candidate.strategy === 'ai');
    expect(aiCandidate).toBeDefined();
    expect(aiCandidate!.candidate.selector).toBe('login-submit');
    expect(aiCandidate!.candidate.method).toBe('getByTestId');
  });

  it('tracks AI token usage in the plan', async () => {
    const mockAdapter = makeMockAdapter({ tokensUsed: 1234 });
    const failure = makeFailure();

    const plan = await buildRepairPlan(failure, SAMPLE_HTML, {
      aiAdapter: mockAdapter,
    });

    expect(plan.aiTokensUsed).toBe(1234);
  });

  it('works without AI adapter (heuristics only)', async () => {
    const failure = makeFailure();

    const plan = await buildRepairPlan(failure, SAMPLE_HTML);

    // Should still have candidates from heuristics
    expect(plan.allCandidates.length).toBeGreaterThan(0);
    expect(plan.aiTokensUsed).toBeUndefined();

    // No AI candidates
    const aiCandidates = plan.allCandidates.filter((rc) => rc.candidate.strategy === 'ai');
    expect(aiCandidates).toHaveLength(0);
  });

  it('handles AI adapter failure gracefully (falls back to heuristics)', async () => {
    const errorAdapter: AiRepairAdapter = {
      provider: 'anthropic',
      suggestRepair: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')),
    };
    const failure = makeFailure();

    const plan = await buildRepairPlan(failure, SAMPLE_HTML, {
      aiAdapter: errorAdapter,
    });

    // Should still return heuristic candidates
    expect(plan.allCandidates.length).toBeGreaterThan(0);
    const aiCandidates = plan.allCandidates.filter((rc) => rc.candidate.strategy === 'ai');
    expect(aiCandidates).toHaveLength(0);
    expect(plan.aiTokensUsed).toBeUndefined();
  });

  it('redaction strips <script> tags before passing HTML to AI', async () => {
    // Verify redaction behavior directly
    const redacted = redactHtml(SAMPLE_HTML);

    // Scripts should be removed
    expect(redacted.html).not.toContain('<script');
    expect(redacted.html).not.toContain('window.__SECRET');
    expect(redacted.html).not.toContain('tracker.js');

    // But selector-relevant attributes should be preserved
    expect(redacted.html).toContain('data-testid="login-form"');
    expect(redacted.html).toContain('data-testid="email-input"');
    expect(redacted.html).toContain('data-testid="login-submit"');
    expect(redacted.html).toContain('role="button"');
    expect(redacted.html).toContain('role="form"');

    // Verify the stats
    expect(redacted.stats.elementsRemoved).toBeGreaterThanOrEqual(2); // At least 2 scripts
  });

  it('verifies AI receives the HTML passed to buildRepairPlan', async () => {
    const mockAdapter = makeMockAdapter();
    const failure = makeFailure();

    await buildRepairPlan(failure, SAMPLE_HTML, {
      aiAdapter: mockAdapter,
    });

    // Check the input passed to the mock adapter
    const callArgs = (mockAdapter.suggestRepair as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as AiRepairInput;
    expect(callArgs.failedSelector).toBe('.submit-btn');
    expect(callArgs.failedMethod).toBe('locator');
    expect(callArgs.errorMessage).toBe('Timeout 30000ms exceeded.');
    expect(callArgs.filePath).toBe('tests/login.spec.ts');
    expect(callArgs.line).toBe(5);
    // The pipeline passes HTML as-is to AI (caller responsible for redacting beforehand)
    expect(callArgs.redactedHtml).toBe(SAMPLE_HTML);
  });

  it('end-to-end: redact -> buildRepairPlan -> patchSelector', async () => {
    // Step 1: Redact HTML (remove scripts, sensitive data)
    const redacted = redactHtml(SAMPLE_HTML);
    expect(redacted.html).not.toContain('<script');

    // Step 2: Build repair plan with redacted HTML
    const mockAdapter = makeMockAdapter();
    const failure = makeFailure();

    const plan = await buildRepairPlan(failure, redacted.html, {
      aiAdapter: mockAdapter,
    });

    expect(plan.allCandidates.length).toBeGreaterThan(0);
    expect(plan.bestCandidate).not.toBeNull();

    // Step 3: The AI adapter should have been called with redacted HTML (no scripts)
    const callArgs = (mockAdapter.suggestRepair as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as AiRepairInput;
    expect(callArgs.redactedHtml).not.toContain('<script');
    expect(callArgs.redactedHtml).not.toContain('window.__SECRET');

    // Step 4: Patch selector using the best candidate
    const best = plan.bestCandidate!;
    const patchResult = patchSelector(
      SAMPLE_TEST_CODE,
      5, // line number of the locator('.submit-btn') call
      '.submit-btn',
      best.candidate.selector,
      best.candidate.method !== failure.method ? best.candidate.method : undefined,
    );

    expect(patchResult.patched).toBe(true);
    // The patched code should contain the new selector
    expect(patchResult.patchedCode).toContain(`'${best.candidate.selector}'`);
    // The old selector should be gone
    expect(patchResult.patchedCode).not.toContain("'.submit-btn'");
  });

  it('AST patcher works with AI-suggested selector (getByTestId)', () => {
    const result = patchSelector(
      SAMPLE_TEST_CODE,
      5,
      '.submit-btn',
      'login-submit',
      'getByTestId',
    );

    expect(result.patched).toBe(true);
    expect(result.patchedCode).toContain("getByTestId('login-submit')");
    expect(result.patchedCode).not.toContain('.submit-btn');
    // Other lines should be untouched
    expect(result.patchedCode).toContain("page.goto('/login')");
    expect(result.patchedCode).toContain("toHaveURL('/dashboard')");
  });

  it('buildRepairPlan bestCandidate is ranked highest', async () => {
    const mockAdapter = makeMockAdapter();
    const failure = makeFailure();

    const plan = await buildRepairPlan(failure, SAMPLE_HTML, {
      aiAdapter: mockAdapter,
    });

    if (plan.allCandidates.length > 1) {
      const bestScore = plan.bestCandidate!.finalScore;
      for (const rc of plan.allCandidates) {
        expect(bestScore).toBeGreaterThanOrEqual(rc.finalScore);
      }
    }
  });

  it('AI adapter receives context code when provided', async () => {
    const mockAdapter = makeMockAdapter();
    const failure = makeFailure();

    await buildRepairPlan(failure, SAMPLE_HTML, {
      aiAdapter: mockAdapter,
      contextCode: 'await page.locator(".submit-btn").click();',
    });

    const callArgs = (mockAdapter.suggestRepair as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as AiRepairInput;
    expect(callArgs.contextCode).toBe('await page.locator(".submit-btn").click();');
  });
});

// ===========================================================================
// Test Suite 2: Interactive Mode Flow
// ===========================================================================

describe('Interactive Mode Flow', () => {
  const failure = { file: 'login.spec.ts', line: 5, selector: '.submit-btn' };

  const candidates: RankedCandidate[] = [
    makeRankedCandidate(
      { selector: 'login-submit', method: 'getByTestId', confidence: 95, strategy: 'attribute_match' },
      100,
      'auto_apply',
    ),
    makeRankedCandidate(
      { selector: 'Sign In', method: 'getByText', confidence: 75, strategy: 'text_match' },
      77,
      'suggest',
    ),
    makeRankedCandidate(
      { selector: 'submit-button', method: 'getByTestId', confidence: 60, strategy: 'ai' },
      65,
      'suggest',
    ),
  ];

  it('displays candidate list with correct format', async () => {
    const input = createMockInput(['s']);
    const output = createMockOutput();

    await promptForCandidate(failure, candidates, { input, output });

    // Should display failure info
    expect(output.data).toContain('login.spec.ts:5');
    expect(output.data).toContain('.submit-btn');

    // Should display "Candidates" header
    expect(output.data).toContain('Candidates');

    // Should display each candidate with method('selector') format
    expect(output.data).toContain("getByTestId('login-submit')");
    expect(output.data).toContain("getByText('Sign In')");
    expect(output.data).toContain("getByTestId('submit-button')");

    // Should display confidence and strategy for each
    expect(output.data).toContain('100%');
    expect(output.data).toContain('attribute_match');
    expect(output.data).toContain('77%');
    expect(output.data).toContain('text_match');
    expect(output.data).toContain('65%');
    expect(output.data).toContain('ai');
  });

  it('selecting "1" applies the first candidate', async () => {
    const input = createMockInput(['1']);
    const output = createMockOutput();

    const result = await promptForCandidate(failure, candidates, { input, output });

    expect(result).toEqual({ action: 'apply', candidate: candidates[0] });
  });

  it('selecting "3" applies the third (AI) candidate', async () => {
    const input = createMockInput(['3']);
    const output = createMockOutput();

    const result = await promptForCandidate(failure, candidates, { input, output });

    expect(result).toEqual({ action: 'apply', candidate: candidates[2] });
    expect(candidates[2].candidate.strategy).toBe('ai');
  });

  it('"s" skips the current failure', async () => {
    const input = createMockInput(['s']);
    const output = createMockOutput();

    const result = await promptForCandidate(failure, candidates, { input, output });

    expect(result).toEqual({ action: 'skip' });
  });

  it('"q" quits all remaining failures', async () => {
    const input = createMockInput(['q']);
    const output = createMockOutput();

    const result = await promptForCandidate(failure, candidates, { input, output });

    expect(result).toEqual({ action: 'quit' });
  });

  it('"e" enters manual edit mode', async () => {
    const input = createMockInput(['e', 'getByRole', 'button']);
    const output = createMockOutput();

    const result = await promptForCandidate(failure, candidates, { input, output });

    expect(result).toEqual({
      action: 'edit',
      method: 'getByRole',
      selector: 'button',
    });
  });

  it('invalid input re-prompts, then accepts valid input', async () => {
    const input = createMockInput(['x', '99', '2']);
    const output = createMockOutput();

    const result = await promptForCandidate(failure, candidates, { input, output });

    // Should have shown error messages for invalid inputs
    expect(output.data).toContain('Invalid input');

    // But eventually accept "2"
    expect(result).toEqual({ action: 'apply', candidate: candidates[1] });
  });

  it('apply flow chains with AST patcher correctly', async () => {
    const input = createMockInput(['1']);
    const output = createMockOutput();

    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result.action).toBe('apply');

    if (result.action === 'apply') {
      // Apply the chosen candidate via AST patcher
      const patchResult = patchSelector(
        SAMPLE_TEST_CODE,
        5,
        '.submit-btn',
        result.candidate.candidate.selector,
        result.candidate.candidate.method,
      );

      expect(patchResult.patched).toBe(true);
      expect(patchResult.patchedCode).toContain("getByTestId('login-submit')");
      expect(patchResult.patchedCode).not.toContain("'.submit-btn'");
    }
  });
});
