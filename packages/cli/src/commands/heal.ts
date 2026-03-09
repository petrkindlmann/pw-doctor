// packages/cli/src/commands/heal.ts
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { runPlaywrightTests, parsePlaywrightJsonOutput, extractFailedSelectors } from '../core/test-runner.js';
import { buildRepairPlan, type RepairPlan } from '../repair/repair-pipeline.js';
import { patchSelector } from '../core/ast-patcher.js';
import { createBackup, rollback } from '../repair/backup.js';
import { logger, setCIMode } from '../utils/logger.js';
import { EXIT_CODES } from '@pw-doctor/shared';
import type { RepairRecord, TriggerSource } from '@pw-doctor/shared';

export function healCommand(): Command {
  return new Command('heal')
    .description('Detect broken selectors and propose fixes')
    .option('--dry-run', 'Show proposed fixes without applying (default)', true)
    .option('--apply', 'Apply fixes meeting confidence threshold')
    .option('--interactive', 'Confirm each fix interactively')
    .option('--min-confidence <n>', 'Minimum confidence to apply', '85')
    .option('--max-files <n>', 'Maximum files to process')
    .option('--ci', 'CI mode: JSON output, no interactive prompts')
    .option('--report <format>', 'Output report format (json)')
    .action(async (options) => {
      const cwd = process.cwd();
      const runId = `pwd_${crypto.randomUUID().slice(0, 8)}`;
      if (options.ci) setCIMode(true);

      const _trigger: TriggerSource = options.ci ? 'ci' : 'cli';

      // Load config
      let config;
      try {
        config = await loadConfig(cwd);
      } catch (err) {
        logger.error(`Invalid configuration: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(EXIT_CODES.TOOL_ERROR);
      }

      const minConfidence = parseInt(options.minConfidence, 10) || config.repair.autoApplyThreshold;
      const shouldApply = options.apply === true;

      // Step 1: Run Playwright tests
      const spinner = ora('Running Playwright tests...').start();

      const testResult = await runPlaywrightTests(cwd);
      const testResults = parsePlaywrightJsonOutput(testResult.stdout);
      const failures = extractFailedSelectors(testResults);

      if (failures.length === 0) {
        spinner.succeed('All tests passing — no broken selectors found');
        process.exit(EXIT_CODES.HEALTHY);
      }

      spinner.text = `Found ${failures.length} broken selector(s). Analyzing...`;

      // Step 2: For each failure, generate repair plans
      const repairs: RepairRecord[] = [];
      const plans: Array<{ plan: RepairPlan; sourceCode: string }> = [];

      for (const failure of failures) {
        const filePath = path.resolve(cwd, failure.file);
        if (!fs.existsSync(filePath)) continue;

        const sourceCode = fs.readFileSync(filePath, 'utf-8');

        // Build repair plan (without live DOM for now — Phase 2 MVP)
        const plan = buildRepairPlan(failure, '', {
          autoApplyThreshold: minConfidence,
          suggestThreshold: config.repair.suggestThreshold,
        });

        plans.push({ plan, sourceCode });
      }

      spinner.succeed(`Analyzed ${failures.length} broken selector(s)`);

      // Step 3: Display proposed fixes
      const fixableCount = plans.filter((p) => p.plan.bestCandidate).length;

      if (fixableCount === 0) {
        logger.warn('No automatic fixes found. Manual intervention required.');
        console.log('');
        for (const { plan } of plans) {
          console.log(chalk.red(`  ✖ ${plan.failure.file}:${plan.failure.line} — ${plan.failure.selector}`));
          console.log(chalk.gray(`    No repair candidates found`));
        }
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }

      console.log('');
      console.log(chalk.bold(`Proposed fixes (${fixableCount}/${failures.length}):`));
      console.log('');

      for (const { plan } of plans) {
        if (!plan.bestCandidate) {
          console.log(chalk.red(`  ✖ ${plan.failure.file}:${plan.failure.line}`));
          console.log(chalk.gray(`    ${plan.failure.selector} → no fix found`));
          continue;
        }

        const bc = plan.bestCandidate;
        const confidenceColor =
          bc.candidate.confidence >= 85
            ? chalk.green
            : bc.candidate.confidence >= 50
              ? chalk.yellow
              : chalk.red;
        console.log(chalk.cyan(`  ${plan.failure.file}:${plan.failure.line}`));
        console.log(
          `    ${chalk.red(plan.failure.selector)} → ${chalk.green(`${bc.candidate.method}('${bc.candidate.selector}')`)}`,
        );
        console.log(
          `    Confidence: ${confidenceColor(`${bc.candidate.confidence}%`)} | Strategy: ${bc.candidate.strategy}`,
        );
        console.log(`    ${chalk.gray(bc.candidate.reasoning)}`);
        console.log('');
      }

      // Step 4: Apply fixes if --apply
      if (!shouldApply) {
        console.log(chalk.gray('Dry run — no changes applied. Use --apply to apply fixes.'));
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }

      // Apply fixes
      let verified = 0;
      let rolledBackCount = 0;

      for (const { plan, sourceCode } of plans) {
        if (!plan.bestCandidate) continue;
        if (plan.bestCandidate.candidate.confidence < minConfidence) {
          logger.warn(
            `Skipping ${plan.failure.file}:${plan.failure.line} — confidence ${plan.bestCandidate.candidate.confidence}% below threshold ${minConfidence}%`,
          );
          continue;
        }

        const filePath = path.resolve(cwd, plan.failure.file);
        const bc = plan.bestCandidate.candidate;

        // Backup
        createBackup(cwd, filePath, runId);

        // Patch
        const patchResult = patchSelector(
          sourceCode,
          plan.failure.line,
          plan.failure.selector,
          bc.selector,
          bc.method !== plan.failure.method ? bc.method : undefined,
        );

        if (!patchResult.patched) {
          logger.warn(`Could not patch ${plan.failure.file}:${plan.failure.line}`);
          continue;
        }

        fs.writeFileSync(filePath, patchResult.patchedCode, { mode: 0o600 });
        logger.info(`Patched ${plan.failure.file}:${plan.failure.line}`);

        // Verify by re-running the specific test
        const verifyResult = await runPlaywrightTests(cwd, {
          testFile: plan.failure.file,
          testNamePattern: plan.failure.testName,
          timeout: 60000,
        });

        const verifyResults = parsePlaywrightJsonOutput(verifyResult.stdout);
        const stillFailing = verifyResults.some((r) => !r.passed);

        if (!stillFailing) {
          verified++;
          logger.success(`Verified fix for ${plan.failure.file}:${plan.failure.line}`);

          repairs.push({
            filePath: plan.failure.file,
            line: plan.failure.line,
            oldSelector: plan.failure.selector,
            oldMethod: plan.failure.method,
            newSelector: bc.selector,
            newMethod: bc.method,
            strategy: bc.strategy,
            confidence: bc.confidence,
            reasoning: bc.reasoning,
            status: 'verified',
          });
        } else {
          // Rollback
          await rollback(cwd, filePath, runId);
          rolledBackCount++;
          logger.warn(`Fix failed verification — rolled back ${plan.failure.file}:${plan.failure.line}`);

          repairs.push({
            filePath: plan.failure.file,
            line: plan.failure.line,
            oldSelector: plan.failure.selector,
            oldMethod: plan.failure.method,
            newSelector: bc.selector,
            newMethod: bc.method,
            strategy: bc.strategy,
            confidence: bc.confidence,
            reasoning: bc.reasoning,
            status: 'rolled_back',
          });
        }
      }

      // Summary
      console.log('');
      console.log(chalk.bold('Summary:'));
      console.log(
        `  ${chalk.green(`${verified} verified`)} | ${chalk.red(`${rolledBackCount} rolled back`)} | ${failures.length - fixableCount} unfixable`,
      );

      if (rolledBackCount > 0) {
        process.exit(EXIT_CODES.FIXES_FAILED);
      } else if (verified > 0) {
        process.exit(EXIT_CODES.FIXES_APPLIED);
      } else {
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }
    });
}
