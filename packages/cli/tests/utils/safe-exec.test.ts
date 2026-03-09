import { describe, it, expect } from 'vitest';
import { safeExec } from '../../src/utils/safe-exec.js';

describe('safeExec', () => {
  it('executes a command with array arguments', async () => {
    const result = await safeExec('echo', ['hello']);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns stderr on failure', async () => {
    const result = await safeExec('ls', ['--nonexistent-flag']);
    expect(result.exitCode).not.toBe(0);
  });

  it('does not pass ANTHROPIC_API_KEY to child processes', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-secret';
    const result = await safeExec('env', []);
    expect(result.stdout).not.toContain('ANTHROPIC_API_KEY');
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('does not pass PW_DOCTOR_API_KEY to child processes', async () => {
    process.env.PW_DOCTOR_API_KEY = 'pwd_test';
    const result = await safeExec('env', []);
    expect(result.stdout).not.toContain('PW_DOCTOR_API_KEY');
    delete process.env.PW_DOCTOR_API_KEY;
  });
});
