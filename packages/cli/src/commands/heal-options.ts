import { Command, InvalidArgumentError } from 'commander';

/**
 * Parse `--min-confidence` as an integer in 0..100. Commander otherwise hands
 * the raw string to the action, where `parseInt('0')` is falsy and gets
 * silently swapped for the config default, and non-integers like `90.5` are
 * quietly truncated. We reject both up front with an actionable message.
 */
export function parseMinConfidence(raw: string): string {
  if (!/^\d+$/.test(raw.trim())) {
    throw new InvalidArgumentError('must be an integer between 0 and 100.');
  }
  const n = Number(raw);
  if (n < 0 || n > 100) {
    throw new InvalidArgumentError('must be between 0 and 100.');
  }
  // Return the normalized string — heal's HealOptions.minConfidence is a string
  // and it re-parses with parseInt, so we keep the existing contract.
  return String(n);
}

/**
 * Attach the heal/watch shared option surface to a command. Single source of
 * truth so `heal` and `watch` cannot drift apart.
 *
 * NOTE: heal.ts still hand-declares these options; its owner should switch
 * `healCommand()` to call `addHealOptions(...)` and add the heal-only
 * `--interactive` / `--watch` flags afterward.
 */
export function addHealOptions(cmd: Command): Command {
  return cmd
    // Preview is the default whenever --apply is absent. --dry-run (no default)
    // is an explicit override that forces preview even if --apply is given.
    .option('--dry-run', 'Force preview even if --apply is given (preview is the default without --apply)')
    .option('--apply', 'Apply fixes meeting confidence threshold')
    .option('--min-confidence <n>', 'Minimum confidence to apply (0-100)', parseMinConfidence, '85')
    .option('--max-files <n>', 'Maximum files to process')
    .option('--ci', 'CI mode: JSON output, no interactive prompts')
    .option('--no-ai', 'Disable AI repair even if configured')
    .option('--preview-ai-payload', 'Show AI payload without sending');
}
