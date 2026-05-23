import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PW_DOCTOR_DIR,
  RunHistorySchema,
  type RunHistory,
  type RepairRecord,
  type RunResults,
} from '@pw-doctor/shared';

export interface WriteRunHistoryInput {
  cwd: string;
  runId: string;
  trigger: 'cli' | 'ci' | 'watch';
  startedAt: number;
  config: {
    aiEnabled: boolean;
    autoApplyThreshold: number;
  };
  results: RunResults;
  repairs: RepairRecord[];
  timing: {
    checkMs: number;
    repairMs: number;
    verifyMs: number;
  };
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim();
}

function readGitMeta(cwd: string): RunHistory['git'] {
  try {
    const commit = runGit(cwd, ['rev-parse', 'HEAD']);
    const branch = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const status = runGit(cwd, ['status', '--porcelain']);
    return { commit, branch, dirty: status.length > 0 };
  } catch {
    return null;
  }
}

/**
 * Persist a heal/check run to `.pw-doctor/history/runs/<timestamp>.json`.
 * Validates against `RunHistorySchema` before writing — refuses to write
 * a malformed record so `report` can rely on every file being parseable.
 */
export function writeRunHistory(input: WriteRunHistoryInput): { path: string } | { skipped: string } {
  const totalMs = Date.now() - input.startedAt;

  const record: RunHistory = {
    schemaVersion: 1,
    runId: input.runId,
    timestamp: new Date().toISOString(),
    trigger: input.trigger,
    config: input.config,
    git: readGitMeta(input.cwd),
    results: input.results,
    repairs: input.repairs,
    timing: {
      totalMs,
      checkMs: input.timing.checkMs,
      repairMs: input.timing.repairMs,
      verifyMs: input.timing.verifyMs,
    },
  };

  const parsed = RunHistorySchema.safeParse(record);
  if (!parsed.success) {
    return { skipped: `schema validation failed: ${parsed.error.message}` };
  }

  const historyDir = path.resolve(input.cwd, PW_DOCTOR_DIR, 'history', 'runs');
  fs.mkdirSync(historyDir, { recursive: true, mode: 0o700 });

  const stamp = record.timestamp.replace(/[:.]/g, '-');
  const filePath = path.join(historyDir, `${stamp}-${input.runId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), { mode: 0o600 });

  return { path: filePath };
}
