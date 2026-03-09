import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { extractSelectors } from '../core/selector-extractor.js';
import { enrichWithFragility } from '../core/fragility-scorer.js';
import { formatCheckResults } from '../report/terminal-reporter.js';
import { buildJsonReport } from '../report/json-reporter.js';
import { logger, setCIMode } from '../utils/logger.js';
import { findTestFiles } from '../utils/file-finder.js';
import { EXIT_CODES, PW_DOCTOR_DIR } from '@pw-doctor/shared';
import type { CheckResult, TriggerSource } from '@pw-doctor/shared';

export function checkCommand(): Command {
  return new Command('check')
    .alias('validate')
    .description('Scan test files and report selector health')
    .option('--report <format>', 'Output report format (json|html|markdown)')
    .option('--filter <pattern>', 'Only check tests matching glob pattern')
    .option('--ci', 'CI mode: JSON output, no interactive prompts')
    .option('--fail-on-broken', 'Exit code 1 if any broken selectors found')
    .action(async (options) => {
      const cwd = process.cwd();
      if (options.ci) setCIMode(true);

      const trigger: TriggerSource = options.ci ? 'ci' : 'cli';

      // Load config
      let config;
      try {
        config = await loadConfig(cwd);
      } catch (err) {
        logger.error(`Invalid configuration: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(EXIT_CODES.TOOL_ERROR);
      }

      // Find test files
      const testDirAbs = path.resolve(cwd, config.testDir);
      if (!fs.existsSync(testDirAbs)) {
        logger.error(`Test directory not found: ${config.testDir}`);
        process.exit(EXIT_CODES.TOOL_ERROR);
      }

      const spinner = ora('Scanning test files...').start();

      const testFiles = findTestFiles(testDirAbs, config.testMatch);
      if (testFiles.length === 0) {
        spinner.warn('No test files found');
        process.exit(EXIT_CODES.HEALTHY);
      }

      spinner.text = `Extracting selectors from ${testFiles.length} files...`;

      // Extract selectors
      let allSelectors: ReturnType<typeof extractSelectors> = [];
      for (const file of testFiles) {
        try {
          const selectors = extractSelectors(file);
          allSelectors = allSelectors.concat(selectors);
        } catch (err) {
          logger.warn(
            `Failed to parse ${path.relative(cwd, file)}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      allSelectors = enrichWithFragility(allSelectors);
      spinner.succeed(`Found ${allSelectors.length} selectors in ${testFiles.length} files`);

      // For Phase 1: mark all selectors as "unknown" status
      // (live validation comes in Phase 2 when we hook into test execution)
      const startTime = Date.now();
      const results: CheckResult[] = allSelectors.map((selector) => ({
        selector,
        status: 'unknown' as const,
      }));
      const checkMs = Date.now() - startTime;

      // Display results
      if (!options.ci) {
        console.log(formatCheckResults(results));
      }

      // Build JSON report
      const report = buildJsonReport(results, trigger, { checkMs });

      // Write report if requested or in CI mode
      if (options.report === 'json' || options.ci) {
        const reportDir = path.resolve(cwd, config.report.outputDir);
        fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
        const reportPath = path.join(reportDir, 'latest.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), {
          mode: 0o600,
        });
        if (options.ci) {
          // In CI, output JSON to stdout
          console.log(JSON.stringify(report));
        } else {
          logger.info(`Report written to ${path.relative(cwd, reportPath)}`);
        }
      }

      // Save to history
      const historyDir = path.resolve(
        cwd,
        PW_DOCTOR_DIR,
        'history',
        'runs',
      );
      if (fs.existsSync(path.dirname(historyDir))) {
        fs.mkdirSync(historyDir, { recursive: true, mode: 0o700 });
        const historyPath = path.join(
          historyDir,
          `${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        );
        fs.writeFileSync(historyPath, JSON.stringify(report, null, 2), {
          mode: 0o600,
        });
      }

      // Exit code
      const broken = results.filter((r) => r.status === 'broken').length;
      if (broken > 0 && (options.failOnBroken || options.ci)) {
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }
      process.exit(EXIT_CODES.HEALTHY);
    });
}
