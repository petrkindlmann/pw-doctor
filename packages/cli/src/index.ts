import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { checkCommand } from './commands/check.js';
import { healCommand } from './commands/heal.js';
import { credentialsCommand } from './commands/credentials.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('pw-doctor')
    .description('AI-powered Playwright test selector maintenance')
    .version('0.0.1');

  program.addCommand(initCommand());
  program.addCommand(checkCommand());
  program.addCommand(healCommand());
  program.addCommand(credentialsCommand());

  return program;
}
