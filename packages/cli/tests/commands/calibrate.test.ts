import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { RepairCandidate } from '@pw-doctor/shared';

// Mock the repair pipeline
vi.mock('../../src/repair/repair-pipeline.js', () => ({
  generateRepairCandidates: vi.fn(),
}));

import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import {
  CalibrationEntrySchema,
  CalibrationCorpusSchema,
  runCalibration,
  calibrateCommand,
  type CalibrationEntry,
} from '../../src/commands/calibrate.js';

const mockGenerateRepairCandidates = vi.mocked(generateRepairCandidates);

function makeCandidate(selector: string, method: string, confidence = 80): RepairCandidate {
  return {
    selector,
    method,
    confidence,
    strategy: 'attribute_match',
    reasoning: 'test',
    elementMatch: { tag: 'div', text: '', attributes: {}, isVisible: true, isUnique: true },
  };
}

function makeEntry(overrides: Partial<CalibrationEntry> = {}): CalibrationEntry {
  return {
    brokenSelector: '.old-class',
    brokenMethod: 'locator',
    html: '<div class="new-class">Hello</div>',
    expectedFix: '.new-class',
    breakageType: 'class_rename',
    ...overrides,
  };
}

describe('CalibrationEntrySchema', () => {
  it('validates a minimal valid entry', () => {
    const entry = makeEntry();
    const result = CalibrationEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('validates entry with all optional fields', () => {
    const entry = makeEntry({
      expectedMethod: 'getByTestId',
      acceptableAlternatives: ['[data-testid="alt"]'],
    });
    const result = CalibrationEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('rejects entry with empty brokenSelector', () => {
    const result = CalibrationEntrySchema.safeParse({ ...makeEntry(), brokenSelector: '' });
    expect(result.success).toBe(false);
  });

  it('rejects entry with invalid breakageType', () => {
    const result = CalibrationEntrySchema.safeParse({ ...makeEntry(), breakageType: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects entry missing required fields', () => {
    const result = CalibrationEntrySchema.safeParse({ brokenSelector: '.x' });
    expect(result.success).toBe(false);
  });
});

describe('CalibrationCorpusSchema', () => {
  it('rejects empty array', () => {
    const result = CalibrationCorpusSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('accepts array with one valid entry', () => {
    const result = CalibrationCorpusSchema.safeParse([makeEntry()]);
    expect(result.success).toBe(true);
  });
});

describe('runCalibration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports 100% precision/recall when all entries match', async () => {
    const corpus: CalibrationEntry[] = [
      makeEntry({ brokenSelector: '.old1', expectedFix: '.new1' }),
      makeEntry({ brokenSelector: '.old2', expectedFix: '.new2' }),
    ];

    mockGenerateRepairCandidates
      .mockResolvedValueOnce({ candidates: [makeCandidate('.new1', 'locator')] })
      .mockResolvedValueOnce({ candidates: [makeCandidate('.new2', 'locator')] });

    const result = await runCalibration(corpus);
    expect(result.metrics.precision).toBe(1);
    expect(result.metrics.recall).toBe(1);
    expect(result.metrics.fixAcceptanceRate).toBe(1);
    expect(result.metrics.noFixRate).toBe(0);
  });

  it('reports correct metrics when some entries do not match', async () => {
    const corpus: CalibrationEntry[] = [
      makeEntry({ brokenSelector: '.old1', expectedFix: '.new1' }),
      makeEntry({ brokenSelector: '.old2', expectedFix: '.new2' }),
      makeEntry({ brokenSelector: '.old3', expectedFix: '.new3' }),
    ];

    mockGenerateRepairCandidates
      .mockResolvedValueOnce({ candidates: [makeCandidate('.new1', 'locator')] })
      .mockResolvedValueOnce({ candidates: [makeCandidate('.wrong', 'locator')] })
      .mockResolvedValueOnce({ candidates: [makeCandidate('.new3', 'locator')] });

    const result = await runCalibration(corpus);
    // 2 exact matches out of 3 proposals
    expect(result.metrics.precision).toBeCloseTo(2 / 3, 5);
    // 2 exact matches out of 3 total
    expect(result.metrics.recall).toBeCloseTo(2 / 3, 5);
    expect(result.metrics.fixAcceptanceRate).toBeCloseTo(2 / 3, 5);
    expect(result.metrics.noFixRate).toBe(0);
  });

  it('reports 0% recall when no fixes are found', async () => {
    const corpus: CalibrationEntry[] = [
      makeEntry({ brokenSelector: '.old1', expectedFix: '.new1' }),
      makeEntry({ brokenSelector: '.old2', expectedFix: '.new2' }),
    ];

    mockGenerateRepairCandidates
      .mockResolvedValueOnce({ candidates: [] })
      .mockResolvedValueOnce({ candidates: [] });

    const result = await runCalibration(corpus);
    expect(result.metrics.precision).toBe(0);
    expect(result.metrics.recall).toBe(0);
    expect(result.metrics.fixAcceptanceRate).toBe(0);
    expect(result.metrics.noFixRate).toBe(1);
  });

  it('counts alternative matches in fix acceptance rate', async () => {
    const corpus: CalibrationEntry[] = [
      makeEntry({
        brokenSelector: '.old',
        expectedFix: '.new',
        acceptableAlternatives: ['.alt-selector'],
      }),
    ];

    // Best candidate does not match expectedFix, but an alternative matches
    mockGenerateRepairCandidates.mockResolvedValueOnce({
      candidates: [
        makeCandidate('.wrong', 'locator'),
        makeCandidate('.alt-selector', 'locator'),
      ],
    });

    const result = await runCalibration(corpus);
    expect(result.metrics.precision).toBe(0); // best candidate didn't match
    expect(result.metrics.recall).toBe(0);
    expect(result.metrics.fixAcceptanceRate).toBe(1); // alternative matched
    expect(result.entries[0].acceptedByAlternative).toBe(true);
  });

  it('respects expectedMethod when comparing candidates', async () => {
    const corpus: CalibrationEntry[] = [
      makeEntry({
        brokenSelector: 'submit',
        brokenMethod: 'locator',
        expectedFix: 'submit',
        expectedMethod: 'getByTestId',
      }),
    ];

    // Candidate has right selector but wrong method
    mockGenerateRepairCandidates.mockResolvedValueOnce({
      candidates: [makeCandidate('submit', 'locator')],
    });

    const result = await runCalibration(corpus);
    expect(result.metrics.precision).toBe(0);
    expect(result.entries[0].matched).toBe(false);
  });

  it('passes correct SelectorFailure to generateRepairCandidates', async () => {
    const corpus: CalibrationEntry[] = [
      makeEntry({ brokenSelector: '#btn', brokenMethod: 'getByTestId', html: '<button id="btn">OK</button>' }),
    ];

    mockGenerateRepairCandidates.mockResolvedValueOnce({ candidates: [] });
    await runCalibration(corpus);

    expect(mockGenerateRepairCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: '#btn',
        method: 'getByTestId',
      }),
      '<button id="btn">OK</button>',
    );
  });
});

describe('calibrateCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? '.', 'calibrate-test-'));
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeCorpus(entries: unknown[]): string {
    const corpusPath = path.join(tmpDir, 'corpus.json');
    fs.writeFileSync(corpusPath, JSON.stringify(entries));
    return corpusPath;
  }

  it('shows error for non-existent corpus file', async () => {
    const cmd = calibrateCommand();
    await cmd.parseAsync(['--corpus', '/nonexistent/corpus.json'], { from: 'user' });

    const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('Cannot read corpus file');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('shows error for invalid JSON', async () => {
    const corpusPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(corpusPath, 'not json {{{');

    const cmd = calibrateCommand();
    await cmd.parseAsync(['--corpus', corpusPath], { from: 'user' });

    const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('Invalid JSON');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('shows Zod validation error for invalid corpus entries', async () => {
    const corpusPath = writeCorpus([{ brokenSelector: '' }]);

    const cmd = calibrateCommand();
    await cmd.parseAsync(['--corpus', corpusPath], { from: 'user' });

    const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(errorOutput).toContain('Corpus validation failed');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('outputs JSON in CI mode', async () => {
    const corpusPath = writeCorpus([makeEntry()]);

    mockGenerateRepairCandidates.mockResolvedValueOnce({
      candidates: [makeCandidate('.new-class', 'locator')],
    });

    const cmd = calibrateCommand();
    await cmd.parseAsync(['--corpus', corpusPath, '--ci'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('metrics');
    expect(parsed).toHaveProperty('entries');
    expect(parsed.metrics).toHaveProperty('precision');
    expect(parsed.metrics).toHaveProperty('recall');
    expect(parsed.metrics).toHaveProperty('fixAcceptanceRate');
    expect(parsed.metrics).toHaveProperty('noFixRate');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('outputs formatted table in terminal mode', async () => {
    const corpusPath = writeCorpus([makeEntry()]);

    mockGenerateRepairCandidates.mockResolvedValueOnce({
      candidates: [makeCandidate('.new-class', 'locator')],
    });

    const cmd = calibrateCommand();
    await cmd.parseAsync(['--corpus', corpusPath], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Calibration Metrics');
    expect(output).toContain('Precision');
    expect(output).toContain('Recall');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('always exits with code 0', async () => {
    const corpusPath = writeCorpus([makeEntry()]);

    mockGenerateRepairCandidates.mockResolvedValueOnce({ candidates: [] });

    const cmd = calibrateCommand();
    await cmd.parseAsync(['--corpus', corpusPath], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
