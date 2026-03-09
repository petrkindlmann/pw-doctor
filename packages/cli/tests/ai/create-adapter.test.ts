import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock both SDK modules before importing the factory
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    constructor(_opts: Record<string, unknown>) {
      // no-op
    }
  }
  return { default: MockAnthropic };
});

vi.mock('openai', () => {
  class MockOpenAI {
    constructor(_opts: Record<string, unknown>) {
      // no-op
    }
  }
  return { default: MockOpenAI };
});

import { createAiAdapter } from '../../src/ai/create-adapter.js';
import { AnthropicAdapter } from '../../src/ai/anthropic-adapter.js';
import { OpenAiAdapter } from '../../src/ai/openai-adapter.js';

describe('createAiAdapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns AnthropicAdapter when provider is "anthropic" and env var is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    const adapter = createAiAdapter({ provider: 'anthropic' });

    expect(adapter).toBeInstanceOf(AnthropicAdapter);
    expect(adapter.provider).toBe('anthropic');
  });

  it('returns OpenAiAdapter when provider is "openai" and env var is set', () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test-key';

    const adapter = createAiAdapter({ provider: 'openai' });

    expect(adapter).toBeInstanceOf(OpenAiAdapter);
    expect(adapter.provider).toBe('openai');
  });

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => createAiAdapter({ provider: 'anthropic' })).toThrow(
      'Missing ANTHROPIC_API_KEY environment variable',
    );
    expect(() => createAiAdapter({ provider: 'anthropic' })).toThrow(
      'pw-doctor credentials check',
    );
  });

  it('throws when OPENAI_API_KEY is missing', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => createAiAdapter({ provider: 'openai' })).toThrow(
      'Missing OPENAI_API_KEY environment variable',
    );
    expect(() => createAiAdapter({ provider: 'openai' })).toThrow(
      'pw-doctor credentials check',
    );
  });

  it('passes model and maxTokens options through', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    const adapter = createAiAdapter({
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      maxTokens: 8192,
    });

    expect(adapter).toBeInstanceOf(AnthropicAdapter);
  });
});
