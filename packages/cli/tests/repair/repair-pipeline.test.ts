import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import type { SelectorFailure } from '../../src/core/test-runner.js';

const HTML = fs.readFileSync(
  path.join(import.meta.dirname, '../fixtures/sample-doms/login-page.html'),
  'utf-8',
);

describe('generateRepairCandidates', () => {
  it('generates candidates for a broken CSS selector', () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const candidates = generateRepairCandidates(failure, HTML);
    expect(candidates.length).toBeGreaterThan(0);

    // Should find the data-testid alternative
    const testIdCandidate = candidates.find((c) => c.method === 'getByTestId');
    expect(testIdCandidate).toBeDefined();
    expect(testIdCandidate!.selector).toBe('login-submit');
  });

  it('returns empty array when selector has no DOM match', () => {
    const failure: SelectorFailure = {
      file: 'tests/x.spec.ts',
      line: 1,
      column: 0,
      selector: '.totally-nonexistent-class',
      method: 'locator',
      testName: 'test',
      error: 'Timeout',
    };

    const candidates = generateRepairCandidates(failure, HTML);
    expect(candidates).toHaveLength(0);
  });
});
