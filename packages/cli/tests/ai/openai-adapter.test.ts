import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiRepairInput } from '@pw-doctor/shared';

// Mock the OpenAI SDK before importing the adapter
vi.mock('openai', () => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, _body: unknown, message: string) {
      super(`${status} ${message}`);
      this.status = status;
      this.name = 'APIError';
    }
  }

  const mockCreate = vi.fn();

  class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(_opts: Record<string, unknown>) {
      // no-op
    }
  }

  // Attach APIError as a static property on the class (matches SDK structure)
  (MockOpenAI as unknown as Record<string, unknown>).APIError = MockAPIError;

  return {
    default: MockOpenAI,
    APIError: MockAPIError,
  };
});

import OpenAI from 'openai';
import { OpenAiAdapter } from '../../src/ai/openai-adapter.js';
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

function makeApiResponse(content: string, totalTokens = 250) {
  return {
    choices: [{ message: { content } }],
    usage: { total_tokens: totalTokens, prompt_tokens: 150, completion_tokens: 100 },
  };
}

function getMockCreate(): ReturnType<typeof vi.fn> {
  const client = new OpenAI({ apiKey: 'test-key' });
  return (
    client as unknown as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }
  ).chat.completions.create;
}

describe('OpenAiAdapter', () => {
  let adapter: OpenAiAdapter;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenAiAdapter({ apiKey: 'test-key' });
    mockCreate = getMockCreate();
  });

  it('has provider set to "openai"', () => {
    expect(adapter.provider).toBe('openai');
  });

  it('parses a successful JSON response correctly', async () => {
    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE));

    const result = await adapter.suggestRepair(SAMPLE_INPUT);

    expect(result.provider).toBe('openai');
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

  it('uses response_format json_object in the API call', async () => {
    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE));

    await adapter.suggestRepair(SAMPLE_INPUT);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' },
      }),
    );
  });

  it('extracts token usage from response.usage.total_tokens', async () => {
    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE, 420));

    const result = await adapter.suggestRepair(SAMPLE_INPUT);

    expect(result.tokensUsed).toBe(420);
  });

  it('throws AiAdapterError when candidates array is missing', async () => {
    const badResponse = JSON.stringify({ suggestions: [] });
    mockCreate.mockResolvedValueOnce(makeApiResponse(badResponse));

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.isRetryable).toBe(false);
      expect(adapterError.provider).toBe('openai');
    }
  });

  it('throws AiAdapterError when candidates have invalid structure', async () => {
    const badResponse = JSON.stringify({ candidates: [{ selector: 'x' }] });
    mockCreate.mockResolvedValueOnce(makeApiResponse(badResponse));

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.isRetryable).toBe(false);
      expect(adapterError.provider).toBe('openai');
    }
  });

  it('throws AiAdapterError with isRetryable=true for API 500 error', async () => {
    const apiError = new (
      OpenAI as unknown as {
        APIError: new (status: number, body: unknown, message: string) => Error & { status: number };
      }
    ).APIError(500, {}, 'Internal Server Error');
    mockCreate.mockRejectedValueOnce(apiError);

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.isRetryable).toBe(true);
      expect(adapterError.provider).toBe('openai');
      expect(adapterError.message).toContain('OpenAI API error');
    }
  });

  it('throws AiAdapterError with isRetryable=false for API 401 error', async () => {
    const apiError = new (
      OpenAI as unknown as {
        APIError: new (status: number, body: unknown, message: string) => Error & { status: number };
      }
    ).APIError(401, {}, 'Unauthorized');
    mockCreate.mockRejectedValueOnce(apiError);

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.isRetryable).toBe(false);
      expect(adapterError.provider).toBe('openai');
      expect(adapterError.message).toContain('OpenAI API error');
    }
  });

  it('passes model and max_tokens to the API', async () => {
    const customAdapter = new OpenAiAdapter({
      apiKey: 'test-key',
      model: 'gpt-4-turbo',
      maxTokens: 8192,
    });

    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE));

    await customAdapter.suggestRepair(SAMPLE_INPUT);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4-turbo',
        max_tokens: 8192,
      }),
    );
  });

  it('defaults to gpt-4o model', async () => {
    mockCreate.mockResolvedValueOnce(makeApiResponse(VALID_JSON_RESPONSE));

    await adapter.suggestRepair(SAMPLE_INPUT);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
      }),
    );
  });

  it('handles empty content gracefully', async () => {
    const response = {
      choices: [{ message: { content: null } }],
      usage: { total_tokens: 10 },
    };
    mockCreate.mockResolvedValueOnce(response);

    try {
      await adapter.suggestRepair(SAMPLE_INPUT);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiAdapterError);
      const adapterError = error as AiAdapterError;
      expect(adapterError.provider).toBe('openai');
    }
  });
});
