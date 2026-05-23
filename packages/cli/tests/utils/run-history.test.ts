import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeRunHistory } from '../../src/utils/run-history.js';

describe('writeRunHistory', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwd-history-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a schema-valid record to .pw-doctor/history/runs/', () => {
    const result = writeRunHistory({
      cwd: tmp,
      runId: 'pwd_abc12345',
      trigger: 'cli',
      startedAt: Date.now() - 1234,
      config: { aiEnabled: false, autoApplyThreshold: 85 },
      results: {
        totalSelectors: 3,
        healthy: 0,
        broken: 3,
        repaired: 1,
        verified: 1,
        rolledBack: 0,
        needsManualReview: 1,
        skippedDynamic: 1,
      },
      repairs: [
        {
          filePath: 'tests/login.spec.ts',
          line: 14,
          oldSelector: '.btn-primary',
          oldMethod: 'locator',
          newSelector: 'submit-btn',
          newMethod: 'getByTestId',
          strategy: 'attribute_match',
          confidence: 95,
          reasoning: 'data-testid present',
          status: 'verified',
        },
      ],
      timing: { checkMs: 100, repairMs: 200, verifyMs: 300 },
    });

    expect('path' in result).toBe(true);
    if (!('path' in result)) return;

    expect(fs.existsSync(result.path)).toBe(true);
    const written = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(written.schemaVersion).toBe(1);
    expect(written.runId).toBe('pwd_abc12345');
    expect(written.repairs).toHaveLength(1);
    expect(written.timing.totalMs).toBeGreaterThan(0);
    // File permissions
    const stat = fs.statSync(result.path);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('refuses to write a record that fails schema validation', () => {
    const result = writeRunHistory({
      cwd: tmp,
      runId: 'pwd_xyz',
      trigger: 'cli',
      startedAt: Date.now(),
      config: { aiEnabled: false, autoApplyThreshold: 85 },
      results: {
        totalSelectors: 1,
        healthy: 0,
        broken: 1,
        repaired: 0,
        verified: 0,
        rolledBack: 0,
        needsManualReview: 0,
        skippedDynamic: 0,
      },
      repairs: [
        // confidence out of range — schema requires 0..100
        {
          filePath: 'a.spec.ts',
          line: 1,
          oldSelector: 'x',
          oldMethod: 'locator',
          newSelector: 'y',
          newMethod: 'locator',
          strategy: 'attribute_match',
          confidence: 500,
          reasoning: '',
          status: 'verified',
        },
      ],
      timing: { checkMs: 0, repairMs: 0, verifyMs: 0 },
    });

    expect('skipped' in result).toBe(true);
  });
});
