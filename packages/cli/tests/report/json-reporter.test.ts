// packages/cli/tests/report/json-reporter.test.ts
import { describe, it, expect } from 'vitest';
import { buildJsonReport } from '../../src/report/json-reporter.js';
import { RunHistorySchema } from '@pw-doctor/shared';
import type { CheckResult } from '@pw-doctor/shared';

describe('buildJsonReport', () => {
  it('produces a valid RunHistory JSON', () => {
    const results: CheckResult[] = [
      {
        selector: {
          filePath: 'test.spec.ts', line: 1, column: 0,
          selectorValue: '.btn', selectorType: 'css', apiMethod: 'locator',
          isDynamic: false, contextCode: '', fragilityScore: 65,
        },
        status: 'broken',
      },
      {
        selector: {
          filePath: 'test.spec.ts', line: 5, column: 0,
          selectorValue: 'submit', selectorType: 'testid', apiMethod: 'getByTestId',
          isDynamic: false, contextCode: '', fragilityScore: 10,
        },
        status: 'healthy',
      },
    ];

    const report = buildJsonReport(results, 'cli');

    // Should validate against the schema
    const parsed = RunHistorySchema.parse(report);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.results.totalSelectors).toBe(2);
    expect(parsed.results.healthy).toBe(1);
    expect(parsed.results.broken).toBe(1);
    expect(parsed.trigger).toBe('cli');
  });
});
