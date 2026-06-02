// packages/cli/tests/report/json-reporter.test.ts
import { describe, it, expect } from 'vitest';
import { buildJsonReport } from '../../src/report/json-reporter.js';
import { RunHistorySchema } from '@pw-doctor/shared';
import type { SelectorInfo } from '@pw-doctor/shared';

function sel(overrides: Partial<SelectorInfo>): SelectorInfo {
  return {
    filePath: 'test.spec.ts',
    line: 1,
    column: 0,
    selectorValue: '.btn',
    selectorType: 'css',
    apiMethod: 'locator',
    isDynamic: false,
    contextCode: '',
    fragilityScore: 65,
    ...overrides,
  };
}

describe('buildJsonReport', () => {
  it('produces a valid RunHistory JSON with resolved config values', () => {
    const selectors: SelectorInfo[] = [
      sel({ selectorValue: '.btn', fragilityScore: 65 }),
      sel({ selectorValue: 'submit', selectorType: 'testid', line: 5, fragilityScore: 10 }),
    ];

    const report = buildJsonReport(selectors, 'cli', {
      aiEnabled: true,
      autoApplyThreshold: 70,
    });

    const parsed = RunHistorySchema.parse(report);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.results.totalSelectors).toBe(2);
    expect(parsed.trigger).toBe('cli');
    // Config values come from the caller, not hardcoded.
    expect(parsed.config.aiEnabled).toBe(true);
    expect(parsed.config.autoApplyThreshold).toBe(70);
  });

  it('keeps runtime-only counters at structural zero (check does no test run)', () => {
    const report = buildJsonReport([sel({})], 'cli', {
      aiEnabled: false,
      autoApplyThreshold: 85,
    });

    expect(report.results.healthy).toBe(0);
    expect(report.results.broken).toBe(0);
    expect(report.results.repaired).toBe(0);
    expect(report.results.verified).toBe(0);
    expect(report.results.rolledBack).toBe(0);
  });

  it('counts dynamic selectors as skippedDynamic', () => {
    const report = buildJsonReport(
      [sel({ isDynamic: true }), sel({ isDynamic: false })],
      'cli',
      { aiEnabled: false, autoApplyThreshold: 85 },
    );
    expect(report.results.skippedDynamic).toBe(1);
  });
});
