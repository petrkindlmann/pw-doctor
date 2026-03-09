import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Mock heavy dependencies to avoid actually scanning files
vi.mock('../../src/utils/file-finder.js', () => ({
  findTestFiles: vi.fn(() => []),
}));
vi.mock('../../src/core/selector-extractor.js', () => ({
  extractSelectors: vi.fn(() => []),
}));
vi.mock('../../src/core/fragility-scorer.js', () => ({
  enrichWithFragility: vi.fn((s: unknown[]) => s),
}));

import { initCommand } from '../../src/commands/init.js';

describe('init command', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Create a real temp dir for each test
    tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? '.', 'init-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();

    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getAllOutput(): string {
    const logOutput = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const warnOutput = consoleWarnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const errorOutput = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    return [logOutput, warnOutput, errorOutput].join('\n');
  }

  function setupPlaywrightProject(configName = 'playwright.config.ts'): void {
    fs.writeFileSync(path.join(tmpDir, configName), 'export default {};');
    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
  }

  it('suggests reporter when playwright.config.ts exists', async () => {
    setupPlaywrightProject('playwright.config.ts');
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const cmd = initCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = getAllOutput();
    expect(output).toContain('To enable DOM capture for AI-powered repair');
    expect(output).toContain("reporter: [['default'], ['pw-doctor/reporter']]");
    expect(output).toContain("import { test, expect } from 'pw-doctor/reporter'");
  });

  it('suggests reporter when playwright.config.js exists', async () => {
    setupPlaywrightProject('playwright.config.js');
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const cmd = initCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = getAllOutput();
    expect(output).toContain('To enable DOM capture for AI-powered repair');
    expect(output).toContain("reporter: [['default'], ['pw-doctor/reporter']]");
  });

  it('sets ai.enabled to true when ANTHROPIC_API_KEY is detected', async () => {
    setupPlaywrightProject();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    delete process.env.OPENAI_API_KEY;

    const cmd = initCommand();
    await cmd.parseAsync([], { from: 'user' });

    // Read the generated config file
    const configPath = path.join(tmpDir, '.pw-doctor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.ai.enabled).toBe(true);

    const output = getAllOutput();
    expect(output).toContain('AI repair enabled (API key detected)');
  });

  it('sets ai.enabled to true when OPENAI_API_KEY is detected', async () => {
    setupPlaywrightProject();
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const cmd = initCommand();
    await cmd.parseAsync([], { from: 'user' });

    const configPath = path.join(tmpDir, '.pw-doctor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.ai.enabled).toBe(true);

    const output = getAllOutput();
    expect(output).toContain('AI repair enabled (API key detected)');
  });

  it('sets ai.enabled to false and shows note when no env var detected', async () => {
    setupPlaywrightProject();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const cmd = initCommand();
    await cmd.parseAsync([], { from: 'user' });

    const configPath = path.join(tmpDir, '.pw-doctor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.ai.enabled).toBe(false);

    const output = getAllOutput();
    expect(output).toContain(
      'AI repair is available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable.',
    );
  });

  it('does not show AI note when key is present', async () => {
    setupPlaywrightProject();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    delete process.env.OPENAI_API_KEY;

    const cmd = initCommand();
    await cmd.parseAsync([], { from: 'user' });

    const output = getAllOutput();
    expect(output).not.toContain(
      'AI repair is available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable.',
    );
  });
});
