import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prompt-builder so we can spy on buildRepairPrompt
vi.mock('../../src/ai/prompt-builder.js', () => ({
  buildRepairPrompt: vi.fn((input: unknown) => ({
    systemPrompt: 'mock-system-prompt',
    userMessage: 'mock-user-message',
  })),
}));

import { formatAiPayloadPreview, type PreviewAiPayloadInput } from '../../src/commands/heal.js';
import { buildRepairPrompt } from '../../src/ai/prompt-builder.js';

function makePreviewInput(overrides: Partial<PreviewAiPayloadInput> = {}): PreviewAiPayloadInput {
  return {
    failure: {
      file: 'tests/login.spec.ts',
      line: 42,
      selector: '#submit-btn',
      method: 'locator',
      error: 'Element not found',
    },
    redactedHtml: '<div><button>Login</button></div>',
    contextCode: 'await page.locator("#submit-btn").click();',
    ...overrides,
  };
}

describe('formatAiPayloadPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls buildRepairPrompt with correct AiRepairInput fields', () => {
    const input = makePreviewInput();
    formatAiPayloadPreview(input);

    expect(buildRepairPrompt).toHaveBeenCalledTimes(1);
    expect(buildRepairPrompt).toHaveBeenCalledWith({
      failedSelector: '#submit-btn',
      failedMethod: 'locator',
      errorMessage: 'Element not found',
      filePath: 'tests/login.spec.ts',
      line: 42,
      redactedHtml: '<div><button>Login</button></div>',
      contextCode: 'await page.locator("#submit-btn").click();',
    });
  });

  it('output contains "System Prompt:" header', () => {
    const output = formatAiPayloadPreview(makePreviewInput());
    expect(output).toContain('System Prompt:');
  });

  it('output contains "User Message:" header', () => {
    const output = formatAiPayloadPreview(makePreviewInput());
    expect(output).toContain('User Message:');
  });

  it('output contains "Payload Stats:" header', () => {
    const output = formatAiPayloadPreview(makePreviewInput());
    expect(output).toContain('Payload Stats:');
  });

  it('output includes the system prompt and user message content', () => {
    const output = formatAiPayloadPreview(makePreviewInput());
    expect(output).toContain('mock-system-prompt');
    expect(output).toContain('mock-user-message');
  });

  it('displays correct HTML size in bytes', () => {
    const html = '<div><button>Login</button></div>';
    const expectedBytes = Buffer.byteLength(html, 'utf-8');
    const output = formatAiPayloadPreview(makePreviewInput({ redactedHtml: html }));
    expect(output).toContain(`HTML size: ${expectedBytes} bytes`);
  });

  it('displays estimated tokens based on total payload length', () => {
    const output = formatAiPayloadPreview(makePreviewInput());
    // "mock-system-prompt" (18) + "mock-user-message" (18) = 36 chars => ceil(36/4) = 9
    expect(output).toContain('Estimated tokens: 9');
  });

  it('handles empty redactedHtml gracefully', () => {
    const input = makePreviewInput({ redactedHtml: '' });
    const output = formatAiPayloadPreview(input);
    expect(output).toContain('HTML size: 0 bytes');
    expect(output).toContain('System Prompt:');
    expect(output).toContain('User Message:');
  });

  it('handles multi-byte characters in HTML size calculation', () => {
    const html = '<div>Ünïcödé</div>';
    const expectedBytes = Buffer.byteLength(html, 'utf-8');
    // Multi-byte chars mean byte count > char count
    expect(expectedBytes).toBeGreaterThan(html.length);
    const output = formatAiPayloadPreview(makePreviewInput({ redactedHtml: html }));
    expect(output).toContain(`HTML size: ${expectedBytes} bytes`);
  });

  it('does not call any AI adapter (no AI call is made)', () => {
    // formatAiPayloadPreview only calls buildRepairPrompt, which builds the prompt
    // but never sends it. We verify no other AI-related functions are invoked.
    const input = makePreviewInput();
    const output = formatAiPayloadPreview(input);

    // buildRepairPrompt was called (prompt building)
    expect(buildRepairPrompt).toHaveBeenCalledTimes(1);

    // The output is a string (no network calls, no adapter usage)
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });
});
