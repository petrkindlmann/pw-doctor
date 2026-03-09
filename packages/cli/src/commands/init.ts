import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { findTestFiles } from '../utils/file-finder.js';
import { extractSelectors } from '../core/selector-extractor.js';
import { enrichWithFragility } from '../core/fragility-scorer.js';
import { setupGitleaksHook } from '../utils/gitleaks-hook.js';
import { PW_DOCTOR_DIR, CONFIG_FILE_NAMES, EXIT_CODES } from '@pw-doctor/shared';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize pw-doctor in a Playwright project')
    .action(async () => {
      const cwd = process.cwd();

      // 1. Find playwright config
      const playwrightConfig = findPlaywrightConfig(cwd);
      if (!playwrightConfig) {
        logger.error(
          'No playwright.config.{ts,js,mjs} found. Are you in a Playwright project?',
        );
        process.exit(EXIT_CODES.TOOL_ERROR);
      }
      logger.success(`Found Playwright config: ${path.relative(cwd, playwrightConfig)}`);

      // 2. Check if already initialized
      const existingConfig = CONFIG_FILE_NAMES.find((name) =>
        fs.existsSync(path.join(cwd, name)),
      );
      if (existingConfig) {
        logger.warn(`Already initialized: ${existingConfig}`);
        return;
      }

      // 3. Detect test directory
      const testDir = detectTestDir(cwd);
      logger.info(`Test directory: ${testDir}`);

      // 4. Detect AI API keys
      const hasAiKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

      // 5. Create config file
      const config = {
        testDir,
        testMatch: '**/*.spec.ts',
        repair: {
          maxFiles: 10,
          maxReplacementsPerFile: 5,
          autoApplyThreshold: 85,
          suggestThreshold: 50,
        },
        ai: { enabled: hasAiKey },
        report: { format: 'json', outputDir: '.pw-doctor/reports' },
      };

      const configPath = path.join(cwd, '.pw-doctor.config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      logger.success(`Created ${path.relative(cwd, configPath)}`);

      // 6. Create .pw-doctor directory
      const pwDoctorDir = path.join(cwd, PW_DOCTOR_DIR);
      fs.mkdirSync(pwDoctorDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'reports'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'history', 'runs'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'backups'), { recursive: true, mode: 0o700 });

      // 7. Add .pw-doctor/ to .gitignore
      ensureGitignore(cwd);

      // 8. Set up pre-commit hook for secret scanning
      const hookResult = setupGitleaksHook(cwd);
      if (hookResult.installed) {
        logger.success(hookResult.message);
      } else {
        logger.info(hookResult.message);
      }

      // 9. Scan for selectors
      const testDirAbs = path.resolve(cwd, testDir);
      if (fs.existsSync(testDirAbs)) {
        const testFiles = findTestFiles(testDirAbs, '**/*.spec.ts');
        let allSelectors: ReturnType<typeof extractSelectors> = [];
        for (const file of testFiles) {
          try {
            const selectors = extractSelectors(file);
            allSelectors = allSelectors.concat(selectors);
          } catch {
            // Skip files that fail to parse
          }
        }
        allSelectors = enrichWithFragility(allSelectors);

        const fragile = allSelectors.filter((s) => s.fragilityScore >= 60);
        const dynamic = allSelectors.filter((s) => s.isDynamic);

        console.log('');
        console.log(
          chalk.bold(
            `Found ${allSelectors.length} selectors in ${testFiles.length} test files`,
          ),
        );
        if (fragile.length > 0) {
          console.log(
            chalk.yellow(`  ${fragile.length} fragile (score >= 60)`),
          );
        }
        if (dynamic.length > 0) {
          console.log(
            chalk.gray(`  ${dynamic.length} dynamic (cannot auto-repair)`),
          );
        }
        console.log('');
        console.log(`Run ${chalk.cyan('pw-doctor check')} to validate selectors against your live site.`);
      }

      // 9. Suggest reporter setup if playwright config exists
      if (playwrightConfig) {
        console.log('');
        console.log(chalk.bold('To enable DOM capture for AI-powered repair, update your Playwright setup:'));
        console.log('');
        console.log('  1. Add reporter to playwright.config.ts:');
        console.log(chalk.cyan("     reporter: [['default'], ['pw-doctor/reporter']]"));
        console.log('');
        console.log('  2. In your test files, replace:');
        console.log(chalk.gray("     import { test, expect } from '@playwright/test';"));
        console.log('  with:');
        console.log(chalk.cyan("     import { test, expect } from 'pw-doctor/reporter';"));
      }

      // 10. Show AI key status
      if (hasAiKey) {
        logger.success('AI repair enabled (API key detected)');
      } else {
        console.log('');
        logger.info('AI repair is available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable.');
      }
    });
}

function findPlaywrightConfig(cwd: string): string | null {
  const names = [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mjs',
  ];
  for (const name of names) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function detectTestDir(cwd: string): string {
  const candidates = ['tests', 'e2e', 'spec', 'test'];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(cwd, dir))) return `./${dir}`;
  }
  return './tests';
}

function ensureGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.pw-doctor')) {
      fs.appendFileSync(gitignorePath, '\n# PW-Doctor\n.pw-doctor/\n');
      logger.success('Added .pw-doctor/ to .gitignore');
    }
  }
}
