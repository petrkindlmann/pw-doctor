import crypto from 'node:crypto';

export function hashString(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}
