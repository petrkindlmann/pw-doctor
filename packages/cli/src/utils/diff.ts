import chalk from 'chalk';

/**
 * A minimal, dependency-free unified-diff renderer for the dry-run preview.
 * pw-doctor only ever changes a single selector call, so the diff is tiny — a
 * full Myers diff would be overkill. We emit a focused hunk around the changed
 * line(s): the line-level diff of `before` vs `after`, restricted to the region
 * that actually changed plus a few lines of context.
 */
export interface DiffOptions {
  /** Display path shown in the `---`/`+++` headers. */
  filePath: string;
  /** Lines of unchanged context around the change. */
  context?: number;
  /** Colorize output (default true). */
  color?: boolean;
}

export function renderUnifiedDiff(
  before: string,
  after: string,
  options: DiffOptions,
): string {
  const ctx = options.context ?? 2;
  const color = options.color ?? true;
  const a = before.split('\n');
  const b = after.split('\n');

  // Find the first and last differing line indices.
  let firstDiff = 0;
  const maxLen = Math.max(a.length, b.length);
  while (firstDiff < maxLen && a[firstDiff] === b[firstDiff]) firstDiff++;

  if (firstDiff === maxLen) {
    // No textual change.
    return `${header(options.filePath, color)}\n (no changes)`;
  }

  // Walk from the end to find the last differing line, in each file separately.
  let aEnd = a.length - 1;
  let bEnd = b.length - 1;
  while (aEnd >= firstDiff && bEnd >= firstDiff && a[aEnd] === b[bEnd]) {
    aEnd--;
    bEnd--;
  }

  const aStart = Math.max(0, firstDiff - ctx);
  const bStart = Math.max(0, firstDiff - ctx);
  const aStop = Math.min(a.length - 1, aEnd + ctx);
  const bStop = Math.min(b.length - 1, bEnd + ctx);

  const lines: string[] = [header(options.filePath, color)];
  const hunk = `@@ -${aStart + 1},${aStop - aStart + 1} +${bStart + 1},${bStop - bStart + 1} @@`;
  lines.push(color ? chalk.cyan(hunk) : hunk);

  // Leading context (identical in both).
  for (let i = aStart; i < firstDiff; i++) lines.push(` ${a[i]}`);
  // Removed lines.
  for (let i = firstDiff; i <= aEnd; i++) {
    const l = `-${a[i]}`;
    lines.push(color ? chalk.red(l) : l);
  }
  // Added lines.
  for (let i = firstDiff; i <= bEnd; i++) {
    const l = `+${b[i]}`;
    lines.push(color ? chalk.green(l) : l);
  }
  // Trailing context.
  for (let i = aEnd + 1; i <= aStop; i++) lines.push(` ${a[i]}`);

  return lines.join('\n');
}

function header(filePath: string, color: boolean): string {
  const minus = `--- a/${filePath}`;
  const plus = `+++ b/${filePath}`;
  return color ? `${chalk.dim(minus)}\n${chalk.dim(plus)}` : `${minus}\n${plus}`;
}
