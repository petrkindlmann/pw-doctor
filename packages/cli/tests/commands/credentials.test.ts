import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { credentialsCommand } from '../../src/commands/credentials.js';

describe('credentials check command', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('shows "Set" when ANTHROPIC_API_KEY is present', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    delete process.env.OPENAI_API_KEY;

    const cmd = credentialsCommand();
    await cmd.parseAsync(['check'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Set');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('shows "Set" when OPENAI_API_KEY is present', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';

    const cmd = credentialsCommand();
    await cmd.parseAsync(['check'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Set');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('shows "Not set" when env vars are missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const cmd = credentialsCommand();
    await cmd.parseAsync(['check'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Not set');
  });

  it('exits with TOOL_ERROR (2) when no keys are configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const cmd = credentialsCommand();
    await cmd.parseAsync(['check'], { from: 'user' });

    // A missing key is a config/tool problem, not "broken selectors found".
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('exits with code 0 when at least one key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    delete process.env.OPENAI_API_KEY;

    const cmd = credentialsCommand();
    await cmd.parseAsync(['check'], { from: 'user' });

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
