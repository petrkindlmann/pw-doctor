import { describe, it, expect } from 'vitest';
import { patchSelector } from '../../src/core/ast-patcher.js';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';
import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import type { SelectorFailure } from '../../src/core/test-runner.js';

describe('heal pipeline integration', () => {
  it('AST patcher preserves formatting when replacing selector', () => {
    const code = `import { test, expect } from '@playwright/test';

test('login', async ({ page }) => {
  await page.goto('/login');
  // Fill the form
  await page.locator('.username-field').fill('user@test.com');
  await page.locator('#password').fill('secret');
  await page.getByRole('button', { name: 'Submit' }).click();
});
`;
    const result = patchSelector(code, 6, '.username-field', 'email-input', 'getByTestId');

    expect(result.patched).toBe(true);
    // Should preserve the comment and other lines
    expect(result.patchedCode).toContain('// Fill the form');
    expect(result.patchedCode).toContain("getByTestId('email-input')");
    expect(result.patchedCode).toContain("locator('#password')");
    expect(result.patchedCode).toContain("getByRole('button'");
  });

  it('repair pipeline generates candidates from DOM', () => {
    const html = `
      <button class="btn-submit old-class" data-testid="submit-action" role="button">
        Save Changes
      </button>
    `;

    const failure: SelectorFailure = {
      file: 'test.spec.ts',
      line: 5,
      column: 0,
      selector: '.old-class',
      method: 'locator',
      testName: 'save test',
      error: 'Timeout',
    };

    const candidates = generateRepairCandidates(failure, html);
    expect(candidates.length).toBeGreaterThan(0);

    // Should find data-testid
    const testIdCandidate = candidates.find((c) => c.method === 'getByTestId');
    expect(testIdCandidate).toBeDefined();
    expect(testIdCandidate!.selector).toBe('submit-action');
  });

  it('full patch + verify cycle works on code', () => {
    const originalCode = `test('x', async ({ page }) => {
  await page.locator('.broken-class').click();
});
`;
    // Patch it
    const result = patchSelector(originalCode, 2, '.broken-class', 'fixed-id', 'getByTestId');
    expect(result.patched).toBe(true);
    expect(result.patchedCode).toContain("getByTestId('fixed-id')");
    expect(result.patchedCode).not.toContain('.broken-class');

    // Verify the patched code is valid (can be re-parsed)
    const result2 = patchSelector(result.patchedCode, 2, 'fixed-id', 'another-id');
    expect(result2.patched).toBe(true);
    expect(result2.patchedCode).toContain("'another-id'");
  });
});
