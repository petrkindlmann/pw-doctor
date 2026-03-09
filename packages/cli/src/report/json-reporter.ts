// packages/cli/src/report/json-reporter.ts
import crypto from 'node:crypto';
import type { CheckResult, RunHistory, TriggerSource } from '@pw-doctor/shared';
import { SCHEMA_VERSION } from '@pw-doctor/shared';

export function buildJsonReport(
  results: CheckResult[],
  trigger: TriggerSource,
  timing?: { checkMs: number },
): RunHistory {
  const healthy = results.filter((r) => r.status === 'healthy').length;
  const broken = results.filter((r) => r.status === 'broken').length;
  const skippedDynamic = results.filter(
    (r) => r.selector.isDynamic,
  ).length;

  return {
    schemaVersion: SCHEMA_VERSION as 1,
    runId: `pwd_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    trigger,
    config: {
      aiEnabled: false,
      autoApplyThreshold: 85,
    },
    git: null, // populated by caller if in a git repo
    results: {
      totalSelectors: results.length,
      healthy,
      broken,
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
