import OpenAI from 'openai';
import type { AiRepairInput, AiRepairResponse } from '@pw-doctor/shared';
import type { AiRepairAdapter } from './ai-adapter.js';
import { AiAdapterError } from './ai-adapter.js';
import { buildRepairPrompt } from './prompt-builder.js';

export interface OpenAiAdapterOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class OpenAiAdapter implements AiRepairAdapter {
  readonly provider = 'openai' as const;
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: OpenAiAdapterOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'gpt-4o';
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async suggestRepair(input: AiRepairInput): Promise<AiRepairResponse> {
    const { systemPrompt, userMessage } = buildRepairPrompt(input);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0]?.message?.content ?? '';
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed.candidates)) {
        throw new AiAdapterError('AI response missing candidates array', 'openai', false);
      }

      return {
        candidates: parsed.candidates.map((c: Record<string, unknown>) => ({
          selector: String(c.selector),
          method: String(c.method),
          confidence: Number(c.confidence),
          reasoning: String(c.reasoning),
        })),
        tokensUsed: response.usage?.total_tokens ?? 0,
        provider: 'openai',
      };
    } catch (error) {
      if (error instanceof AiAdapterError) throw error;
      const isRetryable = error instanceof OpenAI.APIError && error.status >= 500;
      throw new AiAdapterError(
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
        'openai',
        isRetryable,
      );
    }
  }
}
