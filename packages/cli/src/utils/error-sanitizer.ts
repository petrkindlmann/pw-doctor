
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
