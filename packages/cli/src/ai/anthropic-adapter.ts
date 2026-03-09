import Anthropic from '@anthropic-ai/sdk';
import type { AiRepairInput, AiRepairResponse } from '@pw-doctor/shared';
import type { AiRepairAdapter } from './ai-adapter.js';
import { AiAdapterError } from './ai-adapter.js';
import { buildRepairPrompt } from './prompt-builder.js';
import { AiResponseSchema } from './ai-response-schema.js';

export interface AnthropicAdapterOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicAdapter implements AiRepairAdapter {
  readonly provider = 'anthropic' as const;
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(options: AnthropicAdapterOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? 'claude-sonnet-4-20250514';
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async suggestRepair(input: AiRepairInput): Promise<AiRepairResponse> {
    const { systemPrompt, userMessage } = buildRepairPrompt(input);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      // Parse JSON from response (may be wrapped in markdown code block)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new AiAdapterError('No JSON found in AI response', 'anthropic', false);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = AiResponseSchema.parse(parsed);

      return {
        candidates: validated.candidates.map((c) => ({
          selector: c.selector,
          method: c.method,
          confidence: c.confidence,
          reasoning: c.reasoning,
        })),
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        provider: 'anthropic',
      };
    } catch (error) {
      if (error instanceof AiAdapterError) throw error;
      const isRetryable = error instanceof Anthropic.APIError && error.status >= 500;
      throw new AiAdapterError(
        `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic',
        isRetryable,
      );
    }
  }
}
