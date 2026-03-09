// packages/cli/tests/core/test-runner.test.ts
import { describe, it, expect } from 'vitest';
import { parsePlaywrightJsonOutput, extractFailedSelectors } from '../../src/core/test-runner.js';

const SAMPLE_PW_OUTPUT = JSON.stringify({
  suites: [
    {
      title: '',
      file: 'tests/login.spec.ts',
      specs: [
        {
          title: 'should login',
          file: 'tests/login.spec.ts',
          tests: [
            {
              status: 'expected',
              results: [{ status: 'passed' }],
            },
          ],
        },
        {
          title: 'should show dashboard',
          file: 'tests/login.spec.ts',
          tests: [
            {
              status: 'unexpected',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: "locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('.btn-primary')\n",
                      stack: 'Error\n    at /project/tests/login.spec.ts:15:20',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  stats: { expected: 1, unexpected: 1, total: 2 },
});

describe('parsePlaywrightJsonOutput', () => {
  it('parses JSON reporter output into test results', () => {
    const results = parsePlaywrightJsonOutput(SAMPLE_PW_OUTPUT);
    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it('extracts error details from failed tests', () => {
    const results = parsePlaywrightJsonOutput(SAMPLE_PW_OUTPUT);
    const failed = results.find((r) => !r.passed);
    expect(failed).toBeDefined();
    expect(failed!.error).toContain('Timeout');
  });
});

describe('extractFailedSelectors', () => {
  it('extracts selector from timeout error message', () => {
    const results = parsePlaywrightJsonOutput(SAMPLE_PW_OUTPUT);
    const failures = extractFailedSelectors(results);
    expect(failures).toHaveLength(1);
    expect(failures[0].selector).toBe('.btn-primary');
    expect(failures[0].file).toBe('tests/login.spec.ts');
    expect(failures[0].line).toBe(15);
  });

  it('returns empty array for all-passing results', () => {
    const results = parsePlaywrightJsonOutput(
      JSON.stringify({ suites: [{ title: '', file: 'test.spec.ts', specs: [{ title: 'ok', file: 'test.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] }], stats: { expected: 1, unexpected: 0, total: 1 } }),
    );
    const failures = extractFailedSelectors(results);
    expect(failures).toHaveLength(0);
  });
});
