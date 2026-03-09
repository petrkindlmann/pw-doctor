# Phase 1: CLI Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the pw-doctor CLI that can parse Playwright test files, extract all selectors via AST, run tests to detect broken selectors, and report results with fragility scoring and proper exit codes.

**Architecture:** Turborepo monorepo with `cli` and `shared` packages. CLI uses commander for commands, recast+babel for AST, and Playwright as a peer dep for test execution. All security controls from the audit baked in from day one.

**Tech Stack:** TypeScript 5.x (strict, ESM), commander, recast, @babel/parser, cosmiconfig, zod, chalk, ora, cli-table3, vitest

**Reference:** PRD_FINAL.md sections 5-7, 11; Security audit controls C1.1-C1.8, CC1.1, CC4.1

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`

**Step 1: Initialize git repo**

```bash
cd /Users/petr/projects/pw-doctor
git init
```

**Step 2: Create root package.json**

```json
{
  "name": "pw-doctor-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Step 4: Create base tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

**Step 5: Create packages/shared/package.json**

```json
{
  "name": "@pw-doctor/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

**Step 6: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 7: Create packages/cli/package.json**

```json
{
  "name": "pw-doctor",
  "version": "0.0.1",
  "type": "module",
  "description": "AI-powered Playwright test selector maintenance",
  "bin": {
    "pw-doctor": "./dist/bin/pw-doctor.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@babel/parser": "^7.26.0",
    "@babel/traverse": "^7.26.0",
    "@babel/types": "^7.26.0",
    "@clack/prompts": "^0.10.0",
    "@pw-doctor/shared": "workspace:*",
    "chalk": "^5.4.0",
    "cli-table3": "^0.6.5",
    "commander": "^13.1.0",
    "cosmiconfig": "^9.0.0",
    "ora": "^8.2.0",
    "recast": "^0.23.9",
    "zod": "^3.24.0"
  },
  "peerDependencies": {
    "@playwright/test": ">=1.40.0"
  },
  "peerDependenciesMeta": {
    "@playwright/test": {
      "optional": true
    }
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-security": "^3.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "files": ["dist", "README.md"],
  "keywords": ["playwright", "testing", "selectors", "self-healing", "ast"],
  "license": "MIT"
}
```

**Step 8: Create packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

**Step 9: Create .gitignore**

```
node_modules/
dist/
.pw-doctor/
*.tsbuildinfo
.turbo/
.env
.env.local
coverage/
```

**Step 10: Create .npmrc**

```
engine-strict=true
```

**Step 11: Install dependencies**

Run: `npm install`
Expected: Successful install with no errors.

**Step 12: Create placeholder source files so build works**

Create `packages/shared/src/index.ts`:
```typescript
export {};
```

Create `packages/cli/src/index.ts`:
```typescript
export {};
```

**Step 13: Verify build works**

Run: `npm run build`
Expected: Clean build, `dist/` directories created in both packages.

**Step 14: Commit**

```bash
git add -A
git commit -m "chore: initialize turborepo monorepo with cli and shared packages"
```

---

### Task 2: Shared Types & Schemas

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create types.ts with all shared interfaces**

```typescript
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
```

**Step 2: Create schemas.ts with Zod validation schemas**

```typescript
// packages/shared/src/schemas.ts
import { z } from 'zod';

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
      provider: z.literal('anthropic').default('anthropic'),
      model: z.string().default('claude-sonnet-4-20250514'),
      maxTokens: z.number().default(4096),
      maxCallsPerRun: z.number().default(20),
      tokenBudgetPerRun: z.number().default(50000),
    })
    .default({}),
  redact: z
    .object({
      patterns: z.array(z.instanceof(RegExp)).default([]),
      stripAttributes: z
        .array(z.string())
        .default(['style', 'onclick', 'onload']),
    })
    .default({}),
  report: z
    .object({
      format: z.enum(['json', 'html', 'markdown']).default('json'),
      outputDir: z.string().default('.pw-doctor/reports'),
    })
    .default({}),
});
```

**Step 3: Create constants.ts**

```typescript
// packages/shared/src/constants.ts

export const PLAYWRIGHT_LOCATOR_METHODS = [
  'locator',
  'getByRole',
  'getByTestId',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'frameLocator',
] as const;

export const PLAYWRIGHT_RECEIVERS = [
  'page',
  'locator',
  'frame',
  'frameLocator',
] as const;

export const EXIT_CODES = {
  HEALTHY: 0,
  BROKEN_FOUND: 1,
  TOOL_ERROR: 2,
  FIXES_APPLIED: 3,
  FIXES_FAILED: 4,
} as const;

export const CONFIG_FILE_NAMES = [
  '.pw-doctor.config.json',
  '.pw-doctor.config.yaml',
  '.pw-doctor.config.yml',
  '.pw-doctorrc.json',
  '.pw-doctorrc.yaml',
  '.pw-doctorrc.yml',
];

export const PW_DOCTOR_DIR = '.pw-doctor';
export const SCHEMA_VERSION = 1;
```

**Step 4: Update index.ts to re-export everything**

```typescript
// packages/shared/src/index.ts
export * from './types.js';
export * from './schemas.js';
export * from './constants.js';
```

**Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build. `packages/shared/dist/` has all compiled files.

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add core types, Zod schemas, and constants"
```

---

### Task 3: Security Utilities

**Files:**
- Create: `packages/cli/src/utils/safe-exec.ts`
- Create: `packages/cli/src/utils/safe-path.ts`
- Create: `packages/cli/src/utils/error-sanitizer.ts`
- Create: `packages/cli/src/utils/logger.ts`
- Create: `packages/cli/tests/utils/safe-exec.test.ts`
- Create: `packages/cli/tests/utils/safe-path.test.ts`
- Create: `packages/cli/tests/utils/error-sanitizer.test.ts`
- Create: `packages/cli/vitest.config.ts`

**Step 1: Create vitest.config.ts**

```typescript
// packages/cli/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 2: Write tests for safe-exec**

```typescript
// packages/cli/tests/utils/safe-exec.test.ts
import { describe, it, expect } from 'vitest';
import { safeExec } from '../../src/utils/safe-exec.js';

describe('safeExec', () => {
  it('executes a command with array arguments', async () => {
    const result = await safeExec('echo', ['hello']);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns stderr on failure', async () => {
    const result = await safeExec('ls', ['--nonexistent-flag']);
    expect(result.exitCode).not.toBe(0);
  });

  it('does not pass ANTHROPIC_API_KEY to child processes', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-secret';
    const result = await safeExec('env', []);
    expect(result.stdout).not.toContain('ANTHROPIC_API_KEY');
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('does not pass PW_DOCTOR_API_KEY to child processes', async () => {
    process.env.PW_DOCTOR_API_KEY = 'pwd_test';
    const result = await safeExec('env', []);
    expect(result.stdout).not.toContain('PW_DOCTOR_API_KEY');
    delete process.env.PW_DOCTOR_API_KEY;
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/utils/safe-exec.test.ts`
Expected: FAIL — module not found.

**Step 4: Implement safe-exec**

```typescript
// packages/cli/src/utils/safe-exec.ts
import { execFile } from 'node:child_process';

const SENSITIVE_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'PW_DOCTOR_API_KEY',
  'OPENAI_API_KEY',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
];

const ALLOWED_ENV_PREFIX = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'NODE',
  'NPM',
  'CI',
  'DISPLAY',
  'LANG',
  'LC_',
  'PLAYWRIGHT_',
  'PW_TEST_',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
];

function buildSafeEnv(): Record<string, string> {
  const safeEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SENSITIVE_ENV_VARS.includes(key)) continue;
    const isAllowed = ALLOWED_ENV_PREFIX.some(
      (prefix) => key === prefix || key.startsWith(prefix),
    );
    if (isAllowed) {
      safeEnv[key] = value;
    }
  }
  return safeEnv;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function safeExec(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options?.cwd,
        timeout: options?.timeout,
        env: buildSafeEnv(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error?.code
            ? typeof error.code === 'number'
              ? error.code
              : 1
            : 0,
        });
      },
    );

    // Handle spawn errors
    child.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/utils/safe-exec.test.ts`
Expected: All 4 tests PASS.

**Step 6: Write tests for safe-path**

```typescript
// packages/cli/tests/utils/safe-path.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { assertWithinRoot, resolveProjectPath } from '../../src/utils/safe-path.js';

describe('safe-path', () => {
  const root = '/Users/test/project';

  it('allows paths within project root', () => {
    expect(() => assertWithinRoot(root, 'src/test.ts')).not.toThrow();
  });

  it('allows nested paths within project root', () => {
    expect(() =>
      assertWithinRoot(root, 'tests/deep/nested/file.ts'),
    ).not.toThrow();
  });

  it('rejects path traversal with ../', () => {
    expect(() => assertWithinRoot(root, '../../../etc/passwd')).toThrow(
      'outside project root',
    );
  });

  it('rejects absolute paths outside root', () => {
    expect(() => assertWithinRoot(root, '/etc/passwd')).toThrow(
      'outside project root',
    );
  });

  it('resolves clean path within root', () => {
    const result = resolveProjectPath(root, 'src/./utils/../test.ts');
    expect(result).toBe(path.join(root, 'src/test.ts'));
  });
});
```

**Step 7: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/utils/safe-path.test.ts`
Expected: FAIL — module not found.

**Step 8: Implement safe-path**

```typescript
// packages/cli/src/utils/safe-path.ts
import path from 'node:path';
import fs from 'node:fs';

export function resolveProjectPath(
  projectRoot: string,
  relativePath: string,
): string {
  const resolved = path.resolve(projectRoot, relativePath);
  assertWithinRoot(projectRoot, relativePath);
  return resolved;
}

export function assertWithinRoot(
  projectRoot: string,
  filePath: string,
): void {
  const resolved = path.resolve(projectRoot, filePath);
  const normalizedRoot = path.resolve(projectRoot);

  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(
      `Path "${filePath}" resolves to "${resolved}" which is outside project root "${normalizedRoot}"`,
    );
  }
}

export function safeWriteFile(
  projectRoot: string,
  filePath: string,
  content: string,
): void {
  const resolved = resolveProjectPath(projectRoot, filePath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(resolved, content, { mode: 0o600 });
}

export function safeReadFile(
  projectRoot: string,
  filePath: string,
): string {
  const resolved = resolveProjectPath(projectRoot, filePath);
  return fs.readFileSync(resolved, 'utf-8');
}
```

**Step 9: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/utils/safe-path.test.ts`
Expected: All 5 tests PASS.

**Step 10: Write tests for error-sanitizer**

```typescript
// packages/cli/tests/utils/error-sanitizer.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeError } from '../../src/utils/error-sanitizer.js';

describe('sanitizeError', () => {
  it('strips API key patterns', () => {
    const err = new Error('Request failed with key sk-ant-abc123xyz');
    const safe = sanitizeError(err);
    expect(safe.message).not.toContain('sk-ant-abc123xyz');
    expect(safe.message).toContain('[REDACTED]');
  });

  it('strips Bearer tokens', () => {
    const err = new Error('Auth: Bearer eyJhbGciOiJIUzI1NiJ9.test');
    const safe = sanitizeError(err);
    expect(safe.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('strips pwd_ prefixed tokens', () => {
    const err = new Error('Invalid key: pwd_abc123def456');
    const safe = sanitizeError(err);
    expect(safe.message).not.toContain('pwd_abc123def456');
  });

  it('preserves non-sensitive error messages', () => {
    const err = new Error('File not found: test.spec.ts');
    const safe = sanitizeError(err);
    expect(safe.message).toBe('File not found: test.spec.ts');
  });

  it('handles non-Error objects', () => {
    const safe = sanitizeError('string error');
    expect(safe.message).toBe('string error');
  });
});
```

**Step 11: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/utils/error-sanitizer.test.ts`
Expected: FAIL — module not found.

**Step 12: Implement error-sanitizer**

```typescript
// packages/cli/src/utils/error-sanitizer.ts

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys with known prefixes
  { pattern: /\bsk-ant-[A-Za-z0-9_-]+/g, replacement: '[REDACTED]' },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replacement: '[REDACTED]' },
  { pattern: /\bpwd_[A-Za-z0-9_-]+/g, replacement: '[REDACTED]' },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer [REDACTED]' },
  // Generic long hex/base64 tokens (40+ chars)
  { pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, replacement: '[REDACTED]' },
];

export interface SafeError {
  message: string;
  code?: string;
}

export function sanitizeError(error: unknown): SafeError {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = 'Unknown error';
  }

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    message = message.replace(pattern, replacement);
  }

  return { message };
}

export function sanitizeForLog(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}
```

**Step 13: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/utils/error-sanitizer.test.ts`
Expected: All 5 tests PASS.

**Step 14: Create logger**

```typescript
// packages/cli/src/utils/logger.ts
import chalk from 'chalk';
import { sanitizeForLog } from './error-sanitizer.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = 'info';
let ciMode = false;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setCIMode(enabled: boolean): void {
  ciMode = enabled;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

export const logger = {
  debug(msg: string): void {
    if (!shouldLog('debug')) return;
    const safe = sanitizeForLog(msg);
    if (!ciMode) console.debug(chalk.gray(`  ${safe}`));
  },

  info(msg: string): void {
    if (!shouldLog('info')) return;
    const safe = sanitizeForLog(msg);
    console.log(safe);
  },

  warn(msg: string): void {
    if (!shouldLog('warn')) return;
    const safe = sanitizeForLog(msg);
    console.warn(chalk.yellow(`⚠ ${safe}`));
  },

  error(msg: string): void {
    if (!shouldLog('error')) return;
    const safe = sanitizeForLog(msg);
    console.error(chalk.red(`✖ ${safe}`));
  },

  success(msg: string): void {
    if (!shouldLog('info')) return;
    const safe = sanitizeForLog(msg);
    console.log(chalk.green(`✔ ${safe}`));
  },
};
```

**Step 15: Run all utility tests**

Run: `cd packages/cli && npx vitest run`
Expected: All 14 tests PASS.

**Step 16: Commit**

```bash
git add packages/cli/src/utils/ packages/cli/tests/ packages/cli/vitest.config.ts
git commit -m "feat(cli): add security utilities — safe-exec, safe-path, error-sanitizer, logger"
```

---

### Task 4: Config System

**Files:**
- Create: `packages/cli/src/config/defaults.ts`
- Create: `packages/cli/src/config/schema.ts`
- Create: `packages/cli/src/config/loader.ts`
- Create: `packages/cli/tests/config/loader.test.ts`

**Step 1: Create config defaults**

```typescript
// packages/cli/src/config/defaults.ts
import type { PwDoctorConfig } from '@pw-doctor/shared';

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
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    maxCallsPerRun: 20,
    tokenBudgetPerRun: 50000,
  },
  redact: {
    patterns: [],
    stripAttributes: ['style', 'onclick', 'onload'],
  },
  report: {
    format: 'json',
    outputDir: '.pw-doctor/reports',
  },
};
```

**Step 2: Create config schema (re-export from shared with CLI-specific parsing)**

```typescript
// packages/cli/src/config/schema.ts
export { ConfigSchema } from '@pw-doctor/shared';
```

**Step 3: Write config loader test**

```typescript
// packages/cli/tests/config/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../../src/config/loader.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns default config when no config file exists', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.testDir).toBe('./tests');
    expect(config.ai.enabled).toBe(false);
    expect(config.repair.maxFiles).toBe(10);
  });

  it('loads JSON config and merges with defaults', async () => {
    const configPath = path.join(tmpDir, '.pw-doctor.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ testDir: './e2e', ai: { enabled: true } }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.testDir).toBe('./e2e');
    expect(config.ai.enabled).toBe(true);
    expect(config.repair.maxFiles).toBe(10); // still default
  });

  it('loads YAML config', async () => {
    const configPath = path.join(tmpDir, '.pw-doctor.config.yaml');
    fs.writeFileSync(configPath, 'testDir: ./specs\ntestMatch: "**/*.test.ts"\n');
    const config = await loadConfig(tmpDir);
    expect(config.testDir).toBe('./specs');
    expect(config.testMatch).toBe('**/*.test.ts');
  });

  it('rejects invalid config values', async () => {
    const configPath = path.join(tmpDir, '.pw-doctor.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ repair: { maxFiles: -1 } }),
    );
    await expect(loadConfig(tmpDir)).rejects.toThrow();
  });
});
```

**Step 4: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/config/loader.test.ts`
Expected: FAIL — module not found.

**Step 5: Implement config loader (JSON/YAML only — no TS/JS eval per C1.1)**

```typescript
// packages/cli/src/config/loader.ts
import { cosmiconfig } from 'cosmiconfig';
import { ConfigSchema } from '@pw-doctor/shared';
import { DEFAULT_CONFIG } from './defaults.js';
import type { PwDoctorConfig } from '@pw-doctor/shared';

export async function loadConfig(searchFrom: string): Promise<PwDoctorConfig> {
  const explorer = cosmiconfig('pw-doctor', {
    // SECURITY [C1.1]: Only load static formats. No TypeScript/JS evaluation.
    searchPlaces: [
      '.pw-doctor.config.json',
      '.pw-doctor.config.yaml',
      '.pw-doctor.config.yml',
      '.pw-doctorrc.json',
      '.pw-doctorrc.yaml',
      '.pw-doctorrc.yml',
      'package.json',
    ],
    // No loaders for .ts or .js — intentionally omitted
  });

  const result = await explorer.search(searchFrom);

  if (!result || result.isEmpty) {
    return DEFAULT_CONFIG;
  }

  // Merge loaded config with defaults, then validate
  const merged = deepMerge(DEFAULT_CONFIG, result.config);
  const parsed = ConfigSchema.parse(merged);

  return parsed as PwDoctorConfig;
}

function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Record<string, unknown>,
): T {
  const result = { ...defaults };

  for (const key of Object.keys(overrides)) {
    const defaultVal = (defaults as Record<string, unknown>)[key];
    const overrideVal = overrides[key];

    if (
      typeof defaultVal === 'object' &&
      defaultVal !== null &&
      !Array.isArray(defaultVal) &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        defaultVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = overrideVal;
    }
  }

  return result;
}
```

**Step 6: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/config/loader.test.ts`
Expected: All 4 tests PASS.

**Step 7: Commit**

```bash
git add packages/cli/src/config/ packages/cli/tests/config/
git commit -m "feat(cli): add config system — cosmiconfig with JSON/YAML only, Zod validation"
```

---

### Task 5: Selector Extractor (AST)

**Files:**
- Create: `packages/cli/src/core/selector-types.ts`
- Create: `packages/cli/src/core/selector-extractor.ts`
- Create: `packages/cli/tests/core/selector-extractor.test.ts`
- Create: `packages/cli/tests/fixtures/sample-tests/basic.spec.ts`
- Create: `packages/cli/tests/fixtures/sample-tests/chained.spec.ts`
- Create: `packages/cli/tests/fixtures/sample-tests/dynamic.spec.ts`

**Step 1: Create test fixture — basic Playwright test file**

```typescript
// packages/cli/tests/fixtures/sample-tests/basic.spec.ts
// This is a FIXTURE — not a real test. Used to test AST extraction.
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('/login');
  await page.locator('.username-input').fill('user@test.com');
  await page.locator('#password').fill('secret');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByTestId('dashboard-header').waitFor();
  await page.getByText('Welcome back').isVisible();
  await page.getByLabel('Search').fill('test');
  await page.getByPlaceholder('Type to search...').click();
  await page.getByAltText('User avatar').click();
  await page.getByTitle('Settings').click();
});
```

**Step 2: Create test fixture — chained locators**

```typescript
// packages/cli/tests/fixtures/sample-tests/chained.spec.ts
import { test, expect } from '@playwright/test';

test('chained selectors', async ({ page }) => {
  await page.locator('.nav-menu').locator('.menu-item').first().click();
  await page.getByRole('list').getByRole('listitem').nth(2).click();
  await page.locator('.form').filter({ hasText: 'Email' }).locator('input').fill('test@test.com');
  await page.frameLocator('#embed').locator('.btn-submit').click();
});
```

**Step 3: Create test fixture — dynamic selectors (should be marked as such)**

```typescript
// packages/cli/tests/fixtures/sample-tests/dynamic.spec.ts
import { test, expect } from '@playwright/test';

test('dynamic selectors', async ({ page }) => {
  const itemId = 'abc123';
  await page.locator(`[data-id="${itemId}"]`).click();
  await page.locator('.static-selector').click();
});
```

**Step 4: Write selector extractor tests**

```typescript
// packages/cli/tests/core/selector-extractor.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { extractSelectors } from '../../src/core/selector-extractor.js';

const FIXTURES = path.join(import.meta.dirname, '../fixtures/sample-tests');

describe('extractSelectors', () => {
  it('extracts all selectors from basic test file', () => {
    const filePath = path.join(FIXTURES, 'basic.spec.ts');
    const selectors = extractSelectors(filePath);

    expect(selectors.length).toBe(10);

    // CSS class selector
    const usernameInput = selectors.find((s) =>
      s.selectorValue === '.username-input',
    );
    expect(usernameInput).toBeDefined();
    expect(usernameInput!.selectorType).toBe('css');
    expect(usernameInput!.apiMethod).toBe('locator');

    // ID selector
    const password = selectors.find((s) => s.selectorValue === '#password');
    expect(password).toBeDefined();
    expect(password!.selectorType).toBe('id');

    // getByRole
    const signInBtn = selectors.find((s) => s.apiMethod === 'getByRole');
    expect(signInBtn).toBeDefined();
    expect(signInBtn!.selectorValue).toBe('button');
    expect(signInBtn!.selectorType).toBe('role');

    // getByTestId
    const dashHeader = selectors.find((s) => s.apiMethod === 'getByTestId');
    expect(dashHeader).toBeDefined();
    expect(dashHeader!.selectorValue).toBe('dashboard-header');
    expect(dashHeader!.selectorType).toBe('testid');

    // getByText
    const welcome = selectors.find((s) => s.apiMethod === 'getByText');
    expect(welcome).toBeDefined();
    expect(welcome!.selectorType).toBe('text');

    // getByLabel
    const search = selectors.find((s) => s.apiMethod === 'getByLabel');
    expect(search).toBeDefined();
    expect(search!.selectorType).toBe('label');

    // getByPlaceholder
    const placeholder = selectors.find((s) => s.apiMethod === 'getByPlaceholder');
    expect(placeholder).toBeDefined();
    expect(placeholder!.selectorType).toBe('placeholder');

    // getByAltText
    const avatar = selectors.find((s) => s.apiMethod === 'getByAltText');
    expect(avatar).toBeDefined();
    expect(avatar!.selectorType).toBe('alttext');

    // getByTitle
    const settings = selectors.find((s) => s.apiMethod === 'getByTitle');
    expect(settings).toBeDefined();
    expect(settings!.selectorType).toBe('title');
  });

  it('extracts chained locators', () => {
    const filePath = path.join(FIXTURES, 'chained.spec.ts');
    const selectors = extractSelectors(filePath);

    // Should find locator calls in chains
    expect(selectors.some((s) => s.selectorValue === '.nav-menu')).toBe(true);
    expect(selectors.some((s) => s.selectorValue === '.menu-item')).toBe(true);
    expect(selectors.some((s) => s.selectorValue === '.btn-submit')).toBe(true);
  });

  it('marks dynamic selectors as isDynamic', () => {
    const filePath = path.join(FIXTURES, 'dynamic.spec.ts');
    const selectors = extractSelectors(filePath);

    const dynamicSelector = selectors.find((s) => s.isDynamic);
    expect(dynamicSelector).toBeDefined();

    const staticSelector = selectors.find(
      (s) => s.selectorValue === '.static-selector',
    );
    expect(staticSelector).toBeDefined();
    expect(staticSelector!.isDynamic).toBe(false);
  });

  it('includes line and column numbers', () => {
    const filePath = path.join(FIXTURES, 'basic.spec.ts');
    const selectors = extractSelectors(filePath);

    for (const sel of selectors) {
      expect(sel.line).toBeGreaterThan(0);
      expect(sel.column).toBeGreaterThanOrEqual(0);
      expect(sel.filePath).toBe(filePath);
    }
  });

  it('includes context code around each selector', () => {
    const filePath = path.join(FIXTURES, 'basic.spec.ts');
    const selectors = extractSelectors(filePath);

    for (const sel of selectors) {
      expect(sel.contextCode).toBeTruthy();
      expect(sel.contextCode.length).toBeGreaterThan(0);
    }
  });
});
```

**Step 5: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/core/selector-extractor.test.ts`
Expected: FAIL — module not found.

**Step 6: Implement selector extractor**

```typescript
// packages/cli/src/core/selector-types.ts
export type { SelectorInfo, SelectorType } from '@pw-doctor/shared';
```

```typescript
// packages/cli/src/core/selector-extractor.ts
import fs from 'node:fs';
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { SelectorInfo, SelectorType } from '@pw-doctor/shared';
import { PLAYWRIGHT_LOCATOR_METHODS } from '@pw-doctor/shared';

// Handle ESM/CJS interop for @babel/traverse
const traverse = (
  typeof _traverse === 'function' ? _traverse : (_traverse as { default: typeof _traverse }).default
);

export function extractSelectors(filePath: string): SelectorInfo[] {
  const source = fs.readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');

  const ast = parser.parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy'],
  });

  const selectors: SelectorInfo[] = [];

  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      const callee = node.callee;

      if (!t.isMemberExpression(callee)) return;
      if (!t.isIdentifier(callee.property)) return;

      const methodName = callee.property.name;

      if (
        !(PLAYWRIGHT_LOCATOR_METHODS as readonly string[]).includes(methodName)
      ) {
        return;
      }

      // Verify the receiver looks like a Playwright object
      if (!isPlaywrightReceiver(callee.object)) return;

      const firstArg = node.arguments[0];
      if (!firstArg) return;

      const loc = node.loc;
      if (!loc) return;

      const line = loc.start.line;
      const column = loc.start.column;
      const contextCode = getContextLines(lines, line, 5);

      if (t.isStringLiteral(firstArg)) {
        const selectorValue = firstArg.value;
        const selectorType = classifySelectorType(methodName, selectorValue);

        const info: SelectorInfo = {
          filePath,
          line,
          column,
          selectorValue,
          selectorType,
          apiMethod: methodName,
          isDynamic: false,
          contextCode,
          fragilityScore: 0, // computed later
        };

        // Extract roleOptions for getByRole
        if (methodName === 'getByRole' && node.arguments[1]) {
          info.roleOptions = extractObjectLiteral(node.arguments[1]);
        }

        selectors.push(info);
      } else if (t.isTemplateLiteral(firstArg)) {
        const isDynamic = firstArg.expressions.length > 0;
        const rawValue = firstArg.quasis.map((q) => q.value.raw).join('${...}');

        selectors.push({
          filePath,
          line,
          column,
          selectorValue: rawValue,
          selectorType: isDynamic ? 'dynamic' : classifySelectorType(methodName, rawValue),
          apiMethod: methodName,
          isDynamic,
          contextCode,
          fragilityScore: 0,
        });
      }
    },
  });

  return selectors;
}

function isPlaywrightReceiver(node: t.Node): boolean {
  // Direct: page.locator(...)
  if (t.isIdentifier(node) && ['page', 'frame'].includes(node.name)) {
    return true;
  }

  // Chained: page.locator(...).locator(...)
  if (t.isCallExpression(node)) {
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const method = node.callee.property.name;
      if ((PLAYWRIGHT_LOCATOR_METHODS as readonly string[]).includes(method)) {
        return true;
      }
      // .first(), .last(), .nth(), .filter(), .and(), .or()
      if (['first', 'last', 'nth', 'filter', 'and', 'or'].includes(method)) {
        return true;
      }
    }
  }

  // Member access on result: page.locator(...).something
  if (t.isMemberExpression(node)) {
    return isPlaywrightReceiver(node.object);
  }

  return false;
}

function classifySelectorType(method: string, value: string): SelectorType {
  if (method === 'getByRole') return 'role';
  if (method === 'getByTestId') return 'testid';
  if (method === 'getByText') return 'text';
  if (method === 'getByLabel') return 'label';
  if (method === 'getByPlaceholder') return 'placeholder';
  if (method === 'getByAltText') return 'alttext';
  if (method === 'getByTitle') return 'title';
  if (method === 'frameLocator') return 'css';

  // For page.locator(), classify by value
  if (value.startsWith('//') || value.startsWith('xpath=')) return 'xpath';
  if (value.startsWith('text=') || value.startsWith('"')) return 'text';
  if (value.startsWith('#')) return 'id';
  if (value.includes('[data-testid')) return 'testid';
  if (value.includes('[role=') || value.startsWith('role=')) return 'role';

  return 'css';
}

function getContextLines(
  lines: string[],
  targetLine: number,
  contextSize: number,
): string {
  const start = Math.max(0, targetLine - 1 - contextSize);
  const end = Math.min(lines.length, targetLine + contextSize);
  return lines.slice(start, end).join('\n');
}

function extractObjectLiteral(
  node: t.Node,
): Record<string, unknown> | undefined {
  if (!t.isObjectExpression(node)) return undefined;

  const result: Record<string, unknown> = {};
  for (const prop of node.properties) {
    if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      t.isStringLiteral(prop.value)
    ) {
      result[prop.key.name] = prop.value.value;
    } else if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      t.isBooleanLiteral(prop.value)
    ) {
      result[prop.key.name] = prop.value.value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
```

**Step 7: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/core/selector-extractor.test.ts`
Expected: All 5 tests PASS.

**Step 8: Commit**

```bash
git add packages/cli/src/core/ packages/cli/tests/core/ packages/cli/tests/fixtures/
git commit -m "feat(cli): add AST-based selector extractor for all Playwright locator patterns"
```

---

### Task 6: Fragility Scorer

**Files:**
- Create: `packages/cli/src/core/fragility-scorer.ts`
- Create: `packages/cli/tests/core/fragility-scorer.test.ts`

**Step 1: Write tests**

```typescript
// packages/cli/tests/core/fragility-scorer.test.ts
import { describe, it, expect } from 'vitest';
import { computeFragilityScore } from '../../src/core/fragility-scorer.js';
import type { SelectorInfo } from '@pw-doctor/shared';

function makeSelector(overrides: Partial<SelectorInfo>): SelectorInfo {
  return {
    filePath: 'test.spec.ts',
    line: 1,
    column: 0,
    selectorValue: '.btn',
    selectorType: 'css',
    apiMethod: 'locator',
    isDynamic: false,
    contextCode: '',
    fragilityScore: 0,
    ...overrides,
  };
}

describe('computeFragilityScore', () => {
  it('scores data-testid as low fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'testid', selectorValue: 'submit-btn' }),
    );
    expect(score).toBeLessThan(30);
  });

  it('scores role selectors as low fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'role', selectorValue: 'button' }),
    );
    expect(score).toBeLessThan(30);
  });

  it('scores CSS class selectors as medium-high fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'css', selectorValue: '.btn-primary' }),
    );
    expect(score).toBeGreaterThan(50);
  });

  it('scores xpath as very high fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'xpath', selectorValue: '//div[1]/span' }),
    );
    expect(score).toBeGreaterThan(70);
  });

  it('scores dynamic selectors as maximum fragility', () => {
    const score = computeFragilityScore(
      makeSelector({ selectorType: 'dynamic', isDynamic: true }),
    );
    expect(score).toBeGreaterThan(80);
  });

  it('penalizes nth-child usage', () => {
    const without = computeFragilityScore(
      makeSelector({ selectorValue: '.list-item' }),
    );
    const with_ = computeFragilityScore(
      makeSelector({ selectorValue: '.list-item:nth-child(3)' }),
    );
    expect(with_).toBeGreaterThan(without);
  });

  it('clamps score between 0 and 100', () => {
    const score = computeFragilityScore(
      makeSelector({
        selectorType: 'testid',
        selectorValue: '[data-testid="x"]',
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/core/fragility-scorer.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement fragility scorer**

```typescript
// packages/cli/src/core/fragility-scorer.ts
import type { SelectorInfo, SelectorType } from '@pw-doctor/shared';

const TYPE_BASE_SCORES: Record<SelectorType, number> = {
  testid: 10,
  role: 15,
  label: 20,
  title: 25,
  placeholder: 30,
  alttext: 30,
  text: 40,
  id: 35,
  css: 65,
  xpath: 80,
  dynamic: 90,
};

export function computeFragilityScore(selector: SelectorInfo): number {
  let score = TYPE_BASE_SCORES[selector.selectorType] ?? 50;

  const value = selector.selectorValue;

  // Structural penalties
  if (value.includes('nth-child')) score += 15;
  if (value.includes('nth-of-type')) score += 15;
  if (value.includes('>>')) score += 10;
  if ((value.match(/\./g) || []).length > 2) score += 10;
  if (value.includes(':has(')) score += 5;
  if (value.includes(':nth(')) score += 10;

  // Specificity bonus
  if (value.includes('data-testid')) score -= 20;
  if (/^#[a-z][\w-]+$/i.test(value)) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function enrichWithFragility(selectors: SelectorInfo[]): SelectorInfo[] {
  return selectors.map((s) => ({
    ...s,
    fragilityScore: computeFragilityScore(s),
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/core/fragility-scorer.test.ts`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add packages/cli/src/core/fragility-scorer.ts packages/cli/tests/core/fragility-scorer.test.ts
git commit -m "feat(cli): add selector fragility scoring — type-based + structural penalties"
```

---

### Task 7: Terminal Reporter

**Files:**
- Create: `packages/cli/src/report/terminal-reporter.ts`
- Create: `packages/cli/tests/report/terminal-reporter.test.ts`

**Step 1: Write tests**

```typescript
// packages/cli/tests/report/terminal-reporter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { formatCheckResults } from '../../src/report/terminal-reporter.js';
import type { SelectorInfo, CheckResult } from '@pw-doctor/shared';

describe('formatCheckResults', () => {
  it('formats results into a readable string', () => {
    const results: CheckResult[] = [
      {
        selector: {
          filePath: 'tests/login.spec.ts',
          line: 42,
          column: 4,
          selectorValue: '.btn-primary',
          selectorType: 'css',
          apiMethod: 'locator',
          isDynamic: false,
          contextCode: '',
          fragilityScore: 78,
        },
        status: 'broken',
      },
      {
        selector: {
          filePath: 'tests/login.spec.ts',
          line: 55,
          column: 4,
          selectorValue: 'dashboard-header',
          selectorType: 'testid',
          apiMethod: 'getByTestId',
          isDynamic: false,
          contextCode: '',
          fragilityScore: 10,
        },
        status: 'healthy',
      },
    ];

    const output = formatCheckResults(results);
    expect(output).toContain('.btn-primary');
    expect(output).toContain('BROKEN');
    expect(output).toContain('HEALTHY');
    expect(output).toContain('login.spec.ts');
  });

  it('includes summary statistics', () => {
    const results: CheckResult[] = [
      {
        selector: {
          filePath: 'test.spec.ts', line: 1, column: 0,
          selectorValue: '.a', selectorType: 'css', apiMethod: 'locator',
          isDynamic: false, contextCode: '', fragilityScore: 50,
        },
        status: 'healthy',
      },
      {
        selector: {
          filePath: 'test.spec.ts', line: 2, column: 0,
          selectorValue: '.b', selectorType: 'css', apiMethod: 'locator',
          isDynamic: false, contextCode: '', fragilityScore: 50,
        },
        status: 'broken',
      },
    ];

    const output = formatCheckResults(results);
    expect(output).toContain('2');  // total
    expect(output).toContain('1');  // broken count appears
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/report/terminal-reporter.test.ts`
Expected: FAIL.

**Step 3: Implement terminal reporter**

```typescript
// packages/cli/src/report/terminal-reporter.ts
import chalk from 'chalk';
import Table from 'cli-table3';
import type { CheckResult } from '@pw-doctor/shared';

function statusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return chalk.green('HEALTHY');
    case 'broken':
      return chalk.red('BROKEN');
    case 'unknown':
      return chalk.yellow('UNKNOWN');
    default:
      return status;
  }
}

function fragilityColor(score: number): string {
  if (score >= 70) return chalk.red(`${score}/100`);
  if (score >= 40) return chalk.yellow(`${score}/100`);
  return chalk.green(`${score}/100`);
}

function shortenPath(filePath: string, line: number): string {
  const parts = filePath.split('/');
  const short = parts.slice(-2).join('/');
  return `${short}:${line}`;
}

export function formatCheckResults(results: CheckResult[]): string {
  const table = new Table({
    head: ['File', 'Selector', 'Status', 'Fragility'],
    style: { head: ['cyan'] },
    colWidths: [30, 35, 10, 12],
    wordWrap: true,
  });

  for (const r of results) {
    const selector =
      r.selector.selectorValue.length > 30
        ? r.selector.selectorValue.slice(0, 27) + '...'
        : r.selector.selectorValue;

    table.push([
      shortenPath(r.selector.filePath, r.selector.line),
      selector,
      statusColor(r.status),
      fragilityColor(r.selector.fragilityScore),
    ]);
  }

  const total = results.length;
  const healthy = results.filter((r) => r.status === 'healthy').length;
  const broken = results.filter((r) => r.status === 'broken').length;
  const unknown = results.filter((r) => r.status === 'unknown').length;
  const healthPct =
    total > 0 ? ((healthy / total) * 100).toFixed(1) : '100.0';

  const summary = [
    '',
    table.toString(),
    '',
    `Summary: ${total} selectors checked, ${broken} broken, ${unknown} unknown, ${healthy} healthy`,
    `Health: ${healthPct}%`,
  ].join('\n');

  return summary;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/report/terminal-reporter.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/cli/src/report/ packages/cli/tests/report/
git commit -m "feat(cli): add terminal reporter with color-coded status table"
```

---

### Task 8: JSON Reporter

**Files:**
- Create: `packages/cli/src/report/json-reporter.ts`
- Create: `packages/cli/tests/report/json-reporter.test.ts`

**Step 1: Write tests**

```typescript
// packages/cli/tests/report/json-reporter.test.ts
import { describe, it, expect } from 'vitest';
import { buildJsonReport } from '../../src/report/json-reporter.js';
import { RunHistorySchema } from '@pw-doctor/shared';
import type { CheckResult } from '@pw-doctor/shared';

describe('buildJsonReport', () => {
  it('produces a valid RunHistory JSON', () => {
    const results: CheckResult[] = [
      {
        selector: {
          filePath: 'test.spec.ts', line: 1, column: 0,
          selectorValue: '.btn', selectorType: 'css', apiMethod: 'locator',
          isDynamic: false, contextCode: '', fragilityScore: 65,
        },
        status: 'broken',
      },
      {
        selector: {
          filePath: 'test.spec.ts', line: 5, column: 0,
          selectorValue: 'submit', selectorType: 'testid', apiMethod: 'getByTestId',
          isDynamic: false, contextCode: '', fragilityScore: 10,
        },
        status: 'healthy',
      },
    ];

    const report = buildJsonReport(results, 'cli');

    // Should validate against the schema
    const parsed = RunHistorySchema.parse(report);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.results.totalSelectors).toBe(2);
    expect(parsed.results.healthy).toBe(1);
    expect(parsed.results.broken).toBe(1);
    expect(parsed.trigger).toBe('cli');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/report/json-reporter.test.ts`
Expected: FAIL.

**Step 3: Implement JSON reporter**

```typescript
// packages/cli/src/report/json-reporter.ts
import crypto from 'node:crypto';
import type { CheckResult, RunHistory, TriggerSource } from '@pw-doctor/shared';
import { SCHEMA_VERSION } from '@pw-doctor/shared';

export function buildJsonReport(
  results: CheckResult[],
  trigger: TriggerSource,
  timing?: { checkMs: number },
): RunHistory {
  const healthy = results.filter((r) => r.status === 'healthy').length;
  const broken = results.filter((r) => r.status === 'broken').length;
  const skippedDynamic = results.filter(
    (r) => r.selector.isDynamic,
  ).length;

  return {
    schemaVersion: SCHEMA_VERSION as 1,
    runId: `pwd_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    trigger,
    config: {
      aiEnabled: false,
      autoApplyThreshold: 85,
    },
    git: null, // populated by caller if in a git repo
    results: {
      totalSelectors: results.length,
      healthy,
      broken,
      repaired: 0,
      verified: 0,
      rolledBack: 0,
      needsManualReview: 0,
      skippedDynamic,
    },
    repairs: [],
    timing: {
      totalMs: timing?.checkMs ?? 0,
      checkMs: timing?.checkMs ?? 0,
      repairMs: 0,
      verifyMs: 0,
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/report/json-reporter.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/cli/src/report/json-reporter.ts packages/cli/tests/report/json-reporter.test.ts
git commit -m "feat(cli): add JSON reporter with schema-versioned output"
```

---

### Task 9: CLI Skeleton — Commander Setup + Init Command

**Files:**
- Create: `packages/cli/src/bin/pw-doctor.ts`
- Create: `packages/cli/src/index.ts` (rewrite)
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/check.ts`

**Step 1: Create CLI entry point**

```typescript
// packages/cli/src/bin/pw-doctor.ts
#!/usr/bin/env node
import { createProgram } from '../index.js';

const program = createProgram();
program.parse();
```

**Step 2: Create commander program**

```typescript
// packages/cli/src/index.ts
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { checkCommand } from './commands/check.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('pw-doctor')
    .description('AI-powered Playwright test selector maintenance')
    .version('0.0.1');

  program.addCommand(initCommand());
  program.addCommand(checkCommand());

  return program;
}
```

**Step 3: Create init command**

```typescript
// packages/cli/src/commands/init.ts
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { extractSelectors } from '../core/selector-extractor.js';
import { enrichWithFragility } from '../core/fragility-scorer.js';
import { PW_DOCTOR_DIR, CONFIG_FILE_NAMES } from '@pw-doctor/shared';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize pw-doctor in a Playwright project')
    .action(async () => {
      const cwd = process.cwd();

      // 1. Find playwright config
      const playwrightConfig = findPlaywrightConfig(cwd);
      if (!playwrightConfig) {
        logger.error(
          'No playwright.config.{ts,js,mjs} found. Are you in a Playwright project?',
        );
        process.exit(2);
      }
      logger.success(`Found Playwright config: ${path.relative(cwd, playwrightConfig)}`);

      // 2. Check if already initialized
      const existingConfig = CONFIG_FILE_NAMES.find((name) =>
        fs.existsSync(path.join(cwd, name)),
      );
      if (existingConfig) {
        logger.warn(`Already initialized: ${existingConfig}`);
        return;
      }

      // 3. Detect test directory
      const testDir = detectTestDir(cwd);
      logger.info(`Test directory: ${testDir}`);

      // 4. Create config file
      const config = {
        testDir,
        testMatch: '**/*.spec.ts',
        repair: {
          maxFiles: 10,
          maxReplacementsPerFile: 5,
          autoApplyThreshold: 85,
          suggestThreshold: 50,
        },
        ai: { enabled: false },
        report: { format: 'json', outputDir: '.pw-doctor/reports' },
      };

      const configPath = path.join(cwd, '.pw-doctor.config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      logger.success(`Created ${path.relative(cwd, configPath)}`);

      // 5. Create .pw-doctor directory
      const pwDoctorDir = path.join(cwd, PW_DOCTOR_DIR);
      fs.mkdirSync(pwDoctorDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'reports'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'history', 'runs'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(pwDoctorDir, 'backups'), { recursive: true, mode: 0o700 });

      // 6. Add .pw-doctor/ to .gitignore
      ensureGitignore(cwd);

      // 7. Scan for selectors
      const testDirAbs = path.resolve(cwd, testDir);
      if (fs.existsSync(testDirAbs)) {
        const testFiles = findTestFiles(testDirAbs, '**/*.spec.ts');
        let allSelectors: ReturnType<typeof extractSelectors> = [];
        for (const file of testFiles) {
          try {
            const selectors = extractSelectors(file);
            allSelectors = allSelectors.concat(selectors);
          } catch {
            // Skip files that fail to parse
          }
        }
        allSelectors = enrichWithFragility(allSelectors);

        const fragile = allSelectors.filter((s) => s.fragilityScore >= 60);
        const dynamic = allSelectors.filter((s) => s.isDynamic);

        console.log('');
        console.log(
          chalk.bold(
            `Found ${allSelectors.length} selectors in ${testFiles.length} test files`,
          ),
        );
        if (fragile.length > 0) {
          console.log(
            chalk.yellow(`  ${fragile.length} fragile (score ≥ 60)`),
          );
        }
        if (dynamic.length > 0) {
          console.log(
            chalk.gray(`  ${dynamic.length} dynamic (cannot auto-repair)`),
          );
        }
        console.log('');
        console.log(`Run ${chalk.cyan('pw-doctor check')} to validate selectors against your live site.`);
      }
    });
}

function findPlaywrightConfig(cwd: string): string | null {
  const names = [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mjs',
  ];
  for (const name of names) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function detectTestDir(cwd: string): string {
  const candidates = ['tests', 'e2e', 'spec', 'test'];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(cwd, dir))) return `./${dir}`;
  }
  return './tests';
}

function ensureGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.pw-doctor')) {
      fs.appendFileSync(gitignorePath, '\n# PW-Doctor\n.pw-doctor/\n');
      logger.success('Added .pw-doctor/ to .gitignore');
    }
  }
}

function findTestFiles(dir: string, pattern: string): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}
```

**Step 4: Create check command (basic — extract + report, no live validation yet)**

```typescript
// packages/cli/src/commands/check.ts
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { extractSelectors } from '../core/selector-extractor.js';
import { enrichWithFragility } from '../core/fragility-scorer.js';
import { formatCheckResults } from '../report/terminal-reporter.js';
import { buildJsonReport } from '../report/json-reporter.js';
import { logger, setCIMode } from '../utils/logger.js';
import { EXIT_CODES, PW_DOCTOR_DIR } from '@pw-doctor/shared';
import type { CheckResult, TriggerSource } from '@pw-doctor/shared';

export function checkCommand(): Command {
  return new Command('check')
    .alias('validate')
    .description('Scan test files and report selector health')
    .option('--report <format>', 'Output report format (json|html|markdown)')
    .option('--filter <pattern>', 'Only check tests matching glob pattern')
    .option('--ci', 'CI mode: JSON output, no interactive prompts')
    .option('--fail-on-broken', 'Exit code 1 if any broken selectors found')
    .action(async (options) => {
      const cwd = process.cwd();
      if (options.ci) setCIMode(true);

      const trigger: TriggerSource = options.ci ? 'ci' : 'cli';

      // Load config
      let config;
      try {
        config = await loadConfig(cwd);
      } catch (err) {
        logger.error(`Invalid configuration: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(EXIT_CODES.TOOL_ERROR);
      }

      // Find test files
      const testDirAbs = path.resolve(cwd, config.testDir);
      if (!fs.existsSync(testDirAbs)) {
        logger.error(`Test directory not found: ${config.testDir}`);
        process.exit(EXIT_CODES.TOOL_ERROR);
      }

      const spinner = ora('Scanning test files...').start();

      const testFiles = findTestFiles(testDirAbs, config.testMatch);
      if (testFiles.length === 0) {
        spinner.warn('No test files found');
        process.exit(EXIT_CODES.HEALTHY);
      }

      spinner.text = `Extracting selectors from ${testFiles.length} files...`;

      // Extract selectors
      let allSelectors: ReturnType<typeof extractSelectors> = [];
      for (const file of testFiles) {
        try {
          const selectors = extractSelectors(file);
          allSelectors = allSelectors.concat(selectors);
        } catch (err) {
          logger.warn(
            `Failed to parse ${path.relative(cwd, file)}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      allSelectors = enrichWithFragility(allSelectors);
      spinner.succeed(`Found ${allSelectors.length} selectors in ${testFiles.length} files`);

      // For Phase 1: mark all selectors as "unknown" status
      // (live validation comes in Phase 2 when we hook into test execution)
      const startTime = Date.now();
      const results: CheckResult[] = allSelectors.map((selector) => ({
        selector,
        status: 'unknown' as const,
      }));
      const checkMs = Date.now() - startTime;

      // Display results
      if (!options.ci) {
        console.log(formatCheckResults(results));
      }

      // Build JSON report
      const report = buildJsonReport(results, trigger, { checkMs });

      // Write report if requested or in CI mode
      if (options.report === 'json' || options.ci) {
        const reportDir = path.resolve(cwd, config.report.outputDir);
        fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
        const reportPath = path.join(reportDir, 'latest.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), {
          mode: 0o600,
        });
        if (options.ci) {
          // In CI, output JSON to stdout
          console.log(JSON.stringify(report));
        } else {
          logger.info(`Report written to ${path.relative(cwd, reportPath)}`);
        }
      }

      // Save to history
      const historyDir = path.resolve(
        cwd,
        PW_DOCTOR_DIR,
        'history',
        'runs',
      );
      if (fs.existsSync(path.dirname(historyDir))) {
        fs.mkdirSync(historyDir, { recursive: true, mode: 0o700 });
        const historyPath = path.join(
          historyDir,
          `${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        );
        fs.writeFileSync(historyPath, JSON.stringify(report, null, 2), {
          mode: 0o600,
        });
      }

      // Exit code
      const broken = results.filter((r) => r.status === 'broken').length;
      if (broken > 0 && (options.failOnBroken || options.ci)) {
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }
      process.exit(EXIT_CODES.HEALTHY);
    });
}

function findTestFiles(dir: string, pattern: string): string[] {
  const files: string[] = [];
  const matchSuffix = pattern.includes('.spec.ts')
    ? '.spec.ts'
    : pattern.includes('.test.ts')
      ? '.test.ts'
      : '.spec.ts';

  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules'
      ) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(matchSuffix)) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}
```

**Step 5: Build and verify CLI runs**

Run: `npm run build && node packages/cli/dist/bin/pw-doctor.js --help`
Expected: Shows help output with init and check commands.

**Step 6: Commit**

```bash
git add packages/cli/src/
git commit -m "feat(cli): add pw-doctor CLI with init and check commands"
```

---

### Task 10: End-to-End Integration Test

**Files:**
- Create: `packages/cli/tests/e2e/check.test.ts`

**Step 1: Write E2E test**

```typescript
// packages/cli/tests/e2e/check.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

describe('pw-doctor check (E2E)', () => {
  let tmpDir: string;
  const cliBin = path.resolve(
    import.meta.dirname,
    '../../dist/bin/pw-doctor.js',
  );

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-e2e-'));

    // Create a fake Playwright project
    fs.writeFileSync(
      path.join(tmpDir, 'playwright.config.ts'),
      'export default { testDir: "./tests" };\n',
    );

    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'tests', 'example.spec.ts'),
      `import { test } from '@playwright/test';
test('demo', async ({ page }) => {
  await page.locator('.login-btn').click();
  await page.getByTestId('user-input').fill('hello');
  await page.getByRole('button', { name: 'Submit' }).click();
});
`,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('pw-doctor init creates config and scans selectors', () => {
    const result = execFileSync('node', [cliBin, 'init'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
    });

    expect(result).toContain('Found Playwright config');
    expect(result).toContain('3 selectors');
    expect(fs.existsSync(path.join(tmpDir, '.pw-doctor.config.json'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, '.pw-doctor'))).toBe(true);
  });

  it('pw-doctor check finds selectors and reports', () => {
    // Init first
    execFileSync('node', [cliBin, 'init'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
    });

    // Then check
    const result = execFileSync('node', [cliBin, 'check'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
    });

    expect(result).toContain('3 selectors');
    expect(result).toContain('.login-btn');
  });

  it('pw-doctor check --ci outputs JSON', () => {
    execFileSync('node', [cliBin, 'init'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env },
    });

    const result = execFileSync(
      'node',
      [cliBin, 'check', '--ci'],
      {
        cwd: tmpDir,
        encoding: 'utf-8',
        env: { ...process.env },
      },
    );

    // Last line should be valid JSON
    const lines = result.trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    const parsed = JSON.parse(jsonLine);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.results.totalSelectors).toBe(3);
  });
});
```

**Step 2: Build and run E2E tests**

Run: `npm run build && cd packages/cli && npx vitest run tests/e2e/check.test.ts`
Expected: All 3 E2E tests PASS.

**Step 3: Run full test suite**

Run: `cd packages/cli && npx vitest run`
Expected: All tests PASS (unit + E2E).

**Step 4: Commit**

```bash
git add packages/cli/tests/e2e/
git commit -m "test(cli): add E2E tests for init and check commands"
```

---

### Task 11: Final Wiring & Cleanup

**Step 1: Verify full build**

Run: `npm run build`
Expected: Clean build.

**Step 2: Verify all tests pass**

Run: `npm test`
Expected: All tests pass via Turborepo.

**Step 3: Test the CLI manually**

Run (from project root):
```bash
node packages/cli/dist/bin/pw-doctor.js --version
node packages/cli/dist/bin/pw-doctor.js --help
node packages/cli/dist/bin/pw-doctor.js init --help
node packages/cli/dist/bin/pw-doctor.js check --help
```
Expected: Version 0.0.1, help text for all commands.

**Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: Phase 1 complete — CLI foundation with AST extraction, fragility scoring, reporting"
```

---

## What Phase 1 Delivers

After completing these 11 tasks:

1. **Monorepo** — Turborepo with `cli` and `shared` packages, TypeScript strict, ESM
2. **Security baseline** — safe-exec (no shell injection), safe-path (no traversal), error-sanitizer (no leaked secrets), env var isolation, ESLint rules
3. **Config system** — cosmiconfig JSON/YAML only (no code eval), Zod validation, sensible defaults
4. **AST selector extractor** — Finds all Playwright locator patterns (locator, getByRole, getByTestId, getByText, getByLabel, getByPlaceholder, getByAltText, getByTitle, chained, frameLocator, dynamic)
5. **Fragility scorer** — Type-based scoring with structural penalties
6. **Terminal reporter** — Color-coded table with status and fragility
7. **JSON reporter** — Schema-versioned output for CI consumption
8. **`pw-doctor init`** — Auto-detects project, creates config, scans selectors
9. **`pw-doctor check`** — Extracts selectors, reports with exit codes
10. **E2E tests** — Full integration tests for init + check commands

## What Comes Next (Phase 2)

Phase 2 adds the heal loop: hook into Playwright test execution, capture DOM at failure points, run heuristic repair strategies, AST-patch fixes, verify by re-running tests, rollback on failure. That's where the real magic happens.
