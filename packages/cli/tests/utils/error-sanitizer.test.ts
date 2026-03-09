import { describe, it, expect } from 'vitest';
import { sanitizeError } from '../../src/utils/error-sanitizer.js';

describe('sanitizeError', () => {
  it('strips API key patterns', () => {
    const err = new Error('Request failed with key sk-ant-abc123xyz');
    const safe = sanitizeError(err);
    expect(safe.message).not.toContain('sk-ant-abc123xyz');
    expect(safe.message).toContain('[REDACTED]');
  });

  it('strips Bearer tokens', () => {
    const err = new Error('Auth: Bearer eyJhbGciOiJIUzI1NiJ9.test');
    const safe = sanitizeError(err);
    expect(safe.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('strips pwd_ prefixed tokens', () => {
    const err = new Error('Invalid key: pwd_abc123def456');
    const safe = sanitizeError(err);
    expect(safe.message).not.toContain('pwd_abc123def456');
  });

  it('preserves non-sensitive error messages', () => {
    const err = new Error('File not found: test.spec.ts');
    const safe = sanitizeError(err);
    expect(safe.message).toBe('File not found: test.spec.ts');
  });

  it('handles non-Error objects', () => {
    const safe = sanitizeError('string error');
    expect(safe.message).toBe('string error');
  });
});
