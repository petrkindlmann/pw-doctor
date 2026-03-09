import fs from 'node:fs';
import path from 'node:path';
import { safeExec } from '../utils/safe-exec.js';
import { PW_DOCTOR_DIR } from '@pw-doctor/shared';

export function createBackup(
  projectRoot: string,
  filePath: string,
  runId: string,
): void {
  const backupDir = path.join(projectRoot, PW_DOCTOR_DIR, 'backups', runId);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  const relativePath = path.relative(projectRoot, filePath);
  const backupName = relativePath.replace(/[/\\]/g, '__');
  const backupPath = path.join(backupDir, backupName);

  fs.copyFileSync(filePath, backupPath);
  fs.chmodSync(backupPath, 0o600);
}

export function restoreBackup(
  projectRoot: string,
  filePath: string,
  runId: string,
): boolean {
  const backupDir = path.join(projectRoot, PW_DOCTOR_DIR, 'backups', runId);
  const relativePath = path.relative(projectRoot, filePath);
  const backupName = relativePath.replace(/[/\\]/g, '__');
  const backupPath = path.join(backupDir, backupName);

  if (!fs.existsSync(backupPath)) return false;

  fs.copyFileSync(backupPath, filePath);
  return true;
}

export async function rollbackViaGit(
  projectRoot: string,
  filePath: string,
): Promise<boolean> {
  const relativePath = path.relative(projectRoot, filePath);
  const result = await safeExec('git', ['checkout', '--', relativePath], {
    cwd: projectRoot,
  });
  return result.exitCode === 0;
}

export async function rollback(
  projectRoot: string,
  filePath: string,
  runId: string,
): Promise<boolean> {
  // Try git first (atomic, reliable)
  const gitOk = await rollbackViaGit(projectRoot, filePath);
  if (gitOk) return true;

  // Fall back to backup restore
  return restoreBackup(projectRoot, filePath, runId);
}
