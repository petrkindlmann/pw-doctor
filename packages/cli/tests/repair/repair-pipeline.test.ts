import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateRepairCandidates, buildRepairPlan } from '../../src/repair/repair-pipeline.js';
import type { SelectorFailure } from '../../src/core/test-runner.js';
import type { AiRepairAdapter } from '../../src/ai/ai-adapter.js';
import type { AiRepairResponse } from '@pw-doctor/shared';

const HTML = fs.readFileSync(
  path.join(import.meta.dirname, '../fixtures/sample-doms/login-page.html'),
  'utf-8',
);

describe('generateRepairCandidates', () => {
  it('generates candidates for a broken CSS selector', async () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const { candidates } = await generateRepairCandidates(failure, HTML);
    expect(candidates.length).toBeGreaterThan(0);

    // Should find the data-testid alternative
    const testIdCandidate = candidates.find((c) => c.method === 'getByTestId');
    expect(testIdCandidate).toBeDefined();
    expect(testIdCandidate!.selector).toBe('login-submit');
  });

  it('returns empty array when selector has no DOM match', async () => {
    const failure: SelectorFailure = {
      file: 'tests/x.spec.ts',
      line: 1,
      column: 0,
      selector: '.totally-nonexistent-class',
      method: 'locator',
      testName: 'test',
      error: 'Timeout',
    };

    const { candidates } = await generateRepairCandidates(failure, HTML);
    expect(candidates).toHaveLength(0);
  });

  it('merges AI candidates with heuristic candidates', async () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const mockAiResponse: AiRepairResponse = {
      candidates: [
        {
          selector: 'login-submit',
          method: 'getByTestId',
          confidence: 95,
          reasoning: 'Stable data-testid attribute found',
        },
      ],
      tokensUsed: 250,
      provider: 'anthropic',
    };

    const mockAdapter: AiRepairAdapter = {
      provider: 'anthropic',
      suggestRepair: vi.fn().mockResolvedValue(mockAiResponse),
    };

    const { candidates, aiTokensUsed } = await generateRepairCandidates(failure, HTML, {
      aiAdapter: mockAdapter,
    });

    // Should have both heuristic and AI candidates
    const aiCandidates = candidates.filter((c) => c.strategy === 'ai');
    expect(aiCandidates.length).toBeGreaterThan(0);
    expect(aiCandidates[0].confidence).toBe(95);
    expect(aiCandidates[0].reasoning).toBe('Stable data-testid attribute found');
    expect(aiTokensUsed).toBe(250);
  });

  it('still works when AI adapter throws', async () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const mockAdapter: AiRepairAdapter = {
      provider: 'anthropic',
      suggestRepair: vi.fn().mockRejectedValue(new Error('API down')),
    };

    const { candidates, aiTokensUsed } = await generateRepairCandidates(failure, HTML, {
      aiAdapter: mockAdapter,
    });

    // Heuristic candidates should still be present
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.strategy !== 'ai')).toBe(true);
    expect(aiTokensUsed).toBeUndefined();
  });

  it('does not call AI adapter when html is empty', async () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const mockAdapter: AiRepairAdapter = {
      provider: 'anthropic',
      suggestRepair: vi.fn(),
    };

    await generateRepairCandidates(failure, '', { aiAdapter: mockAdapter });

    expect(mockAdapter.suggestRepair).not.toHaveBeenCalled();
  });
});

describe('buildRepairPlan', () => {
  it('includes aiTokensUsed when AI adapter is provided', async () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const mockAiResponse: AiRepairResponse = {
      candidates: [
        {
          selector: 'login-submit',
          method: 'getByTestId',
          confidence: 95,
          reasoning: 'Stable data-testid attribute found',
        },
      ],
      tokensUsed: 300,
      provider: 'anthropic',
    };

    const mockAdapter: AiRepairAdapter = {
      provider: 'anthropic',
      suggestRepair: vi.fn().mockResolvedValue(mockAiResponse),
    };

    const plan = await buildRepairPlan(failure, HTML, {
      aiAdapter: mockAdapter,
    });

    expect(plan.aiTokensUsed).toBe(300);
    expect(plan.allCandidates.length).toBeGreaterThan(0);
  });

  it('works without AI adapter (backward compatibility)', async () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const plan = await buildRepairPlan(failure, HTML);

    expect(plan.failure).toBe(failure);
    expect(plan.aiTokensUsed).toBeUndefined();
    expect(plan.allCandidates.length).toBeGreaterThan(0);
  });
});
