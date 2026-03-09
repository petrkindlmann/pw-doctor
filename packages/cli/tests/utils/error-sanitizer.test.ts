import { describe, it, expect } from 'vitest';
import { sanitizeError, sanitizeOutput } from '../../src/utils/error-sanitizer.js';

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

describe('sanitizeOutput', () => {
  it('replaces email patterns', () => {
    const input = 'Contact admin@example.com for support';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('admin@example.com');
    expect(result).toContain('[REDACTED]');
  });

  it('replaces API key patterns', () => {
    const input = 'Using key sk-abc12345678901234567890';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('sk-abc12345678901234567890');
    expect(result).toContain('[REDACTED]');
  });

  it('replaces JWT patterns', () => {
    const input = 'Token: eyJhbGciOiJIUzI1NiIsInR5.eyJzdWIiOiIxMjM0NTY3ODkw';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5');
    expect(result).toContain('[REDACTED]');
  });

  it('replaces Stripe key patterns', () => {
    const input = 'Stripe: pk_live_abcdef1234567890';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('pk_live_abcdef1234567890');
    expect(result).toContain('[REDACTED]');
  });

  it('replaces UUID patterns', () => {
    const input = 'ID: 550e8400-e29b-41d4-a716-446655440000';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(result).toContain('[REDACTED]');
  });

  it('strips absolute paths outside project root', () => {
    const input = 'Error in /Users/john/secret-project/src/index.ts';
    const result = sanitizeOutput(input, '/my/project');
    expect(result).not.toContain('/Users/john/secret-project');
    expect(result).toContain('index.ts');
  });

  it('converts absolute paths within project root to relative', () => {
    const root = '/my/project';
    const input = `File: /my/project/src/utils/helper.ts`;
    const result = sanitizeOutput(input, root);
    expect(result).not.toContain('/my/project/src');
    expect(result).toContain('src/utils/helper.ts');
  });

  it('preserves non-sensitive text', () => {
    const input = 'All 5 tests passed successfully';
    const result = sanitizeOutput(input);
    expect(result).toBe('All 5 tests passed successfully');
  });

  it('handles multiple sensitive patterns in one string', () => {
    const input = 'User admin@test.com used key sk-ant-longapikey1234567890abc with ID 550e8400-e29b-41d4-a716-446655440000';
    const result = sanitizeOutput(input);
    expect(result).not.toContain('admin@test.com');
    expect(result).not.toContain('sk-ant-longapikey1234567890abc');
    expect(result).not.toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  it('handles sanitizing JSON strings correctly', () => {
    const data = {
      status: 'broken_found',
      failures: 2,
      fixable: 1,
      verified: 0,
      rolledBack: 0,
      repairs: [
        {
          filePath: 'tests/login.spec.ts',
          reasoning: 'Contact admin@example.com for details',
        },
      ],
      aiTokensUsed: 500,
    };
    const raw = JSON.stringify(data, null, 2);
    const result = sanitizeOutput(raw);
    // Should still be valid JSON after sanitization
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('broken_found');
    expect(parsed.failures).toBe(2);
    expect(parsed.repairs[0].reasoning).toContain('[REDACTED]');
    expect(parsed.repairs[0].reasoning).not.toContain('admin@example.com');
  });
});
