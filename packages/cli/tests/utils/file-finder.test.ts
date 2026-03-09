import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findTestFiles } from '../../src/utils/file-finder.js';

describe('findTestFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-ff-'));
    fs.mkdirSync(path.join(tmpDir, 'tests', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'tests', 'a.spec.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'b.spec.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'sub', 'c.spec.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'not-a-test.ts'), '');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('finds .spec.ts files recursively', () => {
    const files = findTestFiles(path.join(tmpDir, 'tests'), '**/*.spec.ts');
    expect(files).toHaveLength(3);
    expect(files.some((f) => f.endsWith('a.spec.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('c.spec.ts'))).toBe(true);
  });

  it('excludes non-matching files', () => {
    const files = findTestFiles(path.join(tmpDir, 'tests'), '**/*.spec.ts');
    expect(files.some((f) => f.endsWith('not-a-test.ts'))).toBe(false);
  });

  it('finds .test.ts files when pattern specifies', () => {
    fs.writeFileSync(path.join(tmpDir, 'tests', 'd.test.ts'), '');
    const files = findTestFiles(path.join(tmpDir, 'tests'), '**/*.test.ts');
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('d.test.ts');
  });
});
