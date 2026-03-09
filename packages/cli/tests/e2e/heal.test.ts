import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { patchSelector } from '../../src/core/ast-patcher.js';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';
import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import { findCapturedHtml, readCodeContext } from '../../src/commands/heal.js';
import { PW_DOCTOR_CAPTURES_DIR } from '@pw-doctor/shared';
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

  it('repair pipeline generates candidates from DOM', async () => {
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

    const { candidates } = await generateRepairCandidates(failure, html);
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

describe('findCapturedHtml', () => {
  let tmpDir: string;

  function hashString(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? '/tmp', 'heal-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns captured HTML when file exists', () => {
    const relativeFile = 'tests/login.spec.ts';
    const absoluteFile = path.resolve(tmpDir, relativeFile);
    const testName = 'should log in';

    const fileHash = hashString(absoluteFile);
    const testHash = hashString(testName);

    const capturesDir = path.join(tmpDir, PW_DOCTOR_CAPTURES_DIR);
    fs.mkdirSync(capturesDir, { recursive: true });
    const htmlContent = '<div data-testid="login-form"><button>Log In</button></div>';
    fs.writeFileSync(path.join(capturesDir, `${fileHash}-${testHash}.html`), htmlContent);

    const result = findCapturedHtml(tmpDir, relativeFile, testName);
    expect(result).toBe(htmlContent);
  });

  it('returns undefined when no capture file exists', () => {
    const result = findCapturedHtml(tmpDir, 'tests/missing.spec.ts', 'nonexistent test');
    expect(result).toBeUndefined();
  });

  it('uses absolute path for file hashing (matches reporter behavior)', () => {
    const relativeFile = 'tests/example.spec.ts';
    const absoluteFile = path.resolve(tmpDir, relativeFile);
    const testName = 'my test';

    // The reporter hashes the absolute path, so we need to match that
    const expectedFileHash = hashString(absoluteFile);
    const expectedTestHash = hashString(testName);

    const capturesDir = path.join(tmpDir, PW_DOCTOR_CAPTURES_DIR);
    fs.mkdirSync(capturesDir, { recursive: true });
    fs.writeFileSync(
      path.join(capturesDir, `${expectedFileHash}-${expectedTestHash}.html`),
      '<div>test</div>',
    );

    // Should find the file because it resolves relative to cwd before hashing
    const result = findCapturedHtml(tmpDir, relativeFile, testName);
    expect(result).toBe('<div>test</div>');

    // Hashing the relative path would NOT match
    const wrongHash = hashString(relativeFile);
    expect(wrongHash).not.toBe(expectedFileHash);
  });
});

describe('readCodeContext', () => {
  let tmpFile: string;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  it('reads lines around the failure line', () => {
    const tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? '/tmp', 'ctx-test-'));
    tmpFile = path.join(tmpDir, 'test.spec.ts');
    const lines = [
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      'line 5',
      'line 6 - the failure line',
      'line 7',
      'line 8',
      'line 9',
      'line 10',
      'line 11',
      'line 12',
    ];
    fs.writeFileSync(tmpFile, lines.join('\n'));

    const context = readCodeContext(tmpFile, 6, 2);
    // line 6 with contextLines=2 means start = max(0, 6-2-1) = 3, end = min(12, 6+2) = 8
    // lines[3..8) = line 4, line 5, line 6, line 7, line 8
    expect(context).toContain('line 4');
    expect(context).toContain('line 5');
    expect(context).toContain('line 6 - the failure line');
    expect(context).toContain('line 7');
    expect(context).toContain('line 8');
    expect(context).not.toContain('line 3');
    expect(context).not.toContain('line 9');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty string for non-existent file', () => {
    const result = readCodeContext('/nonexistent/path/file.ts', 5);
    expect(result).toBe('');
  });
});

describe('heal command --no-ai flag', () => {
  it('healCommand has --no-ai option defined', async () => {
    const { healCommand } = await import('../../src/commands/heal.js');
    const cmd = healCommand();
    const aiOption = cmd.options.find((o) => o.long === '--no-ai');
    expect(aiOption).toBeDefined();
    expect(aiOption!.description).toBe('Disable AI repair even if configured');
  });
});
