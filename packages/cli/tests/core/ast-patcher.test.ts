// packages/cli/tests/core/ast-patcher.test.ts
import { describe, it, expect } from 'vitest';
import { patchSelector } from '../../src/core/ast-patcher.js';

describe('patchSelector', () => {
  it('replaces a CSS selector string in locator()', () => {
    const code = `import { test } from '@playwright/test';

test('demo', async ({ page }) => {
  await page.locator('.old-class').click();
});
`;
    const result = patchSelector(code, 4, '.old-class', '.new-class');
    expect(result.patchedCode).toContain('.new-class');
    expect(result.patchedCode).not.toContain('.old-class');
    expect(result.patched).toBe(true);
  });

  it('preserves formatting and other code', () => {
    const code = `import { test } from '@playwright/test';

// Important comment
test('demo', async ({ page }) => {
  await page.locator('.target').click();
  await page.getByTestId('other').fill('hello');
});
`;
    const result = patchSelector(code, 5, '.target', '[data-testid="new-target"]');
    expect(result.patchedCode).toContain('// Important comment');
    expect(result.patchedCode).toContain("getByTestId('other')");
    expect(result.patchedCode).toContain('data-testid');
    expect(result.patchedCode).toContain('new-target');
    expect(result.patchedCode).not.toContain('.target');
  });

  it('can change the method name (locator → getByTestId)', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator('.old').click();
});
`;
    const result = patchSelector(code, 2, '.old', 'my-test-id', 'getByTestId');
    expect(result.patchedCode).toContain('getByTestId(');
    expect(result.patchedCode).toContain('my-test-id');
    expect(result.patchedCode).not.toContain('locator(');
  });

  it('handles double-quoted strings', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator(".old-class").click();
});
`;
    const result = patchSelector(code, 2, '.old-class', '.new-class');
    expect(result.patchedCode).toContain('.new-class');
    expect(result.patched).toBe(true);
  });

  it('returns patched=false when selector not found at line', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator('.something-else').click();
});
`;
    const result = patchSelector(code, 2, '.nonexistent', '.new');
    expect(result.patched).toBe(false);
    expect(result.patchedCode).toBe(code);
  });
});
