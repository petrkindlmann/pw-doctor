import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiRepairInput } from '@pw-doctor/shared';

// Mock the Anthropic SDK before importing the adapter
vi.mock('@anthropic-ai/sdk', () => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, _body: unknown, message: string) {
      super(`${status} ${message}`);
      this.status = status;
      this.name = 'APIError';
    }
  }

  const mockCreate = vi.fn();

  class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: Record<string, unknown>) {
      // no-op
    }
  }

  // Attach APIError as a static property on the class (matches SDK structure)
  (MockAnthropic as unknown as Record<string, unknown>).APIError = MockAPIError;

  return {
    default: MockAnthropic,
    APIError: MockAPIError,
  };
});

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicAdapter } from '../../src/ai/anthropic-adapter.js';
import { AiAdapterError } from '../../src/ai/ai-adapter.js';

const SAMPLE_INPUT: AiRepairInput = {
  failedSelector: '.btn-primary',
  failedMethod: 'locator',
  errorMessage: 'locator.click: Timeout 30000ms exceeded.',
  filePath: 'tests/login.spec.ts',
  line: 42,
  redactedHtml: '<button data-testid="login-submit" role="button">Sign In</button>',
  contextCode: "await page.locator('.btn-primary').click();",
};

const VALID_JSON_RESPONSE = JSON.stringify({
  candidates: [
    {
      selector: 'login-submit',
      method: 'getByTestId',
      confidence: 95,
      reasoning: 'The button has a stable data-testid attribute.',
    },
    {
      selector: 'Sign In',
      method: 'getByRole',
      confidence: 80,
      reasoning: 'The button has a role and visible text.',
    },
  ],
});

function makeApiResponse(text: string, inputTokens = 150, outputTokens = 100) {
  return {
    content: [{ type: 'text' as const, text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function getMockCreate(): ReturnType<typeof vi.fn> {
  const client = new Anthropic({ apiKey: 'test-key' });
  return (client as unknown as { messages: { create: ReturnType<typeof vi.fn> } }).messages
    .create;
}

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    mockCreate = getMockCreate();
  });

  it('has provider set to "anthropic"', () => {
    expect(adapter.provider).toBe('anthropic');
  });

  it('parses a successful JSON response correctly', async () => {
    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE));

    const result = await adapter.suggestRepair(SAMPLE_INPUT);

    expect(result.provider).toBe('anthropic');
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toEqual({
      selector: 'login-submit',
      method: 'getByTestId',
      confidence: 95,
      reasoning: 'The button has a stable data-testid attribute.',
    });
    expect(result.candidates[1]).toEqual({
      selector: 'Sign In',
      method: 'getByRole',
      confidence: 80,
      reasoning: 'The button has a role and visible text.',
    });
  });

  it('extracts JSON wrapped in markdown code blocks', async () => {
    const wrappedResponse = '```json\n' + VALID_JSON_RESPONSE + '\n```';
    mockCreate.mockResolvedValueOnce(makeApiResponse(wrappedResponse));

    const result = await adapter.suggestRepair(SAMPLE_INPUT);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].selector).toBe('login-submit');
  });

  it('throws AiAdapterError with isRetryable=false for non-JSON response', async () => {
    mockCreate.mockResolvedValueOnce(
      makeApiResponse('I cannot help with that request.'),
    );

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.isRetryable).toBe(false);
      expect(adapterError.provider).toBe('anthropic');
      expect(adapterError.message).toContain('No JSON found');
    }
  });

  it('throws AiAdapterError with isRetryable=true for API 500 error', async () => {
    const apiError = new (Anthropic as unknown as { APIError: new (status: number, body: unknown, message: string) => Error & { status: number } }).APIError(
      500,
      {},
      'Internal Server Error',
    );
    mockCreate.mockRejectedValueOnce(apiError);

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.isRetryable).toBe(true);
      expect(adapterError.provider).toBe('anthropic');
      expect(adapterError.message).toContain('Anthropic API error');
    }
  });

  it('throws AiAdapterError with isRetryable=false for API 401 error', async () => {
    const apiError = new (Anthropic as unknown as { APIError: new (status: number, body: unknown, message: string) => Error & { status: number } }).APIError(
      401,
      {},
      'Unauthorized',
    );
    mockCreate.mockRejectedValueOnce(apiError);

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.isRetryable).toBe(false);
      expect(adapterError.provider).toBe('anthropic');
      expect(adapterError.message).toContain('Anthropic API error');
    }
  });

  it('sums input and output tokens correctly', async () => {
    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE, 200, 350));

    const result = await adapter.suggestRepair(SAMPLE_INPUT);

    expect(result.tokensUsed).toBe(550);
  });

  it('passes model and max_tokens to the API', async () => {
    const customAdapter = new AnthropicAdapter({
      apiKey: 'test-key',
      model: 'claude-opus-4-20250514',
      maxTokens: 8192,
    });

    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE));

    await customAdapter.suggestRepair(SAMPLE_INPUT);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-20250514',
        max_tokens: 8192,
      }),
    );
  });
});
