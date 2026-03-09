// packages/cli/src/report/terminal-reporter.ts
import chalk from 'chalk';
import Table from 'cli-table3';
import type { CheckResult } from '@pw-doctor/shared';

function statusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return chalk.green('HEALTHY');
    case 'broken':
      return chalk.red('BROKEN');
    case 'unknown':
      return chalk.yellow('UNKNOWN');
    default:
      return status;
  }
}

function fragilityColor(score: number): string {
  if (score >= 70) return chalk.red(`${score}/100`);
  if (score >= 40) return chalk.yellow(`${score}/100`);
  return chalk.green(`${score}/100`);
}

function shortenPath(filePath: string, line: number): string {
  const parts = filePath.split('/');
  const short = parts.slice(-2).join('/');
  return `${short}:${line}`;
}

export function formatCheckResults(results: CheckResult[]): string {
  const table = new Table({
    head: ['File', 'Selector', 'Status', 'Fragility'],
    style: { head: ['cyan'] },
    colWidths: [30, 35, 10, 12],
    wordWrap: true,
  });

  for (const r of results) {
    const selector =
      r.selector.selectorValue.length > 30
        ? r.selector.selectorValue.slice(0, 27) + '...'
        : r.selector.selectorValue;

    table.push([
      shortenPath(r.selector.filePath, r.selector.line),
      selector,
      statusColor(r.status),
      fragilityColor(r.selector.fragilityScore),
    ]);
  }

  const total = results.length;
  const healthy = results.filter((r) => r.status === 'healthy').length;
  const broken = results.filter((r) => r.status === 'broken').length;
  const unknown = results.filter((r) => r.status === 'unknown').length;
  const healthPct =
    total > 0 ? ((healthy / total) * 100).toFixed(1) : '100.0';

  const summary = [
    '',
    table.toString(),
    '',
    `Summary: ${total} selectors checked, ${broken} broken, ${unknown} unknown, ${healthy} healthy`,
    `Health: ${healthPct}%`,
  ].join('\n');

  return summary;
}
