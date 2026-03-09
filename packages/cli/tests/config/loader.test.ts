import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../../src/config/loader.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns default config when no config file exists', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.testDir).toBe('./tests');
    expect(config.ai.enabled).toBe(false);
    expect(config.repair.maxFiles).toBe(10);
  });

  it('loads JSON config and merges with defaults', async () => {
    const configPath = path.join(tmpDir, '.pw-doctor.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ testDir: './e2e', ai: { enabled: true } }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.testDir).toBe('./e2e');
    expect(config.ai.enabled).toBe(true);
    expect(config.repair.maxFiles).toBe(10); // still default
  });

  it('loads YAML config', async () => {
    const configPath = path.join(tmpDir, '.pw-doctor.config.yaml');
    fs.writeFileSync(configPath, 'testDir: ./specs\ntestMatch: "**/*.test.ts"\n');
    const config = await loadConfig(tmpDir);
    expect(config.testDir).toBe('./specs');
    expect(config.testMatch).toBe('**/*.test.ts');
  });

  it('rejects invalid config values', async () => {
    const configPath = path.join(tmpDir, '.pw-doctor.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ repair: { maxFiles: -1 } }),
    );
    await expect(loadConfig(tmpDir)).rejects.toThrow();
  });
});
