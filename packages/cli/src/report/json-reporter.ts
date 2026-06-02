// packages/cli/src/report/json-reporter.ts
import crypto from 'node:crypto';
import type { SelectorInfo, RunHistory, TriggerSource } from '@pw-doctor/shared';
import { SCHEMA_VERSION } from '@pw-doctor/shared';

/**
 * Config values the report records about the run. `check` resolves these from
 * the user's config and passes them in, so the report reflects reality instead
 * of hardcoded placeholders.
 */
export interface ReportConfig {
  aiEnabled: boolean;
  autoApplyThreshold: number;
}

/**
 * Build the run-history record for a `check` run. `check` does STATIC fragility
 * scoring only — it never runs the test suite — so it cannot observe whether a
 * selector is healthy or broken at runtime. The structural counters below are
 * therefore intentionally fixed:
 *
 *   - `healthy` / `broken`            — always 0 (no runtime validation here)
 *   - `repaired` / `verified` /
 *     `rolledBack`                    — always 0 (check never patches or verifies)
 *
 * Honest signal lives in `totalSelectors`, `skippedDynamic`, and the fragility
 * scores carried on each `SelectorInfo` (surfaced separately by the reporter).
 */
export function buildJsonReport(
  selectors: SelectorInfo[],
  trigger: TriggerSource,
  config: ReportConfig,
  timing?: { checkMs: number },
): RunHistory {
  const skippedDynamic = selectors.filter((s) => s.isDynamic).length;

  return {
    schemaVersion: SCHEMA_VERSION as 1,
    runId: `pwd_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    trigger,
    config: {
      aiEnabled: config.aiEnabled,
      autoApplyThreshold: config.autoApplyThreshold,
    },
    git: null, // populated by caller if in a git repo
    results: {
      totalSelectors: selectors.length,
      // healthy/broken require a test run; check does static scoring only.
      healthy: 0,
      broken: 0,
      // check never repairs, verifies, or rolls back — these are structural 0s.
      repaired: 0,
      verified: 0,
      rolledBack: 0,
      needsManualReview: 0,
      skippedDynamic,
    },
    repairs: [],
    timing: {
      totalMs: timing?.checkMs ?? 0,
      checkMs: timing?.checkMs ?? 0,
      repairMs: 0,
      verifyMs: 0,
    },
  };
}
