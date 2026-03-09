// packages/cli/tests/report/terminal-reporter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { formatCheckResults } from '../../src/report/terminal-reporter.js';
import type { SelectorInfo, CheckResult } from '@pw-doctor/shared';

describe('formatCheckResults', () => {
  it('formats results into a readable string', () => {
    const results: CheckResult[] = [
      {
        selector: {
          filePath: 'tests/login.spec.ts',
          line: 42,
          column: 4,
          selectorValue: '.btn-primary',
          selectorType: 'css',
          apiMethod: 'locator',
          isDynamic: false,
          contextCode: '',
          fragilityScore: 78,
        },
        status: 'broken',
      },
      {
        selector: {
          filePath: 'tests/login.spec.ts',
          line: 55,
          column: 4,
          selectorValue: 'dashboard-header',
          selectorType: 'testid',
          apiMethod: 'getByTestId',
          isDynamic: false,
          contextCode: '',
          fragilityScore: 10,
        },
        status: 'healthy',
      },
    ];

    const output = formatCheckResults(results);
    expect(output).toContain('.btn-primary');
    expect(output).toContain('BROKEN');
    expect(output).toContain('HEALTHY');
    expect(output).toContain('login.spec.ts');
  });

  it('includes summary statistics', () => {
    const results: CheckResult[] = [
      {
        selector: {
          filePath: 'test.spec.ts', line: 1, column: 0,
          selectorValue: '.a', selectorType: 'css', apiMethod: 'locator',
          isDynamic: false, contextCode: '', fragilityScore: 50,
        },
        status: 'healthy',
      },
      {
        selector: {
          filePath: 'test.spec.ts', line: 2, column: 0,
          selectorValue: '.b', selectorType: 'css', apiMethod: 'locator',
          isDynamic: false, contextCode: '', fragilityScore: 50,
        },
        status: 'broken',
      },
    ];

    const output = formatCheckResults(results);
    expect(output).toContain('2');  // total
    expect(output).toContain('1');  // broken count appears
  });
});
