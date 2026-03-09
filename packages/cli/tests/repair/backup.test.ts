import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBackup, restoreBackup } from '../../src/repair/backup.js';

describe('backup', () => {
  let tmpDir: string;
  const runId = 'test-run-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-bk-'));
    fs.mkdirSync(path.join(tmpDir, '.pw-doctor'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates a backup of a file', () => {
    const filePath = path.join(tmpDir, 'test.spec.ts');
    fs.writeFileSync(filePath, 'original content');

    createBackup(tmpDir, filePath, runId);

    const backupDir = path.join(tmpDir, '.pw-doctor', 'backups', runId);
    expect(fs.existsSync(backupDir)).toBe(true);
    const files = fs.readdirSync(backupDir);
    expect(files).toHaveLength(1);
  });

  it('restores a file from backup', () => {
    const filePath = path.join(tmpDir, 'test.spec.ts');
    fs.writeFileSync(filePath, 'original content');

    createBackup(tmpDir, filePath, runId);

    // Modify the file
    fs.writeFileSync(filePath, 'modified content');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('modified content');

    // Restore
    const restored = restoreBackup(tmpDir, filePath, runId);
    expect(restored).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original content');
  });

  it('returns false when no backup exists', () => {
    const filePath = path.join(tmpDir, 'nonexistent.spec.ts');
    const restored = restoreBackup(tmpDir, filePath, 'no-such-run');
    expect(restored).toBe(false);
  });
});
