import { Command } from 'commander';
import fs from 'node:fs';
import chalk from 'chalk';
import Table from 'cli-table3';
import { z } from 'zod';
import { generateRepairCandidates } from '../repair/repair-pipeline.js';
import type { SelectorFailure } from '../core/test-runner.js';
import { logger, setCIMode } from '../utils/logger.js';

export const CalibrationEntrySchema = z.object({
  brokenSelector: z.string().min(1),
  brokenMethod: z.string().min(1),
  html: z.string().min(1),
  expectedFix: z.string().min(1),
  expectedMethod: z.string().optional(),
  acceptableAlternatives: z.array(z.string()).optional(),
  breakageType: z.enum([
    'class_rename',
    'dom_restructure',
    'element_removed',
    'attribute_change',
    'text_change',
    'dynamic_content',
  ]),
});

export type CalibrationEntry = z.infer<typeof CalibrationEntrySchema>;

export const CalibrationCorpusSchema = z.array(CalibrationEntrySchema).min(1, 'Corpus must contain at least one entry');

export interface CalibrationEntryResult {
  entry: CalibrationEntry;
  bestCandidate: { selector: string; method: string } | null;
  allCandidates: Array<{ selector: string; method: string }>;
  matched: boolean;
  acceptedByAlternative: boolean;
}

export interface CalibrationMetrics {
  precision: number;
  recall: number;
  fixAcceptanceRate: number;
  noFixRate: number;
  totalEntries: number;
  fixesProposed: number;
  exactMatches: number;
  alternativeMatches: number;
}

export interface CalibrationResult {
  metrics: CalibrationMetrics;
  entries: CalibrationEntryResult[];
}

function selectorMatches(
  candidate: { selector: string; method: string },
  expectedFix: string,
  expectedMethod: string | undefined,
  brokenMethod: string,
): boolean {
  if (candidate.selector !== expectedFix) return false;
  if (expectedMethod && candidate.method !== expectedMethod) return false;
  if (!expectedMethod && candidate.method !== brokenMethod) return false;
  return true;
}

export async function runCalibration(corpus: CalibrationEntry[]): Promise<CalibrationResult> {
  const entryResults: CalibrationEntryResult[] = [];

  for (const entry of corpus) {
    const failure: SelectorFailure = {
      file: 'calibration.spec.ts',
      line: 1,
      column: 1,
      selector: entry.brokenSelector,
      method: entry.brokenMethod,
      testName: 'calibration',
      error: 'Element not found',
    };

    const { candidates } = await generateRepairCandidates(failure, entry.html);

    const allCandidates = candidates.map((c) => ({ selector: c.selector, method: c.method }));
    const bestCandidate = candidates.length > 0
      ? { selector: candidates[0].selector, method: candidates[0].method }
      : null;

    const effectiveMethod = entry.expectedMethod ?? entry.brokenMethod;

    // Check if best candidate matches expected fix
    const matched = bestCandidate !== null && selectorMatches(bestCandidate, entry.expectedFix, entry.expectedMethod, entry.brokenMethod);

    // Check if any candidate matches expected or alternatives
    let acceptedByAlternative = false;
    if (!matched) {
      const allAcceptable = [entry.expectedFix, ...(entry.acceptableAlternatives ?? [])];
      acceptedByAlternative = candidates.some((c) => {
        for (const alt of allAcceptable) {
          if (c.selector === alt) {
            if (entry.expectedMethod && c.method !== entry.expectedMethod) continue;
            if (!entry.expectedMethod && c.method !== entry.brokenMethod) continue;
            return true;
          }
        }
        return false;
      });
    }

    entryResults.push({
      entry,
      bestCandidate,
      allCandidates,
      matched,
      acceptedByAlternative,
    });
  }

  // Calculate metrics
  const totalEntries = entryResults.length;
  const fixesProposed = entryResults.filter((r) => r.bestCandidate !== null).length;
  const exactMatches = entryResults.filter((r) => r.matched).length;
  const alternativeMatches = entryResults.filter((r) => r.matched || r.acceptedByAlternative).length;

  const precision = fixesProposed > 0 ? exactMatches / fixesProposed : 0;
  const recall = totalEntries > 0 ? exactMatches / totalEntries : 0;
  const fixAcceptanceRate = totalEntries > 0 ? alternativeMatches / totalEntries : 0;
  const noFixRate = totalEntries > 0 ? (totalEntries - fixesProposed) / totalEntries : 0;

  return {
    metrics: {
      precision,
      recall,
      fixAcceptanceRate,
      noFixRate,
      totalEntries,
      fixesProposed,
      exactMatches,
      alternativeMatches,
    },
    entries: entryResults,
  };
}

function formatTerminalOutput(result: CalibrationResult): string {
  const lines: string[] = [];

  // Per-entry results table
  const table = new Table({
    head: ['#', 'Broken Selector', 'Type', 'Expected', 'Best Fix', 'Result'],
    colWidths: [4, 25, 18, 25, 25, 10],
    wordWrap: true,
  });

  result.entries.forEach((r, i) => {
    const resultStr = r.matched
      ? chalk.green('MATCH')
      : r.acceptedByAlternative
        ? chalk.yellow('ALT')
        : r.bestCandidate
          ? chalk.red('MISS')
          : chalk.gray('NO FIX');

    table.push([
      String(i + 1),
      r.entry.brokenSelector,
      r.entry.breakageType,
      r.entry.expectedFix,
      r.bestCandidate?.selector ?? '(none)',
      resultStr,
    ]);
  });

  lines.push(table.toString());
  lines.push('');

  // Summary metrics
  const m = result.metrics;
  lines.push(chalk.bold('Calibration Metrics:'));
  lines.push(`  Precision:           ${(m.precision * 100).toFixed(1)}% (${m.exactMatches}/${m.fixesProposed})`);
  lines.push(`  Recall:              ${(m.recall * 100).toFixed(1)}% (${m.exactMatches}/${m.totalEntries})`);
  lines.push(`  Fix acceptance rate: ${(m.fixAcceptanceRate * 100).toFixed(1)}% (${m.alternativeMatches}/${m.totalEntries})`);
  lines.push(`  No-fix rate:         ${(m.noFixRate * 100).toFixed(1)}% (${m.totalEntries - m.fixesProposed}/${m.totalEntries})`);

  return lines.join('\n');
}

export function calibrateCommand(): Command {
  return new Command('calibrate')
    .description('Run calibration harness against a test corpus')
    .requiredOption('--corpus <path>', 'Path to calibration corpus JSON file')
    .option('--ci', 'CI mode: JSON output')
    .action(async (options) => {
      if (options.ci) setCIMode(true);

      // Read corpus file
      let rawContent: string;
      try {
        rawContent = fs.readFileSync(options.corpus, 'utf-8');
      } catch {
        logger.error(`Cannot read corpus file: ${options.corpus}`);
        process.exit(2);
        return;
      }

      // Parse JSON
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(rawContent);
      } catch {
        logger.error(`Invalid JSON in corpus file: ${options.corpus}`);
        process.exit(2);
        return;
      }

      // Validate with Zod
      const validation = CalibrationCorpusSchema.safeParse(rawJson);
      if (!validation.success) {
        const issues = validation.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
        logger.error(`Corpus validation failed:\n${issues}`);
        process.exit(2);
        return;
      }

      const corpus = validation.data;

      // Run calibration
      const result = await runCalibration(corpus);

      // Output
      if (options.ci) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatTerminalOutput(result));
      }

      process.exit(0);
    });
}
