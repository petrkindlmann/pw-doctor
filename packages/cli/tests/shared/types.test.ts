import { describe, it, expect } from 'vitest';
import { ConfigSchema, STRIP_EVENT_HANDLER_ATTRIBUTES } from '@pw-doctor/shared';
import type { AiRepairInput, AiRepairResponse, PwDoctorConfig } from '@pw-doctor/shared';

describe('shared types and schemas', () => {
  it('parses empty config with all defaults', () => {
    const config = ConfigSchema.parse({});
    expect(config.testDir).toBe('./tests');
    expect(config.ai.provider).toBe('anthropic');
    expect(config.ai.enabled).toBe(false);
    expect(config.redact.preset).toBe('moderate');
    expect(config.redact.patterns).toEqual([]);
    // Default strips the FULL inline event-handler set (not a narrowed list)
    // so the out-of-box AI payload can never carry inline JS.
    expect(config.redact.stripAttributes).toEqual([...STRIP_EVENT_HANDLER_ATTRIBUTES]);
    expect(config.redact.preserveAttributes).toEqual([]);
    expect(config.redact.stripSelectors).toEqual([]);
    expect(config.redact.maxDepth).toBe(20);
    expect(config.redact.maxSize).toBe(102400);
  });

  it('accepts openai as ai provider', () => {
    const config = ConfigSchema.parse({ ai: { provider: 'openai' } });
    expect(config.ai.provider).toBe('openai');
  });

  it('rejects invalid ai provider', () => {
    expect(() => ConfigSchema.parse({ ai: { provider: 'gemini' } })).toThrow();
  });

  it('accepts valid redact preset values', () => {
    for (const preset of ['moderate', 'strict', 'minimal'] as const) {
      const config = ConfigSchema.parse({ redact: { preset } });
      expect(config.redact.preset).toBe(preset);
    }
  });

  it('rejects invalid redact preset', () => {
    expect(() => ConfigSchema.parse({ redact: { preset: 'none' } })).toThrow();
  });

  it('accepts custom redact overrides', () => {
    const config = ConfigSchema.parse({
      redact: {
        maxDepth: 10,
        maxSize: 50000,
        preserveAttributes: ['data-testid'],
        stripSelectors: ['script', 'style'],
      },
    });
    expect(config.redact.maxDepth).toBe(10);
    expect(config.redact.maxSize).toBe(50000);
    expect(config.redact.preserveAttributes).toEqual(['data-testid']);
    expect(config.redact.stripSelectors).toEqual(['script', 'style']);
  });

  it('AiRepairInput type is structurally correct', () => {
    const input: AiRepairInput = {
      failedSelector: '.btn',
      failedMethod: 'locator',
      errorMessage: 'element not found',
      filePath: 'tests/login.spec.ts',
      line: 42,
      redactedHtml: '<button>Submit</button>',
      contextCode: 'await page.locator(".btn").click()',
    };
    expect(input.failedSelector).toBe('.btn');
    expect(input.line).toBe(42);
  });

  it('AiRepairResponse type is structurally correct', () => {
    const response: AiRepairResponse = {
      candidates: [
        {
          selector: 'button:has-text("Submit")',
          method: 'locator',
          confidence: 90,
          reasoning: 'text match',
        },
      ],
      tokensUsed: 1500,
      provider: 'openai',
    };
    expect(response.candidates).toHaveLength(1);
    expect(response.provider).toBe('openai');
  });

  it('PwDoctorConfig type accepts the expanded redact shape', () => {
    const config: PwDoctorConfig = {
      testDir: './tests',
      testMatch: '**/*.spec.ts',
      repair: {
        maxFiles: 10,
        maxReplacementsPerFile: 5,
        autoApplyThreshold: 85,
        suggestThreshold: 50,
      },
      ai: {
        enabled: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        maxCallsPerRun: 20,
        tokenBudgetPerRun: 50000,
      },
      redact: {
        preset: 'moderate',
        patterns: [],
        stripAttributes: ['style'],
        preserveAttributes: [],
        stripSelectors: [],
        maxDepth: 20,
        maxSize: 102400,
      },
      report: {
        format: 'json',
        outputDir: '.pw-doctor/reports',
      },
    };
    expect(config.redact.preset).toBe('moderate');
    expect(config.ai.provider).toBe('anthropic');
  });
});
