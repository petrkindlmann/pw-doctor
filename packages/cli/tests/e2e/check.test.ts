import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// Each case spawns the built node binary (cold start + bundled-shared resolve);
// under full-suite parallel load this can exceed the 5s default, so give the
// subprocess-driven E2E a generous timeout to avoid CI flakes.
describe('pw-doctor check (E2E)', { timeout: 30000 }, () => {
  let tmpDir: string;
  const cliBin = path.resolve(
    import.meta.dirname,
    '../../dist/bin/pw-doctor.js',
  );

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-e2e-'));

    // Create a fake Playwright project
    fs.writeFileSync(
      path.join(tmpDir, 'playwright.config.ts'),
      'export default { testDir: "./tests" };\n',
    );

    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'tests', 'example.spec.ts'),
      `import { test } from '@playwright/test';
test('demo', async ({ page }) => {
  await page.locator('.login-btn').click();
  await page.getByTestId('user-input').fill('hello');
  await page.getByRole('button', { name: 'Submit' }).click();
});
`,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('pw-doctor init creates config and scans selectors', () => {
    const result = execFileSync('node', [cliBin, 'init'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
      input: '',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 25000,
    });

    expect(result).toContain('Found Playwright config');
    expect(result).toContain('3 selectors');
    expect(fs.existsSync(path.join(tmpDir, '.pw-doctor.config.json'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, '.pw-doctor'))).toBe(true);
  });

  it('pw-doctor check finds selectors and reports', () => {
    // Init first
    execFileSync('node', [cliBin, 'init'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
      input: '',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 25000,
    });

    // Then check
    const result = execFileSync('node', [cliBin, 'check'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
      input: '',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 25000,
    });

    expect(result).toContain('3 selectors');
    expect(result).toContain('.login-btn');
  });

  it('pw-doctor check --ci outputs JSON', () => {
    execFileSync('node', [cliBin, 'init'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
      input: '',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 25000,
    });

    const result = execFileSync(
      'node',
      [cliBin, 'check', '--ci'],
      {
        cwd: tmpDir,
        encoding: 'utf-8',
        env: { ...process.env },
        input: '',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 25000,
      },
    );

    // Last line should be valid JSON
    const lines = result.trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    const parsed = JSON.parse(jsonLine);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.results.totalSelectors).toBe(3);
  });
});
