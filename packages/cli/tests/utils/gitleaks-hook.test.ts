import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setupGitleaksHook } from '../../src/utils/gitleaks-hook.js';

describe('setupGitleaksHook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-gitleaks-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns not a git repository when .git/hooks does not exist', () => {
    const result = setupGitleaksHook(tmpDir);
    expect(result.installed).toBe(false);
    expect(result.message).toBe('Not a git repository');
  });

  it('skips when pre-commit hook already exists', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\nexit 0\n');

    const result = setupGitleaksHook(tmpDir);
    expect(result.installed).toBe(false);
    expect(result.message).toBe('Pre-commit hook already exists. Skipping.');
  });

  it('does not overwrite existing pre-commit hook content', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const originalContent = '#!/bin/sh\necho "custom hook"\n';
    fs.writeFileSync(path.join(hooksDir, 'pre-commit'), originalContent);

    setupGitleaksHook(tmpDir);

    const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
    expect(content).toBe(originalContent);
  });

  it('installs gitleaks hook when gitleaks is available', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    const result = setupGitleaksHook(tmpDir, () => true);
    expect(result.installed).toBe(true);
    expect(result.message).toContain('gitleaks');

    const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
    expect(content).toContain('gitleaks protect --staged');
  });

  it('installs basic hook when gitleaks is not available', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    const result = setupGitleaksHook(tmpDir, () => false);
    expect(result.installed).toBe(true);
    expect(result.message).toContain('basic secret scanner');

    const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
    expect(content).toContain('pw-doctor secret scanner (basic)');
  });

  it('basic hook script contains secret patterns', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    setupGitleaksHook(tmpDir, () => false);

    const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
    expect(content).toContain('sk-[a-zA-Z0-9]{20,}');
    expect(content).toContain('sk-ant-[a-zA-Z0-9]{20,}');
    expect(content).toContain('pk_[a-zA-Z0-9]{20,}');
    expect(content).toContain('Bearer');
  });

  it('sets hook file permissions to 0o755', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    setupGitleaksHook(tmpDir, () => false);

    const hookPath = path.join(hooksDir, 'pre-commit');
    const stats = fs.statSync(hookPath);
    // Check executable bits (owner, group, other)
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o755);
  });

  it('gitleaks hook file is also executable', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    setupGitleaksHook(tmpDir, () => true);

    const hookPath = path.join(hooksDir, 'pre-commit');
    const stats = fs.statSync(hookPath);
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o755);
  });

  it('gitleaks hook starts with shebang line', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    setupGitleaksHook(tmpDir, () => true);

    const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
    expect(content.startsWith('#!/bin/sh\n')).toBe(true);
  });

  it('basic hook starts with shebang line', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    setupGitleaksHook(tmpDir, () => false);

    const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
    expect(content.startsWith('#!/bin/sh\n')).toBe(true);
  });

  it('basic hook suggests installing gitleaks', () => {
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    setupGitleaksHook(tmpDir, () => false);

    const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
    expect(content).toContain('https://github.com/gitleaks/gitleaks');
  });
});
