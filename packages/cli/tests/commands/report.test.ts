import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { RunHistory, RepairRecord } from '@pw-doctor/shared';
import {
  loadRunHistory,
  aggregateRuns,
  generateHtmlReport,
  generateMarkdownReport,
  reportCommand,
  type AggregatedReport,
} from '../../src/commands/report.js';

function makeRepair(overrides: Partial<RepairRecord> = {}): RepairRecord {
  return {
    filePath: 'tests/login.spec.ts',
    line: 10,
    oldSelector: '.old-btn',
    oldMethod: 'locator',
    newSelector: '[data-testid="login"]',
    newMethod: 'getByTestId',
    strategy: 'attribute_match',
    confidence: 90,
    reasoning: 'Found matching test id',
    status: 'verified',
    ...overrides,
  };
}

function makeRunHistory(overrides: Partial<RunHistory> = {}): RunHistory {
  return {
    schemaVersion: 1,
    runId: 'pwd_abc123',
    timestamp: new Date().toISOString(),
    trigger: 'cli',
    config: { aiEnabled: false, autoApplyThreshold: 85 },
    git: null,
    results: {
      totalSelectors: 50,
      healthy: 45,
      broken: 5,
      repaired: 3,
      verified: 2,
      rolledBack: 1,
      needsManualReview: 0,
      skippedDynamic: 0,
    },
    repairs: [makeRepair()],
    timing: { totalMs: 1000, checkMs: 500, repairMs: 300, verifyMs: 200 },
    ...overrides,
  };
}

function writeRunFile(dir: string, name: string, run: RunHistory): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(run));
}

describe('loadRunHistory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? '.', 'report-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when directory does not exist', () => {
    const result = loadRunHistory(path.join(tmpDir, 'nonexistent'), 10);
    expect(result).toEqual([]);
  });

  it('loads and sorts run files by filename', () => {
    const historyDir = path.join(tmpDir, 'runs');
    const run1 = makeRunHistory({ runId: 'pwd_first', timestamp: '2025-01-01T00:00:00.000Z' });
    const run2 = makeRunHistory({ runId: 'pwd_second', timestamp: '2025-01-02T00:00:00.000Z' });

    writeRunFile(historyDir, '2025-01-01T00-00-00-000Z.json', run1);
    writeRunFile(historyDir, '2025-01-02T00-00-00-000Z.json', run2);

    const result = loadRunHistory(historyDir, 10);
    expect(result).toHaveLength(2);
    expect(result[0].runId).toBe('pwd_first');
    expect(result[1].runId).toBe('pwd_second');
  });

  it('respects last N limit', () => {
    const historyDir = path.join(tmpDir, 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory({ runId: 'pwd_1' }));
    writeRunFile(historyDir, '2025-01-02.json', makeRunHistory({ runId: 'pwd_2' }));
    writeRunFile(historyDir, '2025-01-03.json', makeRunHistory({ runId: 'pwd_3' }));

    const result = loadRunHistory(historyDir, 2);
    expect(result).toHaveLength(2);
    expect(result[0].runId).toBe('pwd_2');
    expect(result[1].runId).toBe('pwd_3');
  });

  it('skips malformed JSON files', () => {
    const historyDir = path.join(tmpDir, 'runs');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(historyDir, 'bad.json'), 'not-json{{{');
    writeRunFile(historyDir, 'good.json', makeRunHistory({ runId: 'pwd_good' }));

    const result = loadRunHistory(historyDir, 10);
    expect(result).toHaveLength(1);
    expect(result[0].runId).toBe('pwd_good');
  });
});

describe('aggregateRuns', () => {
  it('aggregates totals across runs', () => {
    const runs = [
      makeRunHistory({
        results: { totalSelectors: 50, healthy: 45, broken: 5, repaired: 3, verified: 2, rolledBack: 1, needsManualReview: 0, skippedDynamic: 0 },
        repairs: [makeRepair()],
      }),
      makeRunHistory({
        results: { totalSelectors: 30, healthy: 28, broken: 2, repaired: 1, verified: 1, rolledBack: 0, needsManualReview: 0, skippedDynamic: 0 },
        repairs: [makeRepair({ filePath: 'tests/signup.spec.ts', oldSelector: '.signup-btn' })],
      }),
    ];

    const report = aggregateRuns(runs);
    expect(report.runsIncluded).toBe(2);
    expect(report.totalSelectors).toBe(80);
    expect(report.healthyCount).toBe(73);
    expect(report.brokenCount).toBe(7);
    expect(report.verifiedCount).toBe(3);
    expect(report.rolledBackCount).toBe(1);
    expect(report.repairs).toHaveLength(2);
  });

  it('computes fragile selectors sorted by break count', () => {
    const runs = [
      makeRunHistory({
        repairs: [
          makeRepair({ oldSelector: '.flaky', filePath: 'a.ts' }),
          makeRepair({ oldSelector: '.flaky', filePath: 'a.ts' }),
          makeRepair({ oldSelector: '.stable', filePath: 'b.ts' }),
        ],
      }),
    ];

    const report = aggregateRuns(runs);
    expect(report.fragileSelectors[0].selector).toBe('.flaky');
    expect(report.fragileSelectors[0].breakCount).toBe(2);
    expect(report.fragileSelectors[1].selector).toBe('.stable');
    expect(report.fragileSelectors[1].breakCount).toBe(1);
  });

  it('groups repairs by file', () => {
    const runs = [
      makeRunHistory({
        repairs: [
          makeRepair({ filePath: 'a.ts' }),
          makeRepair({ filePath: 'b.ts' }),
          makeRepair({ filePath: 'a.ts', oldSelector: '.other' }),
        ],
      }),
    ];

    const report = aggregateRuns(runs);
    expect(Object.keys(report.perFile)).toHaveLength(2);
    expect(report.perFile['a.ts']).toHaveLength(2);
    expect(report.perFile['b.ts']).toHaveLength(1);
  });

  it('returns 100% healthy when no selectors exist', () => {
    const report = aggregateRuns([]);
    expect(report.healthyPercent).toBe(100);
    expect(report.totalSelectors).toBe(0);
    expect(report.repairs).toHaveLength(0);
    expect(report.fragileSelectors).toHaveLength(0);
  });
});

describe('generateHtmlReport', () => {
  function makeReport(overrides: Partial<AggregatedReport> = {}): AggregatedReport {
    return {
      generatedAt: '2025-06-01T00:00:00.000Z',
      runsIncluded: 2,
      totalSelectors: 50,
      healthyCount: 45,
      brokenCount: 5,
      healthyPercent: 90,
      repairedCount: 3,
      verifiedCount: 2,
      rolledBackCount: 1,
      fragileSelectors: [{ selector: '.flaky', file: 'a.ts', breakCount: 3 }],
      repairs: [makeRepair()],
      perFile: { 'tests/login.spec.ts': [makeRepair()] },
      ...overrides,
    };
  }

  it('contains Health Summary section', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('Health Summary');
    expect(html).toContain('Total Selectors');
    expect(html).toContain('50');
    expect(html).toContain('90%');
  });

  it('contains Most Fragile Selectors section', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('Most Fragile Selectors');
    expect(html).toContain('.flaky');
    expect(html).toContain('a.ts');
  });

  it('contains Repair History section', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('Repair History');
    expect(html).toContain('.old-btn');
    expect(html).toContain('[data-testid=&quot;login&quot;]');
    expect(html).toContain('attribute_match');
  });

  it('contains Per-File Breakdown section', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('Per-File Breakdown');
    expect(html).toContain('tests/login.spec.ts');
  });

  it('handles empty report with zero repairs', () => {
    const html = generateHtmlReport(makeReport({
      totalSelectors: 0,
      healthyCount: 0,
      brokenCount: 0,
      healthyPercent: 100,
      fragileSelectors: [],
      repairs: [],
      perFile: {},
    }));
    expect(html).toContain('Health Summary');
    expect(html).toContain('No fragile selectors detected.');
    expect(html).toContain('No repairs recorded.');
  });

  it('is a self-contained HTML page', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<style>');
    expect(html).toContain('</html>');
  });
});

describe('generateMarkdownReport', () => {
  function makeReport(overrides: Partial<AggregatedReport> = {}): AggregatedReport {
    return {
      generatedAt: '2025-06-01T00:00:00.000Z',
      runsIncluded: 2,
      totalSelectors: 50,
      healthyCount: 45,
      brokenCount: 5,
      healthyPercent: 90,
      repairedCount: 3,
      verifiedCount: 2,
      rolledBackCount: 1,
      fragileSelectors: [{ selector: '.flaky', file: 'a.ts', breakCount: 3 }],
      repairs: [makeRepair()],
      perFile: { 'tests/login.spec.ts': [makeRepair()] },
      ...overrides,
    };
  }

  it('contains all expected section headers', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('## Health Summary');
    expect(md).toContain('## Most Fragile Selectors');
    expect(md).toContain('## Repair History');
    expect(md).toContain('## Per-File Breakdown');
  });

  it('renders markdown tables with data', () => {
    const md = generateMarkdownReport(makeReport());
    expect(md).toContain('| Total Selectors | 50 |');
    expect(md).toContain('| Healthy | 90% |');
    expect(md).toContain('`.flaky`');
    expect(md).toContain('`.old-btn`');
  });

  it('handles empty report', () => {
    const md = generateMarkdownReport(makeReport({
      totalSelectors: 0,
      brokenCount: 0,
      healthyPercent: 100,
      fragileSelectors: [],
      repairs: [],
      perFile: {},
    }));
    expect(md).toContain('No fragile selectors detected.');
    expect(md).toContain('No repairs recorded.');
  });
});

describe('JSON report format', () => {
  it('produces valid JSON with expected fields', () => {
    const runs = [makeRunHistory()];
    const report = aggregateRuns(runs);
    const json = JSON.stringify(report, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('generatedAt');
    expect(parsed).toHaveProperty('runsIncluded');
    expect(parsed).toHaveProperty('totalSelectors');
    expect(parsed).toHaveProperty('healthyPercent');
    expect(parsed).toHaveProperty('brokenCount');
    expect(parsed).toHaveProperty('fragileSelectors');
    expect(parsed).toHaveProperty('repairs');
    expect(parsed).toHaveProperty('perFile');
  });

  it('JSON from empty runs has zero counts', () => {
    const report = aggregateRuns([]);
    const json = JSON.stringify(report, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.totalSelectors).toBe(0);
    expect(parsed.brokenCount).toBe(0);
    expect(parsed.runsIncluded).toBe(0);
    expect(parsed.repairs).toEqual([]);
    expect(parsed.fragileSelectors).toEqual([]);
  });
});

describe('reportCommand', () => {
  let tmpDir: string;
  let consoleSpy: ReturnType<typeof import('vitest')['vi']['spyOn']>;
  let consoleErrorSpy: ReturnType<typeof import('vitest')['vi']['spyOn']>;
  let exitSpy: ReturnType<typeof import('vitest')['vi']['spyOn']>;
  let originalCwd: string;

  beforeEach(async () => {
    const { vi } = await import('vitest');
    tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? '.', 'report-cmd-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    const { vi } = await import('vitest');
    process.chdir(originalCwd);
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates HTML report at default path', async () => {
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory());

    const cmd = reportCommand();
    await cmd.parseAsync(['--format', 'html'], { from: 'user' });

    const defaultPath = path.join(tmpDir, '.pw-doctor', 'reports', 'report.html');
    expect(fs.existsSync(defaultPath)).toBe(true);
    const content = fs.readFileSync(defaultPath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('Health Summary');
  });

  it('generates JSON report at custom output path', async () => {
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory());

    const outputPath = path.join(tmpDir, 'custom-report.json');
    const cmd = reportCommand();
    await cmd.parseAsync(['--format', 'json', '--output', outputPath], { from: 'user' });

    expect(fs.existsSync(outputPath)).toBe(true);
    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('totalSelectors');
    expect(parsed).toHaveProperty('repairs');
  });

  it('generates markdown report', async () => {
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory());

    const cmd = reportCommand();
    await cmd.parseAsync(['--format', 'markdown'], { from: 'user' });

    const defaultPath = path.join(tmpDir, '.pw-doctor', 'reports', 'report.md');
    expect(fs.existsSync(defaultPath)).toBe(true);
    const content = fs.readFileSync(defaultPath, 'utf-8');
    expect(content).toContain('## Health Summary');
    expect(content).toContain('## Repair History');
  });

  it('generates report with empty history (zero counts)', async () => {
    // No history directory at all
    const cmd = reportCommand();
    await cmd.parseAsync(['--format', 'json'], { from: 'user' });

    const defaultPath = path.join(tmpDir, '.pw-doctor', 'reports', 'report.json');
    expect(fs.existsSync(defaultPath)).toBe(true);
    const content = fs.readFileSync(defaultPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.totalSelectors).toBe(0);
    expect(parsed.brokenCount).toBe(0);
    expect(parsed.runsIncluded).toBe(0);
  });

  it('--last flag limits runs included', async () => {
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory({ results: { totalSelectors: 10, healthy: 10, broken: 0, repaired: 0, verified: 0, rolledBack: 0, needsManualReview: 0, skippedDynamic: 0 }, repairs: [] }));
    writeRunFile(historyDir, '2025-01-02.json', makeRunHistory({ results: { totalSelectors: 20, healthy: 18, broken: 2, repaired: 0, verified: 0, rolledBack: 0, needsManualReview: 0, skippedDynamic: 0 }, repairs: [] }));
    writeRunFile(historyDir, '2025-01-03.json', makeRunHistory({ results: { totalSelectors: 30, healthy: 25, broken: 5, repaired: 0, verified: 0, rolledBack: 0, needsManualReview: 0, skippedDynamic: 0 }, repairs: [] }));

    const outputPath = path.join(tmpDir, 'limited.json');
    const cmd = reportCommand();
    await cmd.parseAsync(['--format', 'json', '--last', '2', '--output', outputPath], { from: 'user' });

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);
    // Should only include last 2 runs: totalSelectors = 20 + 30 = 50
    expect(parsed.runsIncluded).toBe(2);
    expect(parsed.totalSelectors).toBe(50);
  });

  it('default output path uses correct extension per format', async () => {
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory());

    const cmd = reportCommand();
    await cmd.parseAsync(['--format', 'html'], { from: 'user' });
    expect(fs.existsSync(path.join(tmpDir, '.pw-doctor', 'reports', 'report.html'))).toBe(true);
  });

  it('uses config.report.format as default when --format is absent', async () => {
    // Config sets format: markdown — no --format flag passed.
    fs.writeFileSync(
      path.join(tmpDir, '.pw-doctor.config.json'),
      JSON.stringify({ report: { format: 'markdown' } }),
    );
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory());

    const cmd = reportCommand();
    await cmd.parseAsync([], { from: 'user' });

    const mdPath = path.join(tmpDir, '.pw-doctor', 'reports', 'report.md');
    expect(fs.existsSync(mdPath)).toBe(true);
    const content = fs.readFileSync(mdPath, 'utf-8');
    expect(content).toContain('## Health Summary');
  });

  it('uses config.report.outputDir as default output directory', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.pw-doctor.config.json'),
      JSON.stringify({ report: { format: 'json', outputDir: 'custom-reports' } }),
    );
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory());

    const cmd = reportCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(fs.existsSync(path.join(tmpDir, 'custom-reports', 'report.json'))).toBe(true);
  });

  it('--format flag overrides config.report.format', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.pw-doctor.config.json'),
      JSON.stringify({ report: { format: 'markdown' } }),
    );
    const historyDir = path.join(tmpDir, '.pw-doctor', 'history', 'runs');
    writeRunFile(historyDir, '2025-01-01.json', makeRunHistory());

    const cmd = reportCommand();
    await cmd.parseAsync(['--format', 'html'], { from: 'user' });

    expect(fs.existsSync(path.join(tmpDir, '.pw-doctor', 'reports', 'report.html'))).toBe(true);
  });
});
