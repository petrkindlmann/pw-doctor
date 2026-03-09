import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable, Writable } from 'node:stream';
import { checkAiConsent, recordAiConsent, promptForAiConsent } from '../../src/ai/consent-gate.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-consent-test-'));
}

function makeConsentDir(tmpDir: string): string {
  const consentDir = path.join(tmpDir, '.pw-doctor');
  fs.mkdirSync(consentDir, { recursive: true });
  return consentDir;
}

function createMockInput(response: string): Readable {
  const stream = new Readable({
    read() {
      this.push(response + '\n');
      this.push(null);
    },
  });
  return stream;
}

function createMockOutput(): Writable {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  (stream as Writable & { getOutput: () => string }).getOutput = () =>
    Buffer.concat(chunks).toString('utf-8');
  return stream;
}

describe('checkAiConsent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when no consent file exists', () => {
    const consentDir = path.join(tmpDir, '.pw-doctor');
    expect(checkAiConsent(consentDir)).toBe(false);
  });

  it('returns true when valid consent file exists', () => {
    const consentDir = makeConsentDir(tmpDir);
    const consentFile = path.join(consentDir, 'ai-consent.json');
    fs.writeFileSync(consentFile, JSON.stringify({ consented: true, timestamp: '2026-01-01T00:00:00.000Z', version: '1.0' }));

    expect(checkAiConsent(consentDir)).toBe(true);
  });

  it('returns false when consent file has consented: false', () => {
    const consentDir = makeConsentDir(tmpDir);
    const consentFile = path.join(consentDir, 'ai-consent.json');
    fs.writeFileSync(consentFile, JSON.stringify({ consented: false, timestamp: '2026-01-01T00:00:00.000Z', version: '1.0' }));

    expect(checkAiConsent(consentDir)).toBe(false);
  });

  it('returns false when consent file contains invalid JSON', () => {
    const consentDir = makeConsentDir(tmpDir);
    const consentFile = path.join(consentDir, 'ai-consent.json');
    fs.writeFileSync(consentFile, 'not-valid-json');

    expect(checkAiConsent(consentDir)).toBe(false);
  });
});

describe('recordAiConsent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates consent file with correct format', () => {
    const consentDir = path.join(tmpDir, '.pw-doctor');
    recordAiConsent(consentDir);

    const consentFile = path.join(consentDir, 'ai-consent.json');
    expect(fs.existsSync(consentFile)).toBe(true);

    const data = JSON.parse(fs.readFileSync(consentFile, 'utf-8'));
    expect(data.consented).toBe(true);
    expect(data.version).toBe('1.0');
    expect(typeof data.timestamp).toBe('string');
    // Validate ISO timestamp format
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  it('creates consent directory with 0o700 permissions', () => {
    const consentDir = path.join(tmpDir, 'new-dir');
    recordAiConsent(consentDir);

    const stat = fs.statSync(consentDir);
    // eslint-disable-next-line no-bitwise
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o700);
  });

  it('sets consent file permissions to 0o600', () => {
    const consentDir = path.join(tmpDir, '.pw-doctor');
    recordAiConsent(consentDir);

    const consentFile = path.join(consentDir, 'ai-consent.json');
    const stat = fs.statSync(consentFile);
    // eslint-disable-next-line no-bitwise
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('makes checkAiConsent return true after recording', () => {
    const consentDir = path.join(tmpDir, '.pw-doctor');
    expect(checkAiConsent(consentDir)).toBe(false);

    recordAiConsent(consentDir);
    expect(checkAiConsent(consentDir)).toBe(true);
  });
});

describe('promptForAiConsent', () => {
  it('returns true when user types "y"', async () => {
    const input = createMockInput('y');
    const output = createMockOutput();

    const result = await promptForAiConsent(input, output);
    expect(result).toBe(true);
  });

  it('returns true when user types "yes"', async () => {
    const input = createMockInput('yes');
    const output = createMockOutput();

    const result = await promptForAiConsent(input, output);
    expect(result).toBe(true);
  });

  it('returns true when user types "Y" (case-insensitive)', async () => {
    const input = createMockInput('Y');
    const output = createMockOutput();

    const result = await promptForAiConsent(input, output);
    expect(result).toBe(true);
  });

  it('returns true when user types "YES" (case-insensitive)', async () => {
    const input = createMockInput('YES');
    const output = createMockOutput();

    const result = await promptForAiConsent(input, output);
    expect(result).toBe(true);
  });

  it('returns false when user types "n"', async () => {
    const input = createMockInput('n');
    const output = createMockOutput();

    const result = await promptForAiConsent(input, output);
    expect(result).toBe(false);
  });

  it('returns false when user types empty input (default NO)', async () => {
    const input = createMockInput('');
    const output = createMockOutput();

    const result = await promptForAiConsent(input, output);
    expect(result).toBe(false);
  });

  it('returns false for arbitrary text', async () => {
    const input = createMockInput('maybe');
    const output = createMockOutput();

    const result = await promptForAiConsent(input, output);
    expect(result).toBe(false);
  });

  it('displays the consent explanation text', async () => {
    const input = createMockInput('n');
    const output = createMockOutput();

    await promptForAiConsent(input, output);

    const outputText = (output as Writable & { getOutput: () => string }).getOutput();
    expect(outputText).toContain('PW-Doctor AI repair sends redacted DOM content');
    expect(outputText).toContain('Anthropic or OpenAI');
    expect(outputText).toContain('(y/N)');
  });
});
