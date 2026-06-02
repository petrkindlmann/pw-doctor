// packages/cli/src/commands/watch.ts
import path from 'node:path';
import chalk from 'chalk';
import { watch } from 'chokidar';
import { Command } from 'commander';
import { executeHeal } from './heal.js';
import { addHealOptions } from './heal-options.js';
import { logger } from '../utils/logger.js';

export function startWatchMode(
  cwd: string,
  testDir: string,
  testMatch: string,
  onFileChange: (filePath: string) => Promise<void>,
): { close: () => Promise<void> } {
  const pattern = path.join(cwd, testDir, testMatch);
  console.log(chalk.cyan(`Watching ${pattern} for changes...`));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = watch(pattern, {
    ignoreInitial: true,
    ignored: /node_modules/,
  });

  watcher.on('change', (filePath) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(chalk.cyan(`\nChange detected: ${path.relative(cwd, filePath as string)}`));
      onFileChange(filePath as string)
        .then(() => {
          console.log(chalk.cyan('\nWatching for changes...'));
        })
        .catch((err) => {
          // Route through the leak-safe logger so sanitizeOutput runs on the
          // error text before it hits the terminal.
          logger.error(`Error processing change: ${err instanceof Error ? err.message : String(err)}`);
          console.log(chalk.cyan('\nWatching for changes...'));
        });
    }, 500);
  });

  return { close: () => watcher.close() };
}

/**
 * `pw-doctor watch` — alias for `pw-doctor heal --watch` so the command
 * surface matches user expectations. Delegates to `executeHeal` with
 * `watch: true` set.
 */
export function watchCommand(): Command {
  const cmd = new Command('watch')
    .description('Continuously heal as test files change (alias for `heal --watch`)');
  return addHealOptions(cmd)
    .action((options) => executeHeal({ ...options, watch: true }));
}
