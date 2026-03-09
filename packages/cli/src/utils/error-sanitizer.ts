
import path from 'node:path';
import { REDACT_SENSITIVE_PATTERNS } from '@pw-doctor/shared';

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys with known prefixes
  { pattern: /\bsk-ant-[A-Za-z0-9_-]+/g, replacement: '[REDACTED]' },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replacement: '[REDACTED]' },
  { pattern: /\bpwd_[A-Za-z0-9_-]+/g, replacement: '[REDACTED]' },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer [REDACTED]' },
  // Generic long hex/base64 tokens (40+ chars)
  { pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, replacement: '[REDACTED]' },
];

export interface SafeError {
  message: string;
  code?: string;
}

export function sanitizeError(error: unknown): SafeError {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = 'Unknown error';
  }

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    message = message.replace(pattern, replacement);
  }

  return { message };
}

export function sanitizeForLog(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Creates fresh RegExp copies from the shared patterns to avoid stateful lastIndex issues
 * with the global /g flag on module-level constants.
 */
function freshSharedPatterns(): RegExp[] {
  return REDACT_SENSITIVE_PATTERNS.map(
    (p) => new RegExp(p.source, p.flags),
  );
}

/**
 * Regex to detect absolute file paths:
 * - Unix-style: /some/path/to/file (at least two segments)
 * - Windows-style: C:\some\path
 */
const ABSOLUTE_PATH_PATTERN = /(?:\/[^\s"',/]+(?:\/[^\s"',/]+)+)|(?:[A-Z]:\\[^\s"',]+)/g;

/**
 * Sanitizes CLI output by applying shared sensitive patterns and
 * stripping absolute file paths outside the project root.
 */
export function sanitizeOutput(text: string, projectRoot?: string): string {
  let result = text;

  // Apply REDACT_SENSITIVE_PATTERNS (fresh copies to avoid lastIndex issues)
  const patterns = freshSharedPatterns();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }

  // Strip absolute file paths outside the project root
  const root = projectRoot ?? process.cwd();
  const rootWithSlash = root.endsWith('/') ? root : root + '/';
  result = result.replace(ABSOLUTE_PATH_PATTERN, (match) => {
    // If the path starts with the project root, make it relative
    if (match === root || match.startsWith(rootWithSlash)) {
      return path.relative(root, match) || '.';
    }
    // Otherwise replace entirely with a relative placeholder
    const basename = path.basename(match);
    return basename ? `./${basename}` : '[PATH]';
  });

  return result;
}
