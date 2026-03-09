// packages/shared/src/types.ts

export type SelectorType =
  | 'css'
  | 'text'
  | 'role'
  | 'testid'
  | 'label'
  | 'placeholder'
  | 'alttext'
  | 'title'
  | 'xpath'
  | 'id'
  | 'dynamic';

export type SelectorStatus = 'healthy' | 'broken' | 'unknown';

export type RepairStrategy =
  | 'text_match'
  | 'attribute_match'
  | 'structural_match'
  | 'anchor_match'
  | 'ai';

export type RepairStatus =
  | 'verified'
  | 'rolled_back'
  | 'pending_review'
  | 'skipped';

export type TriggerSource = 'cli' | 'ci' | 'watch';

export interface SelectorInfo {
  filePath: string;
  line: number;
  column: number;
  selectorValue: string;
  selectorType: SelectorType;
  apiMethod: string;
  isDynamic: boolean;
  contextCode: string;
  fragilityScore: number;
  roleOptions?: Record<string, unknown>;
}

export interface CheckResult {
  selector: SelectorInfo;
  status: SelectorStatus;
  error?: string;
}

export interface RepairCandidate {
  selector: string;
  method: string;
  confidence: number;
  strategy: RepairStrategy;
  reasoning: string;
  elementMatch: {
    tag: string;
    text: string;
    attributes: Record<string, string>;
    isVisible: boolean;
    isUnique: boolean;
  };
}

export interface RepairRecord {
  filePath: string;
  line: number;
  oldSelector: string;
  oldMethod: string;
  newSelector: string;
  newMethod: string;
  strategy: RepairStrategy;
  confidence: number;
  reasoning: string;
  status: RepairStatus;
  aiTokensUsed?: number;
  aiCostCents?: number;
}

export interface RunResults {
  totalSelectors: number;
  healthy: number;
  broken: number;
  repaired: number;
  verified: number;
  rolledBack: number;
  needsManualReview: number;
  skippedDynamic: number;
}

export interface RunHistory {
  schemaVersion: 1;
  runId: string;
  timestamp: string;
  trigger: TriggerSource;
  config: {
    aiEnabled: boolean;
    autoApplyThreshold: number;
  };
  git: {
    commit: string;
    branch: string;
    dirty: boolean;
  } | null;
  results: RunResults;
  repairs: RepairRecord[];
  timing: {
    totalMs: number;
    checkMs: number;
    repairMs: number;
    verifyMs: number;
  };
}

export interface PwDoctorConfig {
  testDir: string;
  testMatch: string;
  baseUrl?: string;
  storageState?: string;
  setup?: {
    command: string;
    port?: number;
    timeout?: number;
  };
  repair: {
    maxFiles: number;
    maxReplacementsPerFile: number;
    autoApplyThreshold: number;
    suggestThreshold: number;
  };
  ai: {
    enabled: boolean;
    provider: 'anthropic';
    model: string;
    maxTokens: number;
    maxCallsPerRun: number;
    tokenBudgetPerRun: number;
  };
  redact: {
    patterns: RegExp[];
    stripAttributes: string[];
  };
  report: {
    format: 'json' | 'html' | 'markdown';
    outputDir: string;
  };
}
