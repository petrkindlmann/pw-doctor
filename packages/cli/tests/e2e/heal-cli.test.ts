import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

/**
 * CLI-surface e2e for `heal`: exercises the real built binary for the paths that
 * do NOT require a browser run (help text, flag wiring, the no-project guard,
 * and exit codes). The full reporter→capture→heal→verify loop (which shells out
 * to `npx playwright test`) is covered in-process by tests/e2e/ai-heal.test.ts
 * and tests/e2e/heal.test.ts; running real browsers in unit CI would be slow and
 * require `playwright install`, so it is intentionally not driven here.
 */
// Spawning the built node binary per assertion is slow (cold start); give each
// spawn a generous timeout so CI variance does not flake these.
describe('pw-doctor heal (CLI e2e)', { timeout: 30000 }, () => {
  let tmpDir: string;
  const cliBin = path.resolve(import.meta.dirname, '../../dist/bin/pw-doctor.js');

  function run(args: string[], opts: { cwd?: string } = {}): { stdout: string; status: number } {
    try {
      const stdout = execFileSync('node', [cliBin, ...args], {
        cwd: opts.cwd ?? tmpDir,
        encoding: 'utf-8',
        env: { ...process.env },
        // Give the child an empty, closed stdin so no prompt path can ever
        // block (CI is non-TTY); cap wall time as a backstop against a hang.
        input: '',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 25000,
      });
      return { stdout, status: 0 };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      return { stdout: (e.stdout ?? '') + (e.stderr ?? ''), status: e.status ?? 1 };
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-heal-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('heal --help documents every advertised flag', () => {
    const { stdout } = run(['heal', '--help']);
    for (const flag of [
      '--apply',
      '--min-confidence',
      '--max-files',
      '--ci',
      '--interactive',
      '--no-ai',
      '--watch',
      '--preview-ai-payload',
      '--dry-run',
    ]) {
      expect(stdout).toContain(flag);
    }
    // The 0..100 scale must be discoverable from help (the old README lied 0..1).
    expect(stdout).toMatch(/0-100|0\.\.100/);
  });

  it('heal outside a Playwright project exits TOOL_ERROR (2) with an actionable message', () => {
    const { stdout, status } = run(['heal']);
    expect(status).toBe(2);
    expect(stdout.toLowerCase()).toContain('playwright');
  });

  it('rejects a non-integer --min-confidence with an actionable error (no silent truncation)', () => {
    // Even outside a PW project the flag is parsed first; commander rejects it.
    const { stdout, status } = run(['heal', '--min-confidence', '0.7']);
    expect(status).not.toBe(0);
    expect(stdout.toLowerCase()).toContain('integer');
  });

  it('rejects an out-of-range --min-confidence', () => {
    const { stdout, status } = run(['heal', '--min-confidence', '150']);
    expect(status).not.toBe(0);
    expect(stdout.toLowerCase()).toContain('between 0 and 100');
  });

  it('--interactive in a non-TTY environment fails with a guided message', () => {
    // Make it look like a Playwright project so we get past the project guard.
    fs.writeFileSync(path.join(tmpDir, 'playwright.config.ts'), 'export default { testDir: "./tests" };\n');
    const { stdout, status } = run(['heal', '--interactive']);
    expect(status).not.toBe(0);
    expect(stdout.toLowerCase()).toMatch(/tty|terminal|--ci/);
  });
});
