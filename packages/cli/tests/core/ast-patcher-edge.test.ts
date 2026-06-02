// packages/cli/tests/core/ast-patcher-edge.test.ts
import { describe, it, expect } from 'vitest';
import { patchSelector } from '../../src/core/ast-patcher.js';

describe('patchSelector — edge & risky cases', () => {
  it('refuses to guess between two identical locator() calls on the same line (no column)', () => {
    // Two locator('.x') on one line, no targetColumn → must not patch, ambiguous.
    const code = `test('x', async ({ page }) => {
  await page.locator('.x').or(page.locator('.x')).click();
});
`;
    const result = patchSelector(code, 2, '.x', '.y');
    expect(result.patched).toBe(false);
    expect(result.ambiguous).toBe(true);
    expect(result.patchedCode).toBe(code);
  });

  it('patches only the second of two identical calls when targetColumn points near it', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator('.x').or(page.locator('.x')).click();
});
`;
    // Line 2 (1-based). Babel loc.start.column is 0-based.
    // The two CallExpressions start at the receiver of each chain segment.
    // Find the actual columns of each `page` on line 2 to target the second one.
    const line = code.split('\n')[1]; // "  await page.locator('.x').or(page.locator('.x')).click();"
    const firstPageCol = line.indexOf('page');
    const secondPageCol = line.indexOf('page', firstPageCol + 1);
    expect(secondPageCol).toBeGreaterThan(firstPageCol);

    const result = patchSelector(code, 2, '.x', '.y', { targetColumn: secondPageCol });
    expect(result.patched).toBe(true);
    expect(result.ambiguous).toBeUndefined();

    // Exactly one occurrence replaced: one '.x' remains, one '.y' appears.
    const xCount = (result.patchedCode.match(/'\.x'/g) ?? []).length;
    const yCount = (result.patchedCode.match(/'\.y'/g) ?? []).length;
    expect(xCount).toBe(1);
    expect(yCount).toBe(1);

    // The second call (inside .or(...)) is the patched one; first stays '.x'.
    expect(result.patchedCode).toContain("page.locator('.x').or(page.locator('.y'))");
  });

  it('leaves a template-literal selector untouched (only string literals are patchable)', () => {
    const code = `test('x', async ({ page }) => {
  const id = 'menu';
  await page.locator(\`#\${id}\`).click();
});
`;
    // oldSelector cannot match a dynamic template literal; nothing to patch.
    const result = patchSelector(code, 3, '#menu', '.new');
    expect(result.patched).toBe(false);
    expect(result.patchedCode).toBe(code);
    // Template literal survives verbatim.
    expect(result.patchedCode).toContain('`#${id}`');
  });

  it('patches a multi-line locator chain when the failing line is the .locator() line', () => {
    // The CallExpression for .locator('.btn') spans from `page` (line 2) through
    // the chained `.click()`; targetLine (line 3, the .locator line) falls inside
    // loc.start.line..loc.end.line.
    const code = `test('x', async ({ page }) => {
  await page
    .locator('.btn')
    .click();
});
`;
    const result = patchSelector(code, 3, '.btn', '.btn-new');
    expect(result.patched).toBe(true);
    expect(result.patchedCode).toContain("'.btn-new'");
    expect(result.patchedCode).not.toContain("'.btn'");
    // Chain shape preserved across lines.
    expect(result.patchedCode).toContain('.click()');
  });

  it('switches to getByRole with a name option and drops the stale first arg', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator('button.submit').click();
});
`;
    const result = patchSelector(code, 2, 'button.submit', 'button', {
      newMethod: 'getByRole',
      nameOption: 'Sign in',
    });
    expect(result.patched).toBe(true);
    // Assert semantics, not exact whitespace/quote formatting (recast pretty-prints
    // the freshly-built options object): method = getByRole, role = button, name = Sign in.
    expect(result.patchedCode).toMatch(/getByRole\(\s*'button'/);
    expect(result.patchedCode).toMatch(/name:\s*['"]Sign in['"]/);
    // Old method and old selector are fully gone.
    expect(result.patchedCode).not.toContain('locator(');
    expect(result.patchedCode).not.toContain('button.submit');
  });

  it('replaces a stale existing options object instead of leaving leftover options', () => {
    // The old call already had a { name } options object; the patch must replace
    // it so a stale name can't survive.
    const code = `test('x', async ({ page }) => {
  await page.getByRole('link', { name: 'Old name' }).click();
});
`;
    const result = patchSelector(code, 2, 'link', 'button', {
      newMethod: 'getByRole',
      nameOption: 'New name',
    });
    expect(result.patched).toBe(true);
    // Semantics over formatting: new role + new name, stale role/name gone.
    expect(result.patchedCode).toMatch(/getByRole\(\s*'button'/);
    expect(result.patchedCode).toMatch(/name:\s*['"]New name['"]/);
    expect(result.patchedCode).not.toContain('Old name');
    expect(result.patchedCode).not.toContain("'link'");
    // Exactly one options object remains (no leftover second { name }).
    const nameCount = (result.patchedCode.match(/name:/g) ?? []).length;
    expect(nameCount).toBe(1);
  });

  it('preserves double-quote style on a double-quoted selector', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator(".old").click();
});
`;
    const result = patchSelector(code, 2, '.old', '.new');
    expect(result.patched).toBe(true);
    expect(result.patchedCode).toContain('".new"');
    expect(result.patchedCode).not.toContain("'.new'");
  });

  it('preserves single-quote style on a single-quoted selector', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator('.old').click();
});
`;
    const result = patchSelector(code, 2, '.old', '.new');
    expect(result.patched).toBe(true);
    expect(result.patchedCode).toContain("'.new'");
    expect(result.patchedCode).not.toContain('".new"');
  });

  it('round-trips a selector value containing the source quote char without corrupting the file', () => {
    // Source is double-quoted; the new selector value contains a double quote.
    // Correct behavior: recast must escape the embedded quote so the output is
    // still valid, re-parseable JS and the value survives intact.
    const code = `test('x', async ({ page }) => {
  await page.locator(".old").click();
});
`;
    const newSelector = `[aria-label="Save & Close"]`;
    const result = patchSelector(code, 2, '.old', newSelector);
    expect(result.patched).toBe(true);

    // The output must remain valid, re-parseable JS — the embedded double quote
    // must be escaped to match the (double) source quote style. Re-running the
    // patcher on the output must not throw and must re-find the selector.
    expect(() => patchSelector(result.patchedCode, 2, newSelector, '.final')).not.toThrow();
    const reparse = patchSelector(result.patchedCode, 2, newSelector, '.final');
    expect(reparse.patched).toBe(true);
    expect(reparse.patchedCode).toContain('.final');
  });
});
