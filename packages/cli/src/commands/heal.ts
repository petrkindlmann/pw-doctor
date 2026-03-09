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
import { assertWithinRoot } from '../utils/safe-path.js';
import { redactHtml } from '../core/dom-redactor.js';
import { createAiAdapter } from '../ai/create-adapter.js';
import { promptForCandidate, assertTTY } from '../interactive/prompt.js';
import { EXIT_CODES, PW_DOCTOR_CAPTURES_DIR } from '@pw-doctor/shared';
import type { RepairRecord } from '@pw-doctor/shared';
import type { AiRepairAdapter } from '../ai/ai-adapter.js';
import { hashString } from '../utils/hash.js';
import { startWatchMode } from './watch.js';

export function findCapturedHtml(cwd: string, relativeFile: string, testName: string): string | undefined {
  const absoluteFile = path.resolve(cwd, relativeFile);
  const fileHash = hashString(absoluteFile);
  const testHash = hashString(testName);
  const captureFile = path.join(cwd, PW_DOCTOR_CAPTURES_DIR, `${fileHash}-${testHash}.html`);
  if (fs.existsSync(captureFile)) {
    return fs.readFileSync(captureFile, 'utf-8');
  }
  return undefined;
}

export function readCodeContext(filePath: string, line: number, contextLines: number = 5): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, line - contextLines - 1);
    const end = Math.min(lines.length, line + contextLines);
    return lines.slice(start, end).join('\n');
  } catch {
    return '';
  }
}

export function healCommand(): Command {
  return new Command('heal')
    .description('Detect broken selectors and propose fixes')
    .option('--dry-run', 'Show proposed fixes without applying (default)', true)
    .option('--apply', 'Apply fixes meeting confidence threshold')
    .option('--min-confidence <n>', 'Minimum confidence to apply', '85')
    .option('--max-files <n>', 'Maximum files to process')
    .option('--ci', 'CI mode: JSON output, no interactive prompts')
    .option('--interactive', 'Interactively approve/edit/skip each fix')
    .option('--no-ai', 'Disable AI repair even if configured')
    .option('--watch', 'Watch test files for changes and re-run heal')
    .action(async (options) => {
      const cwd = process.cwd();
      const runId = `pwd_${crypto.randomUUID().slice(0, 8)}`;
      if (options.ci) setCIMode(true);

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
      const isInteractive = options.interactive === true;
      const isWatch = options.watch === true;

      // --watch and --interactive are mutually exclusive
      if (isWatch && isInteractive) {
        logger.error('--watch and --interactive cannot be used together');
        process.exit(EXIT_CODES.TOOL_ERROR);
      }

      // Interactive mode requires a TTY
      if (isInteractive) {
        assertTTY();
      }

      // Create AI adapter if configured and not disabled
      let aiAdapter: AiRepairAdapter | undefined;
      if (config.ai.enabled && options.ai !== false) {
        try {
          aiAdapter = createAiAdapter({
            provider: config.ai.provider,
            model: config.ai.model,
            maxTokens: config.ai.maxTokens,
          });
        } catch (err) {
          logger.warn(`AI repair disabled: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 1: Run Playwright tests
      const spinner = ora('Running Playwright tests...').start();

      const testResult = await runPlaywrightTests(cwd);
      const testResults = parsePlaywrightJsonOutput(testResult.stdout);
      const failures = extractFailedSelectors(testResults);

      if (failures.length === 0) {
        spinner.succeed('All tests passing — no broken selectors found');
        if (!isWatch) process.exit(EXIT_CODES.HEALTHY);
      }

      spinner.text = `Found ${failures.length} broken selector(s). Analyzing...`;

      // Step 2: For each failure, generate repair plans
      const repairs: RepairRecord[] = [];
      const plans: Array<{ plan: RepairPlan; sourceCode: string }> = [];
      const maxFiles = options.maxFiles ? parseInt(options.maxFiles, 10) : config.repair.maxFiles;
      let totalAiTokens = 0;

      for (const failure of failures) {
        if (plans.length >= maxFiles) break;

        const filePath = path.resolve(cwd, failure.file);
        assertWithinRoot(cwd, filePath);
        if (!fs.existsSync(filePath)) continue;

        const sourceCode = fs.readFileSync(filePath, 'utf-8');

        // Find and redact captured HTML
        const capturedHtml = findCapturedHtml(cwd, failure.file, failure.testName);
        const redactedHtml = capturedHtml
          ? redactHtml(capturedHtml, { preset: config.redact.preset as 'moderate' | 'strict' | 'minimal' }).html
          : '';

        // Read code context around the failure line
        const contextCode = readCodeContext(filePath, failure.line);

        // Build repair plan with captured DOM and AI
        const plan = await buildRepairPlan(failure, redactedHtml, {
          autoApplyThreshold: minConfidence,
          suggestThreshold: config.repair.suggestThreshold,
          aiAdapter,
          contextCode,
        });

        if (plan.aiTokensUsed) totalAiTokens += plan.aiTokensUsed;

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
        if (!isWatch) process.exit(EXIT_CODES.BROKEN_FOUND);
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

      // Step 4: Interactive mode — prompt for each failure
      if (isInteractive) {
        let applied = 0;
        let skipped = 0;

        for (const { plan, sourceCode } of plans) {
          if (plan.allCandidates.length === 0) {
            console.log(chalk.red(`  No candidates for ${plan.failure.file}:${plan.failure.line} — skipping`));
            skipped++;
            continue;
          }

          const choice = await promptForCandidate(
            { file: plan.failure.file, line: plan.failure.line, selector: plan.failure.selector },
            plan.allCandidates,
          );

          if (choice.action === 'quit') {
            console.log(chalk.gray('  Quitting interactive mode.'));
            break;
          }

          if (choice.action === 'skip') {
            skipped++;
            continue;
          }

          // Determine selector and method to apply
          let newSelector: string;
          let newMethod: string | undefined;

          if (choice.action === 'apply') {
            newSelector = choice.candidate.candidate.selector;
            const candidateMethod = choice.candidate.candidate.method;
            newMethod = candidateMethod !== plan.failure.method ? candidateMethod : undefined;
          } else {
            // edit
            newSelector = choice.selector;
            newMethod = choice.method !== plan.failure.method ? choice.method : undefined;
          }

          const filePath = path.resolve(cwd, plan.failure.file);
          assertWithinRoot(cwd, filePath);

          createBackup(cwd, filePath, runId);

          const patchResult = patchSelector(
            sourceCode,
            plan.failure.line,
            plan.failure.selector,
            newSelector,
            newMethod,
          );

          if (!patchResult.patched) {
            logger.warn(`Could not patch ${plan.failure.file}:${plan.failure.line}`);
            continue;
          }

          fs.writeFileSync(filePath, patchResult.patchedCode, { mode: 0o600 });
          logger.info(`Patched ${plan.failure.file}:${plan.failure.line}`);
          applied++;
        }

        console.log('');
        console.log(chalk.bold('Interactive summary:'));
        console.log(`  ${chalk.green(`${applied} applied`)} | ${chalk.gray(`${skipped} skipped`)}`);

        if (applied > 0) {
          process.exit(EXIT_CODES.FIXES_APPLIED);
        } else {
          process.exit(EXIT_CODES.BROKEN_FOUND);
        }
      }

      // Step 5: Apply fixes if --apply
      if (!shouldApply) {
        console.log(chalk.gray('Dry run — no changes applied. Use --apply to apply fixes.'));
        if (!isWatch) process.exit(EXIT_CODES.BROKEN_FOUND);
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
        assertWithinRoot(cwd, filePath);
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
      if (totalAiTokens > 0) {
        console.log(`  AI tokens used: ${totalAiTokens}`);
      }

      if (!isWatch) {
        if (rolledBackCount > 0) {
          process.exit(EXIT_CODES.FIXES_FAILED);
        } else if (verified > 0) {
          process.exit(EXIT_CODES.FIXES_APPLIED);
        } else {
          process.exit(EXIT_CODES.BROKEN_FOUND);
        }
      }

      // Step 6: Watch mode — stay alive and re-run on file changes
      if (isWatch) {
        startWatchMode(cwd, config.testDir, config.testMatch, async (changedFile) => {
          console.log(chalk.cyan(`Re-running tests for ${path.relative(cwd, changedFile)}...`));
          const result = await runPlaywrightTests(cwd, {
            testFile: path.relative(cwd, changedFile),
          });
          const results = parsePlaywrightJsonOutput(result.stdout);
          const newFailures = extractFailedSelectors(results);
          if (newFailures.length === 0) {
            console.log(chalk.green('All tests passing for this file.'));
          } else {
            console.log(chalk.red(`Found ${newFailures.length} broken selector(s) in changed file.`));
            for (const f of newFailures) {
              console.log(chalk.red(`  ${f.file}:${f.line} — ${f.selector}`));
            }
          }
        });
      }
    });
}
