import readline from 'node:readline';
import chalk from 'chalk';
import type { RankedCandidate } from '../repair/candidate-ranker.js';

export type InteractiveChoice =
  | { action: 'apply'; candidate: RankedCandidate }
  | { action: 'edit'; selector: string; method: string }
  | { action: 'skip' }
  | { action: 'quit' };

export interface PromptFailure {
  file: string;
  line: number;
  selector: string;
}

function createReadlineInterface(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): readline.Interface {
  return readline.createInterface({ input, output });
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function formatCandidate(index: number, ranked: RankedCandidate): string {
  const c = ranked.candidate;
  const pct = Math.round(ranked.finalScore);
  return `    ${index}. ${c.method}('${c.selector}')  [${pct}% confidence, ${c.strategy}]`;
}

export function assertTTY(input: NodeJS.ReadableStream = process.stdin): void {
  const stream = input as NodeJS.ReadStream;
  if (!stream.isTTY) {
    throw new Error('Interactive mode requires a TTY — stdin is not a terminal.');
  }
}

export async function promptForCandidate(
  failure: PromptFailure,
  candidates: RankedCandidate[],
  options?: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream },
): Promise<InteractiveChoice> {
  const input = options?.input ?? process.stdin;
  const output = options?.output ?? process.stdout;

  const rl = createReadlineInterface(input, output);

  try {
    // Display failure header
    const write = (text: string) => output.write(text + '\n');

    write('');
    write(`  ${chalk.cyan(`${failure.file}:${failure.line}`)} ${chalk.gray('\u2014')} ${chalk.red(failure.selector)}`);
    write('');
    write(chalk.bold('  Candidates:'));

    for (let i = 0; i < candidates.length; i++) {
      write(formatCandidate(i + 1, candidates[i]));
    }

    write('');
    write(`  ${chalk.gray(`[1-${candidates.length}] Apply candidate / [e] Edit manually / [s] Skip / [q] Quit all`)}`);

    // Prompt loop
    while (true) {
      const answer = await askQuestion(rl, '  > ');

      // Check numeric selection
      const num = parseInt(answer, 10);
      if (!isNaN(num) && num >= 1 && num <= candidates.length) {
        return { action: 'apply', candidate: candidates[num - 1] };
      }

      if (answer.toLowerCase() === 's') {
        return { action: 'skip' };
      }

      if (answer.toLowerCase() === 'q') {
        return { action: 'quit' };
      }

      if (answer.toLowerCase() === 'e') {
        const method = await askQuestion(rl, '  Enter method (getByRole/getByTestId/locator/etc): ');
        const selector = await askQuestion(rl, '  Enter selector: ');
        return { action: 'edit', selector, method };
      }

      write(chalk.red(`  Invalid input. Enter 1-${candidates.length}, e, s, or q.`));
    }
  } finally {
    rl.close();
  }
}
