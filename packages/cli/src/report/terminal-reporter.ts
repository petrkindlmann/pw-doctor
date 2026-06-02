// packages/cli/src/report/terminal-reporter.ts
import chalk from 'chalk';
import Table from 'cli-table3';
import type { SelectorInfo } from '@pw-doctor/shared';
import { scoreFragility } from '../core/fragility-scorer.js';

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

/**
 * Render a STATIC FRAGILITY report for the scanned selectors. `check` does not
 * run tests, so there is no "broken"/"healthy" status to show — only how
 * fragile each selector looks. Sorted worst-first so the riskiest selectors
 * are at the top.
 */
export function formatFragilityResults(selectors: SelectorInfo[]): string {
  const sorted = [...selectors].sort((a, b) => b.fragilityScore - a.fragilityScore);

  const table = new Table({
    head: ['Selector', 'Type', 'Fragility', 'File:Line', 'Top reason'],
    style: { head: ['cyan'] },
    colWidths: [30, 12, 12, 28, 26],
    wordWrap: true,
  });

  for (const s of sorted) {
    const selector =
      s.selectorValue.length > 28
        ? s.selectorValue.slice(0, 25) + '...'
        : s.selectorValue;

    // scoreFragility's first reason after the base is the strongest signal;
    // fall back to the base label when nothing else contributed.
    const reasons = scoreFragility(s).reasons;
    const topReason = reasons.length > 1 ? reasons[1] : (reasons[0] ?? '');

    table.push([
      selector,
      s.selectorType,
      fragilityColor(s.fragilityScore),
      shortenPath(s.filePath, s.line),
      topReason,
    ]);
  }

  const total = sorted.length;
  const fragile = sorted.filter((s) => s.fragilityScore >= 70).length;
  const moderate = sorted.filter((s) => s.fragilityScore >= 40 && s.fragilityScore < 70).length;
  const robust = total - fragile - moderate;

  return [
    '',
    table.toString(),
    '',
    `Summary: ${total} selectors scanned — ${fragile} fragile (>=70), ${moderate} moderate (40-69), ${robust} robust (<40)`,
  ].join('\n');
}
