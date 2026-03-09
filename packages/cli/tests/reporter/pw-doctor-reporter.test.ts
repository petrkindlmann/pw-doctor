// packages/cli/tests/reporter/pw-doctor-reporter.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { TestCase, TestResult } from '@playwright/test/reporter';

function hashString(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

function makeTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    title: 'my test',
    location: { file: '/tests/example.spec.ts', line: 10, column: 1 },
    ...overrides,
  } as TestCase;
}

function makeTestResult(
  overrides: Partial<TestResult> = {},
): TestResult {
  return {
    status: 'failed' as const,
    attachments: [],
    duration: 100,
    errors: [],
    retry: 0,
    parallelIndex: 0,
    startTime: new Date(),
    stderr: [],
    stdout: [],
    steps: [],
    workerIndex: 0,
    ...overrides,
  } as TestResult;
}

describe('PwDoctorReporter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-reporter-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('onBegin creates the captures directory', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    const outputDir = path.join(tmpDir, 'captures');
    const reporter = new PwDoctorReporter({ outputDir });

    reporter.onBegin();

    expect(fs.existsSync(outputDir)).toBe(true);
    const stat = fs.statSync(outputDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('onBegin clears old captures', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    const outputDir = path.join(tmpDir, 'captures');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'old-capture.html'), 'old data');

    const reporter = new PwDoctorReporter({ outputDir });
    reporter.onBegin();

    expect(fs.existsSync(path.join(outputDir, 'old-capture.html'))).toBe(false);
    expect(fs.existsSync(outputDir)).toBe(true);
  });

  it('onTestEnd writes HTML file for failed test with attachment', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    const outputDir = path.join(tmpDir, 'captures');
    const reporter = new PwDoctorReporter({ outputDir });
    reporter.onBegin();

    const htmlContent = '<html><body>captured DOM</body></html>';
    const testCase = makeTestCase();
    const testResult = makeTestResult({
      status: 'failed',
      attachments: [
        {
          name: 'pw-doctor-dom',
          contentType: 'text/html',
          body: Buffer.from(htmlContent),
          path: undefined,
        },
      ],
    });

    reporter.onTestEnd(testCase, testResult);

    const fileHash = hashString(testCase.location.file);
    const testHash = hashString(testCase.title);
    const expectedFilename = `${fileHash}-${testHash}.html`;
    const outputPath = path.join(outputDir, expectedFilename);

    expect(fs.existsSync(outputPath)).toBe(true);
    const written = fs.readFileSync(outputPath, 'utf-8');
    expect(written).toBe(htmlContent);
  });

  it('onTestEnd does nothing for passed test', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    const outputDir = path.join(tmpDir, 'captures');
    const reporter = new PwDoctorReporter({ outputDir });
    reporter.onBegin();

    const testCase = makeTestCase();
    const testResult = makeTestResult({
      status: 'passed',
      attachments: [
        {
          name: 'pw-doctor-dom',
          contentType: 'text/html',
          body: Buffer.from('<html></html>'),
          path: undefined,
        },
      ],
    });

    reporter.onTestEnd(testCase, testResult);

    const files = fs.readdirSync(outputDir);
    expect(files).toHaveLength(0);
  });

  it('onTestEnd does nothing for failed test without attachment', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    const outputDir = path.join(tmpDir, 'captures');
    const reporter = new PwDoctorReporter({ outputDir });
    reporter.onBegin();

    const testCase = makeTestCase();
    const testResult = makeTestResult({
      status: 'failed',
      attachments: [],
    });

    reporter.onTestEnd(testCase, testResult);

    const files = fs.readdirSync(outputDir);
    expect(files).toHaveLength(0);
  });

  it('onTestEnd does nothing for failed test with wrong attachment name', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    const outputDir = path.join(tmpDir, 'captures');
    const reporter = new PwDoctorReporter({ outputDir });
    reporter.onBegin();

    const testCase = makeTestCase();
    const testResult = makeTestResult({
      status: 'failed',
      attachments: [
        {
          name: 'screenshot',
          contentType: 'image/png',
          body: Buffer.from('not html'),
          path: undefined,
        },
      ],
    });

    reporter.onTestEnd(testCase, testResult);

    const files = fs.readdirSync(outputDir);
    expect(files).toHaveLength(0);
  });

  it('file is named with correct hash pattern', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    const outputDir = path.join(tmpDir, 'captures');
    const reporter = new PwDoctorReporter({ outputDir });
    reporter.onBegin();

    const testCase = makeTestCase({
      title: 'should click button',
      location: { file: '/tests/login.spec.ts', line: 5, column: 1 },
    } as Partial<TestCase>);

    const testResult = makeTestResult({
      status: 'failed',
      attachments: [
        {
          name: 'pw-doctor-dom',
          contentType: 'text/html',
          body: Buffer.from('<html></html>'),
          path: undefined,
        },
      ],
    });

    reporter.onTestEnd(testCase, testResult);

    const files = fs.readdirSync(outputDir);
    expect(files).toHaveLength(1);

    const expectedFileHash = hashString('/tests/login.spec.ts');
    const expectedTestHash = hashString('should click button');
    expect(files[0]).toBe(`${expectedFileHash}-${expectedTestHash}.html`);
    // Verify the hash pattern: 12 hex chars - 12 hex chars .html
    expect(files[0]).toMatch(/^[0-9a-f]{12}-[0-9a-f]{12}\.html$/);
  });

  it('uses default PW_DOCTOR_CAPTURES_DIR when no outputDir option given', async () => {
    const { default: PwDoctorReporter } = await import(
      '../../src/reporter/pw-doctor-reporter.js'
    );
    // Just verify the constructor doesn't throw when no options given
    const reporter = new PwDoctorReporter();
    expect(reporter).toBeDefined();
  });
});
