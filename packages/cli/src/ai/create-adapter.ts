import type { AiRepairAdapter } from './ai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { OpenAiAdapter } from './openai-adapter.js';

export interface CreateAdapterOptions {
  provider: 'anthropic' | 'openai';
  model?: string;
  maxTokens?: number;
}

export function createAiAdapter(options: CreateAdapterOptions): AiRepairAdapter {
  const apiKey = options.provider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      `Missing ${options.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} environment variable. ` +
      'Run `pw-doctor credentials check` for help.',
    );
  }

  if (options.provider === 'anthropic') {
    return new AnthropicAdapter({ apiKey, model: options.model, maxTokens: options.maxTokens });
  }
  return new OpenAiAdapter({ apiKey, model: options.model, maxTokens: options.maxTokens });
}
