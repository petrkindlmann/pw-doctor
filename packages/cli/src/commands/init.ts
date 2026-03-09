import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { extractSelectors } from '../core/selector-extractor.js';
import { enrichWithFragility } from '../core/fragility-scorer.js';
import { PW_DOCTOR_DIR, CONFIG_FILE_NAMES } from '@pw-doctor/shared';

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
        process.exit(2);
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

      // 4. Create config file
      const config = {
        testDir,
        testMatch: '**/*.spec.ts',
        repair: {
          maxFiles: 10,
          maxReplacementsPerFile: 5,
          autoApplyThreshold: 85,
          suggestThreshold: 50,
        },
        ai: { enabled: false },
        report: { format: 'json', outputDir: '.pw-doctor/reports' },
      };

      const configPath = path.join(cwd, '.pw-doctor.config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      logger.success(`Created ${path.relative(cwd, configPath)}`);

      // 5. Create .pw-doctor directory
      const pwDoctorDir = path.join(cwd, PW_DOCTOR_DIR);
      fs.mkdirSync(pwDoctorDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'reports'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'history', 'runs'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'backups'), { recursive: true, mode: 0o700 });

      // 6. Add .pw-doctor/ to .gitignore
      ensureGitignore(cwd);

      // 7. Scan for selectors
      const testDirAbs = path.resolve(cwd, testDir);
      if (fs.existsSync(testDirAbs)) {
        const testFiles = findTestFiles(testDirAbs);
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

function findTestFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}
