import type { PwDoctorConfig } from '@pw-doctor/shared';
import { DEFAULT_AI_MODEL } from '@pw-doctor/shared';

export const DEFAULT_CONFIG: PwDoctorConfig = {
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
    model: DEFAULT_AI_MODEL,
    maxTokens: 4096,
    maxCallsPerRun: 20,
    tokenBudgetPerRun: 50000,
  },
  redact: {
    preset: 'moderate',
    patterns: [],
    stripAttributes: ['style', 'onclick', 'onload'],
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
