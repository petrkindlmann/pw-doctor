import { Command } from 'commander';
import chalk from 'chalk';

export function credentialsCommand(): Command {
  const cmd = new Command('credentials')
    .description('Manage AI provider credentials');

  cmd.addCommand(
    new Command('check')
      .description('Verify AI provider API keys are configured')
      .action(() => {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        console.log(chalk.bold('API Key Status:\n'));
        console.log(`  Anthropic (ANTHROPIC_API_KEY): ${anthropicKey ? chalk.green('Set') : chalk.red('Not set')}`);
        console.log(`  OpenAI    (OPENAI_API_KEY):    ${openaiKey ? chalk.green('Set') : chalk.red('Not set')}`);
        console.log('');

        if (!anthropicKey && !openaiKey) {
          console.log(chalk.yellow('No API keys configured. Set at least one:'));
          console.log(chalk.gray('  export ANTHROPIC_API_KEY=sk-ant-...'));
          console.log(chalk.gray('  export OPENAI_API_KEY=sk-...'));
          process.exit(1);
        }
      }),
  );

  return cmd;
}
