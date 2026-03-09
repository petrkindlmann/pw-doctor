import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface AiAuditEntry {
  timestamp: string; // ISO 8601
  failedSelector: string;
  failedMethod: string;
  payloadSizeBytes: number;
  payloadHash: string; // SHA-256 hex of the DOM payload sent
  responseCandidateCount: number;
  responseTokensUsed: number;
  provider: string;
  model: string;
  redactionPreset: string;
  durationMs: number;
}

const AUDIT_DIR = '.pw-doctor/audit';
const AUDIT_FILE = 'ai-calls.jsonl';

export function hashPayload(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function logAiCall(cwd: string, entry: AiAuditEntry): void {
  try {
    const auditDir = path.join(cwd, AUDIT_DIR);
    fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });

    const auditFile = path.join(auditDir, AUDIT_FILE);
    const line = JSON.stringify(entry) + '\n';

    fs.appendFileSync(auditFile, line, { mode: 0o600 });
  } catch {
    // Audit logging is non-fatal — silently ignore errors
  }
}
