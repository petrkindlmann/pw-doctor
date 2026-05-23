import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logAiCall, hashPayload, type AiAuditEntry } from '../../src/ai/audit-logger.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-audit-test-'));
}

function makeEntry(overrides: Partial<AiAuditEntry> = {}): AiAuditEntry {
  return {
    timestamp: '2026-03-09T12:00:00.000Z',
    failedSelector: '#submit-btn',
    failedMethod: 'locator',
    payloadSizeBytes: 4096,
    payloadHash: 'abc123def456',
    responseCandidateCount: 2,
    responseTokensUsed: 150,
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    redactionPreset: 'moderate',
    durationMs: 320,
    ...overrides,
  };
}

describe('logAiCall', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates audit directory and log file', () => {
    logAiCall(tmpDir, makeEntry());

    const auditFile = path.join(tmpDir, '.pw-doctor', 'audit', 'ai-calls.jsonl');
    expect(fs.existsSync(auditFile)).toBe(true);
  });

  it('creates the .pw-doctor/audit directory structure', () => {
    logAiCall(tmpDir, makeEntry());

    const auditDir = path.join(tmpDir, '.pw-doctor', 'audit');
    expect(fs.statSync(auditDir).isDirectory()).toBe(true);
  });

  it('writes valid JSON per line (JSONL format)', () => {
    logAiCall(tmpDir, makeEntry());

    const auditFile = path.join(tmpDir, '.pw-doctor', 'audit', 'ai-calls.jsonl');
    const content = fs.readFileSync(auditFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it('appends multiple calls (does not overwrite)', () => {
    logAiCall(tmpDir, makeEntry({ failedSelector: '#btn-1' }));
    logAiCall(tmpDir, makeEntry({ failedSelector: '#btn-2' }));
    logAiCall(tmpDir, makeEntry({ failedSelector: '#btn-3' }));

    const auditFile = path.join(tmpDir, '.pw-doctor', 'audit', 'ai-calls.jsonl');
    const content = fs.readFileSync(auditFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(3);

    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].failedSelector).toBe('#btn-1');
    expect(parsed[1].failedSelector).toBe('#btn-2');
    expect(parsed[2].failedSelector).toBe('#btn-3');
  });

  it('sets file permissions to 0o600', () => {
    logAiCall(tmpDir, makeEntry());

    const auditFile = path.join(tmpDir, '.pw-doctor', 'audit', 'ai-calls.jsonl');
    const stat = fs.statSync(auditFile);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('includes all required fields in logged entry', () => {
    logAiCall(tmpDir, makeEntry());

    const auditFile = path.join(tmpDir, '.pw-doctor', 'audit', 'ai-calls.jsonl');
    const content = fs.readFileSync(auditFile, 'utf-8');
    const entry = JSON.parse(content.trim());

    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('failedSelector');
    expect(entry).toHaveProperty('failedMethod');
    expect(entry).toHaveProperty('payloadSizeBytes');
    expect(entry).toHaveProperty('payloadHash');
    expect(entry).toHaveProperty('responseCandidateCount');
    expect(entry).toHaveProperty('responseTokensUsed');
    expect(entry).toHaveProperty('provider');
    expect(entry).toHaveProperty('model');
    expect(entry).toHaveProperty('redactionPreset');
    expect(entry).toHaveProperty('durationMs');
  });

  it('preserves exact field values', () => {
    const entry = makeEntry({
      timestamp: '2026-01-15T08:30:00.000Z',
      failedSelector: '[data-testid="login"]',
      failedMethod: 'getByTestId',
      payloadSizeBytes: 8192,
      payloadHash: 'deadbeef',
      responseCandidateCount: 3,
      responseTokensUsed: 250,
      provider: 'openai',
      model: 'gpt-4o',
      redactionPreset: 'strict',
      durationMs: 500,
    });

    logAiCall(tmpDir, entry);

    const auditFile = path.join(tmpDir, '.pw-doctor', 'audit', 'ai-calls.jsonl');
    const content = fs.readFileSync(auditFile, 'utf-8');
    const parsed = JSON.parse(content.trim());

    expect(parsed).toEqual(entry);
  });

  it('does not throw when audit logging fails (non-fatal)', () => {
    // Use an invalid path that cannot be created
    const badPath = '/proc/nonexistent/impossible';

    expect(() => logAiCall(badPath, makeEntry())).not.toThrow();
  });

  it('does not log full DOM payload — only hash and size', () => {
    const entry = makeEntry({
      payloadSizeBytes: 50000,
      payloadHash: 'a'.repeat(64),
    });

    logAiCall(tmpDir, entry);

    const auditFile = path.join(tmpDir, '.pw-doctor', 'audit', 'ai-calls.jsonl');
    const raw = fs.readFileSync(auditFile, 'utf-8');

    // Ensure no HTML-like content in the logged line
    expect(raw).not.toContain('<html');
    expect(raw).not.toContain('<div');
    expect(raw).not.toContain('<body');

    // The entry should have hash and size, not the full payload
    const parsed = JSON.parse(raw.trim());
    expect(parsed.payloadHash).toBe('a'.repeat(64));
    expect(parsed.payloadSizeBytes).toBe(50000);
    expect(Object.keys(parsed)).not.toContain('payload');
    expect(Object.keys(parsed)).not.toContain('html');
    expect(Object.keys(parsed)).not.toContain('dom');
  });

  it('works when audit directory already exists', () => {
    // Create the directory first
    const auditDir = path.join(tmpDir, '.pw-doctor', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });

    logAiCall(tmpDir, makeEntry({ failedSelector: '#existing-dir' }));

    const auditFile = path.join(auditDir, 'ai-calls.jsonl');
    const content = fs.readFileSync(auditFile, 'utf-8');
    const parsed = JSON.parse(content.trim());

    expect(parsed.failedSelector).toBe('#existing-dir');
  });
});

describe('hashPayload', () => {
  it('returns a SHA-256 hex string', () => {
    const hash = hashPayload('hello world');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns consistent hashes for the same input', () => {
    const hash1 = hashPayload('test payload');
    const hash2 = hashPayload('test payload');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = hashPayload('payload A');
    const hash2 = hashPayload('payload B');
    expect(hash1).not.toBe(hash2);
  });
});
