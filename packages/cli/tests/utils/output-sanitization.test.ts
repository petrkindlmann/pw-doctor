import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, setLogLevel, setCIMode } from '../../src/utils/logger.js';

describe('output-sanitization', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setLogLevel('debug');
    setCIMode(false);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setLogLevel('info');
    setCIMode(false);
  });

  it('logger.error sanitizes email addresses', () => {
    logger.error('Contact admin@example.com for help');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('admin@example.com');
    expect(output).toContain('[REDACTED]');
  });

  it('logger.warn sanitizes JWT tokens', () => {
    logger.warn('Token: eyJhbGciOiJIUzI1NiIsInR5.eyJzdWIiOiIxMjM0NTY3ODkw');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = warnSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('eyJhbGciOiJIUzI1NiIsInR5');
    expect(output).toContain('[REDACTED]');
  });

  it('logger.info sanitizes API keys (sk-...)', () => {
    logger.info('Using key sk-abc12345678901234567890');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('sk-abc12345678901234567890');
    expect(output).toContain('[REDACTED]');
  });

  it('non-sensitive output passes through unchanged', () => {
    logger.info('All 5 tests passed successfully');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toBe('All 5 tests passed successfully');
  });

  it('sanitization works in CI mode for logger.info', () => {
    setCIMode(true);
    logger.info('User: admin@company.org triggered build');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('admin@company.org');
    expect(output).toContain('[REDACTED]');
  });

  it('sanitization works in non-CI mode for logger.debug', () => {
    setCIMode(false);
    logger.debug('Debug key: sk-ant-longapikey1234567890abcdef');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    const output = debugSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('sk-ant-longapikey1234567890abcdef');
    expect(output).toContain('[REDACTED]');
  });

  it('logger.debug suppresses output in CI mode', () => {
    setCIMode(true);
    logger.debug('some debug with user@test.com');
    // In CI mode, debug does not call console.debug
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('logger.success sanitizes UUIDs', () => {
    logger.success('Created resource 550e8400-e29b-41d4-a716-446655440000');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(output).toContain('[REDACTED]');
  });

  it('logger.info sanitizes Stripe keys', () => {
    logger.info('Stripe key: pk_live_abcdef1234567890');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('pk_live_abcdef1234567890');
    expect(output).toContain('[REDACTED]');
  });

  it('logger.error sanitizes multiple sensitive values in one message', () => {
    logger.error(
      'User admin@test.com used key sk-ant-longapikey1234567890abc with ID 550e8400-e29b-41d4-a716-446655440000',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('admin@test.com');
    expect(output).not.toContain('sk-ant-longapikey1234567890abc');
    expect(output).not.toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  it('logger.warn sanitizes pwd_ prefixed tokens', () => {
    logger.warn('Invalid token: pwd_secrettoken123456');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const output = warnSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('pwd_secrettoken123456');
    expect(output).toContain('[REDACTED]');
  });
});
