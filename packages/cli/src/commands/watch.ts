// packages/cli/src/commands/watch.ts
import path from 'node:path';
import chalk from 'chalk';
import { watch } from 'chokidar';

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
    debounceTimer = setTimeout(async () => {
      console.log(chalk.cyan(`\nChange detected: ${path.relative(cwd, filePath as string)}`));
      await onFileChange(filePath as string);
      console.log(chalk.cyan('\nWatching for changes...'));
    }, 500);
  });

  return { close: () => watcher.close() };
}
