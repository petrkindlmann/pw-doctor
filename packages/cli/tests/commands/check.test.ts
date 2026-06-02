import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkCommand } from '../../src/commands/check.js';

// A fragile CSS chain (nth-child + long descendant chain) scores well above 70.
const FRAGILE_TEST = `
import { test } from '@playwright/test';
test('fragile', async ({ page }) => {
  await page.locator('.container > .row > .col:nth-child(2)').click();
});
`;

// A clean data-testid selector scores ~10 (10 base - 20 testid bonus, clamped).
const ROBUST_TEST = `
import { test } from '@playwright/test';
test('robust', async ({ page }) => {
  await page.getByTestId('submit-button').click();
});
`;

describe('check command --fail-on-fragile', () => {
  let tmpDir: string;
  let originalCwd: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? '.', 'check-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // ora writes to stderr; silence error too to keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTest(name: string, content: string): void {
    const testsDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, name), content);
  }

  it('exits BROKEN_FOUND (1) when a selector exceeds the threshold', async () => {
    writeTest('fragile.spec.ts', FRAGILE_TEST);

    const cmd = checkCommand();
    await cmd.parseAsync(['--fail-on-fragile', '50'], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits HEALTHY (0) when no selector exceeds the threshold', async () => {
    writeTest('robust.spec.ts', ROBUST_TEST);

    const cmd = checkCommand();
    await cmd.parseAsync(['--fail-on-fragile', '50'], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });

  it('exits HEALTHY (0) with no threshold even when fragile selectors exist', async () => {
    writeTest('fragile.spec.ts', FRAGILE_TEST);

    const cmd = checkCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits TOOL_ERROR (2) for an out-of-range threshold', async () => {
    writeTest('robust.spec.ts', ROBUST_TEST);

    const cmd = checkCommand();
    await cmd.parseAsync(['--fail-on-fragile', '150'], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('prints a fragility report without broken/healthy status', async () => {
    writeTest('fragile.spec.ts', FRAGILE_TEST);

    const cmd = checkCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Fragility');
    expect(output).not.toContain('BROKEN');
  });
});
