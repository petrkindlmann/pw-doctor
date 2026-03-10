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
      const parsed = extractJson(text);
      if (parsed === null) {
        throw new AiAdapterError('No JSON found in AI response', 'anthropic', false);
      }
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

/**
 * Extract JSON from an AI response string.
 * Tries code blocks first, then falls back to finding the outermost valid JSON object.
 */
function extractJson(text: string): unknown | null {
  // 1. Try extracting from markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Code block didn't contain valid JSON, fall through
    }
  }

  // 2. Find brace-delimited substrings, starting from the first '{'
  //    and trying the widest span first (last '}') to prefer the outermost JSON object.
  for (let i = text.indexOf('{'); i >= 0 && i < text.length; i = text.indexOf('{', i + 1)) {
    for (let j = text.lastIndexOf('}'); j >= i; j = text.lastIndexOf('}', j - 1)) {
      try {
        return JSON.parse(text.slice(i, j + 1));
      } catch {
        // Not valid JSON at this range, try shrinking from the right
      }
    }
  }

  return null;
}
