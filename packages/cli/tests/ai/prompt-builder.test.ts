import { describe, it, expect } from 'vitest';
import { buildRepairPrompt } from '../../src/ai/prompt-builder.js';
import type { AiRepairInput } from '@pw-doctor/shared';

const SAMPLE_INPUT: AiRepairInput = {
  failedSelector: '.btn-primary',
  failedMethod: 'locator',
  errorMessage: 'locator.click: Timeout 30000ms exceeded.',
  filePath: 'tests/login.spec.ts',
  line: 42,
  redactedHtml: '<button data-testid="login-submit" role="button">Sign In</button>',
  contextCode: "await page.locator('.btn-primary').click();",
};

describe('buildRepairPrompt', () => {
  it('returns a system prompt mentioning Playwright', () => {
    const { systemPrompt } = buildRepairPrompt(SAMPLE_INPUT);
    expect(systemPrompt).toContain('Playwright');
  });

  it('returns a user message containing the failed selector', () => {
    const { userMessage } = buildRepairPrompt(SAMPLE_INPUT);
    expect(userMessage).toContain('.btn-primary');
  });

  it('returns a user message containing the redacted HTML', () => {
    const { userMessage } = buildRepairPrompt(SAMPLE_INPUT);
    expect(userMessage).toContain(
      '<button data-testid="login-submit" role="button">Sign In</button>',
    );
  });

  it('includes code context in the user message', () => {
    const { userMessage } = buildRepairPrompt(SAMPLE_INPUT);
    expect(userMessage).toContain("await page.locator('.btn-primary').click();");
  });

  it('system prompt requests JSON output format', () => {
    const { systemPrompt } = buildRepairPrompt(SAMPLE_INPUT);
    expect(systemPrompt).toContain('JSON');
    expect(systemPrompt).toContain('"candidates"');
  });

  it('user message includes the error message', () => {
    const { userMessage } = buildRepairPrompt(SAMPLE_INPUT);
    expect(userMessage).toContain('Timeout 30000ms exceeded');
  });

  it('user message includes file path and line number', () => {
    const { userMessage } = buildRepairPrompt(SAMPLE_INPUT);
    expect(userMessage).toContain('tests/login.spec.ts:42');
  });

  it('user message includes the failed method', () => {
    const { userMessage } = buildRepairPrompt(SAMPLE_INPUT);
    expect(userMessage).toContain('Method: locator');
  });

  it('system prompt instructs preference for semantic selectors', () => {
    const { systemPrompt } = buildRepairPrompt(SAMPLE_INPUT);
    expect(systemPrompt).toContain('getByTestId');
    expect(systemPrompt).toContain('getByRole');
    expect(systemPrompt).toContain('getByText');
  });

  it('system prompt warns against generated CSS class names', () => {
    const { systemPrompt } = buildRepairPrompt(SAMPLE_INPUT);
    expect(systemPrompt.toLowerCase()).toContain('generated');
  });
});
