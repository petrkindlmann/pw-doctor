// packages/cli/tests/report/terminal-reporter.test.ts
import { describe, it, expect } from 'vitest';
import { formatFragilityResults } from '../../src/report/terminal-reporter.js';
import type { SelectorInfo } from '@pw-doctor/shared';

function sel(overrides: Partial<SelectorInfo>): SelectorInfo {
  return {
    filePath: 'tests/login.spec.ts',
    line: 1,
    column: 0,
    selectorValue: '.a',
    selectorType: 'css',
    apiMethod: 'locator',
    isDynamic: false,
    contextCode: '',
    fragilityScore: 50,
    ...overrides,
  };
}

describe('formatFragilityResults', () => {
  it('renders selectors as a fragility report (no broken/healthy status)', () => {
    const selectors: SelectorInfo[] = [
      sel({ selectorValue: '.btn-primary', line: 42, fragilityScore: 78 }),
      sel({ selectorValue: 'dashboard-header', selectorType: 'testid', line: 55, fragilityScore: 10 }),
    ];

    const output = formatFragilityResults(selectors);
    expect(output).toContain('.btn-primary');
    expect(output).toContain('login.spec.ts');
    expect(output).toContain('Fragility');
    // No misleading runtime-health language.
    expect(output).not.toContain('BROKEN');
    expect(output).not.toContain('HEALTHY');
  });

  it('sorts worst-first by fragility score', () => {
    const selectors: SelectorInfo[] = [
      sel({ selectorValue: '.low', fragilityScore: 12 }),
      sel({ selectorValue: '.high', fragilityScore: 92 }),
      sel({ selectorValue: '.mid', fragilityScore: 50 }),
    ];

    const output = formatFragilityResults(selectors);
    const idxHigh = output.indexOf('.high');
    const idxMid = output.indexOf('.mid');
    const idxLow = output.indexOf('.low');
    expect(idxHigh).toBeGreaterThanOrEqual(0);
    expect(idxHigh).toBeLessThan(idxMid);
    expect(idxMid).toBeLessThan(idxLow);
  });

  it('includes a summary with scanned count and fragility buckets', () => {
    const selectors: SelectorInfo[] = [
      sel({ selectorValue: '.a', fragilityScore: 80 }),
      sel({ selectorValue: '.b', fragilityScore: 30 }),
    ];

    const output = formatFragilityResults(selectors);
    expect(output).toContain('2 selectors scanned');
    expect(output).toContain('fragile');
  });
});
