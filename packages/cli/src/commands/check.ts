import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { extractSelectors } from '../core/selector-extractor.js';
import { enrichWithFragility } from '../core/fragility-scorer.js';
import { formatFragilityResults } from '../report/terminal-reporter.js';
import { buildJsonReport } from '../report/json-reporter.js';
import { logger, setCIMode } from '../utils/logger.js';
import { findTestFiles } from '../utils/file-finder.js';
import { EXIT_CODES, PW_DOCTOR_DIR } from '@pw-doctor/shared';
import type { SelectorInfo, TriggerSource } from '@pw-doctor/shared';

export function checkCommand(): Command {
  return new Command('check')
    .alias('validate')
    .description(
      'Statically score how fragile each selector in your tests looks (no test run). ' +
        'Worst-first fragility report — use `heal` to detect and fix actually-broken selectors.',
    )
    .option('--report <format>', 'Output report format (json|html|markdown)')
    .option('--filter <pattern>', 'Only check tests matching glob pattern')
    .option('--ci', 'CI mode: JSON output, no interactive prompts')
    .option(
      '--fail-on-fragile <n>',
      'Exit code 1 if any selector fragility score exceeds n (0-100)',
    )
    .action(async (options) => {
      const cwd = process.cwd();
      if (options.ci) setCIMode(true);

      const trigger: TriggerSource = options.ci ? 'ci' : 'cli';

      // Validate --fail-on-fragile up front so a bad threshold fails loudly.
      let fragileThreshold: number | undefined;
      if (options.failOnFragile !== undefined) {
        const parsed = Number(options.failOnFragile);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          logger.error('--fail-on-fragile must be a number between 0 and 100');
          process.exit(EXIT_CODES.TOOL_ERROR);
        }
        fragileThreshold = parsed;
      }

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

      const testFiles = findTestFiles(testDirAbs, config.testMatch, cwd);
      if (testFiles.length === 0) {
        spinner.warn('No test files found');
        process.exit(EXIT_CODES.HEALTHY);
      }

      spinner.text = `Extracting selectors from ${testFiles.length} files...`;

      // Extract selectors
      let allSelectors: SelectorInfo[] = [];
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

      const startTime = Date.now();
      allSelectors = enrichWithFragility(allSelectors);
      const checkMs = Date.now() - startTime;
      spinner.succeed(`Scored ${allSelectors.length} selectors in ${testFiles.length} files`);

      // Display fragility report (worst-first)
      if (!options.ci) {
        console.log(formatFragilityResults(allSelectors));
      }

      // Build JSON report from the resolved config — no hardcoded ai/threshold.
      const report = buildJsonReport(
        allSelectors,
        trigger,
        {
          aiEnabled: config.ai.enabled,
          autoApplyThreshold: config.repair.autoApplyThreshold,
        },
        { checkMs },
      );

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

      // --fail-on-fragile: exit 1 if any selector exceeds the threshold.
      if (fragileThreshold !== undefined) {
        const exceeded = allSelectors
          .filter((s) => s.fragilityScore > fragileThreshold!)
          .sort((a, b) => b.fragilityScore - a.fragilityScore);

        if (exceeded.length > 0) {
          logger.error(
            `${exceeded.length} selector(s) exceed fragility threshold ${fragileThreshold}:`,
          );
          for (const s of exceeded) {
            logger.error(`  ${s.fragilityScore}/100  ${s.selectorValue}  (${path.relative(cwd, s.filePath)}:${s.line})`);
          }
          process.exit(EXIT_CODES.BROKEN_FOUND);
        }
      }

      process.exit(EXIT_CODES.HEALTHY);
    });
}
