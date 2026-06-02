// packages/shared/src/schemas.ts
import { z } from 'zod';
import { DEFAULT_AI_MODEL, STRIP_EVENT_HANDLER_ATTRIBUTES } from './constants.js';

export const RunHistorySchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  timestamp: z.string(),
  trigger: z.enum(['cli', 'ci', 'watch']),
  config: z.object({
    aiEnabled: z.boolean(),
    autoApplyThreshold: z.number(),
  }),
  git: z
    .object({
      commit: z.string(),
      branch: z.string(),
      dirty: z.boolean(),
    })
    .nullable(),
  results: z.object({
    totalSelectors: z.number(),
    healthy: z.number(),
    broken: z.number(),
    repaired: z.number(),
    verified: z.number(),
    rolledBack: z.number(),
    needsManualReview: z.number(),
    skippedDynamic: z.number(),
  }),
  repairs: z.array(
    z.object({
      filePath: z.string(),
      line: z.number(),
      oldSelector: z.string(),
      oldMethod: z.string(),
      newSelector: z.string(),
      newMethod: z.string(),
      strategy: z.enum([
        'text_match',
        'attribute_match',
        'structural_match',
        'anchor_match',
        'ai',
      ]),
      confidence: z.number().min(0).max(100),
      reasoning: z.string(),
      status: z.enum(['verified', 'rolled_back', 'pending_review', 'skipped']),
      aiTokensUsed: z.number().optional(),
      aiCostCents: z.number().optional(),
    }),
  ),
  timing: z.object({
    totalMs: z.number(),
    checkMs: z.number(),
    repairMs: z.number(),
    verifyMs: z.number(),
  }),
});

export const ConfigSchema = z.object({
  testDir: z.string().default('./tests'),
  testMatch: z.string().default('**/*.spec.ts'),
  baseUrl: z.string().url().optional(),
  storageState: z.string().optional(),
  setup: z
    .object({
      command: z.string(),
      port: z.number().optional(),
      timeout: z.number().default(30000),
    })
    .optional(),
  repair: z
    .object({
      maxFiles: z.number().min(1).default(10),
      maxReplacementsPerFile: z.number().min(1).default(5),
      autoApplyThreshold: z.number().min(0).max(100).default(85),
      suggestThreshold: z.number().min(0).max(100).default(50),
    })
    .default({}),
  ai: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(['anthropic', 'openai']).default('anthropic'),
      model: z.string().default(DEFAULT_AI_MODEL),
      maxTokens: z.number().default(4096),
      maxCallsPerRun: z.number().default(20),
      tokenBudgetPerRun: z.number().default(50000),
    })
    .default({}),
  redact: z
    .object({
      preset: z.enum(['moderate', 'strict', 'minimal']).default('moderate'),
      // RegExp *source strings* — config is JSON/YAML and cannot carry a
      // RegExp instance. Each is compiled (and validated) at the redaction
      // call-site; an uncompilable pattern is dropped with a warning.
      patterns: z.array(z.string()).default([]),
      // Defaults to the full inline event-handler set (shared with the
      // redactor) so the out-of-box payload never carries inline JS. A
      // user-supplied list is merged with — not substituted for — this set
      // at the call-site.
      stripAttributes: z
        .array(z.string())
        .default([...STRIP_EVENT_HANDLER_ATTRIBUTES]),
      preserveAttributes: z.array(z.string()).default([]),
      stripSelectors: z.array(z.string()).default([]),
      maxDepth: z.number().default(20),
      maxSize: z.number().default(102400),
    })
    .default({}),
  report: z
    .object({
      format: z.enum(['json', 'html', 'markdown']).default('json'),
      outputDir: z.string().default('.pw-doctor/reports'),
    })
    .default({}),
});
