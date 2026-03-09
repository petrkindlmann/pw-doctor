# Phase 3: AI Repair, Interactive Mode & Publish — Implementation Plan

> **Status:** IMPLEMENTED — All 16 tasks complete + 12 gap-fix tasks + 9 security fixes. 417 tests, 43 files.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered selector repair (Anthropic + OpenAI), live DOM capture via Playwright reporter, interactive mode, watch mode, and npm publish readiness.

**Architecture:** Bottom-up pipeline: DOM capture → redaction → AI adapter → integrate into heal → layer UX modes (interactive, watch, CI) → publish prep.

**Tech Stack:** TypeScript ESM, @anthropic-ai/sdk, openai, chokidar, cheerio, readline, zod

---

### Task 1: Update Shared Types and Schemas

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/constants.ts`
- Test: `packages/cli/tests/shared/types.test.ts`

**What to do:**

1. In `types.ts`, change `ai.provider` from `'anthropic'` to `'anthropic' | 'openai'`.

2. In `types.ts`, expand the `redact` section of `PwDoctorConfig`:
```typescript
redact: {
  preset: 'moderate' | 'strict' | 'minimal';
  patterns: RegExp[];
  stripAttributes: string[];
  preserveAttributes: string[];
  stripSelectors: string[];
  maxDepth: number;
  maxSize: number;
};
```

3. Add new interfaces to `types.ts`:
```typescript
export interface AiRepairInput {
  failedSelector: string;
  failedMethod: string;
  errorMessage: string;
  filePath: string;
  line: number;
  redactedHtml: string;
  contextCode: string;
}

export interface AiRepairResponse {
  candidates: Array<{
    selector: string;
    method: string;
    confidence: number;
    reasoning: string;
  }>;
  tokensUsed: number;
  provider: 'anthropic' | 'openai';
}
```

4. In `schemas.ts`, update `ConfigSchema.ai.provider` to `z.enum(['anthropic', 'openai']).default('anthropic')`.

5. In `schemas.ts`, update the `redact` section to match new type with defaults:
```typescript
redact: z.object({
  preset: z.enum(['moderate', 'strict', 'minimal']).default('moderate'),
  patterns: z.array(z.instanceof(RegExp)).default([]),
  stripAttributes: z.array(z.string()).default(['style', 'onclick', 'onload']),
  preserveAttributes: z.array(z.string()).default([]),
  stripSelectors: z.array(z.string()).default([]),
  maxDepth: z.number().default(20),
  maxSize: z.number().default(102400),
}).default({}),
```

6. In `constants.ts`, add:
```typescript
export const REDACT_SENSITIVE_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // emails
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,       // JWTs
  /sk-[A-Za-z0-9]{20,}/g,                                // OpenAI keys
  /sk-ant-[A-Za-z0-9-]{20,}/g,                           // Anthropic keys
  /pk_(live|test)_[A-Za-z0-9]{10,}/g,                    // Stripe keys
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, // UUIDs
] as const;

export const SELECTOR_RELEVANT_ATTRIBUTES = [
  'data-testid', 'data-test', 'data-cy',
  'role', 'aria-label', 'aria-labelledby', 'aria-describedby',
  'id', 'name', 'class', 'type', 'placeholder', 'alt', 'title',
  'href', 'for', 'value',
] as const;

export const PW_DOCTOR_CAPTURES_DIR = '.pw-doctor/captures';
```

7. Write a simple test that imports the new types and verifies schema defaults parse correctly.

8. Run `cd /Users/petr/projects/pw-doctor && npx turbo build` to verify types compile.

9. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

10. Commit: `git add packages/shared/src/ packages/cli/tests/shared/ && git commit -m "feat: update shared types for Phase 3 (AI providers, redaction config)"`

---

### Task 2: Playwright Fixture for DOM Capture

**Files:**
- Create: `packages/cli/src/reporter/pw-doctor-fixture.ts`
- Test: `packages/cli/tests/reporter/pw-doctor-fixture.test.ts`

**What to do:**

1. Create a Playwright test fixture that extends the base `test` from `@playwright/test`. On test failure, capture `page.content()` and attach it via `testInfo.attach('pw-doctor-dom', { body: html, contentType: 'text/html' })`.

```typescript
// packages/cli/src/reporter/pw-doctor-fixture.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    // After test completes, if failed, capture DOM
    if (testInfo.status === 'failed') {
      try {
        const html = await page.content();
        await testInfo.attach('pw-doctor-dom', {
          body: html,
          contentType: 'text/html',
        });
      } catch {
        // Page may be closed or crashed — skip capture
      }
    }
  },
});

export { expect } from '@playwright/test';
```

2. Write unit tests that verify:
   - The fixture exports `test` and `expect`
   - The module structure is correct (since we can't run real Playwright in unit tests, just verify the exports and types)

3. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

4. Commit: `git add packages/cli/src/reporter/ packages/cli/tests/reporter/ && git commit -m "feat: add Playwright fixture for DOM capture on failure"`

---

### Task 3: Playwright Reporter for Writing Captured HTML

**Files:**
- Create: `packages/cli/src/reporter/pw-doctor-reporter.ts`
- Test: `packages/cli/tests/reporter/pw-doctor-reporter.test.ts`

**What to do:**

1. Create a Playwright reporter that implements the `Reporter` interface. On `onTestEnd`, if the test failed, look for the `pw-doctor-dom` attachment and write it to `.pw-doctor/captures/<file-hash>-<test-hash>.html`.

```typescript
// packages/cli/src/reporter/pw-doctor-reporter.ts
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PW_DOCTOR_CAPTURES_DIR } from '@pw-doctor/shared';

function hashString(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

class PwDoctorReporter implements Reporter {
  private outputDir: string;

  constructor(options?: { outputDir?: string }) {
    this.outputDir = options?.outputDir ?? PW_DOCTOR_CAPTURES_DIR;
  }

  onBegin(): void {
    // Clear previous captures
    if (fs.existsSync(this.outputDir)) {
      fs.rmSync(this.outputDir, { recursive: true });
    }
    fs.mkdirSync(this.outputDir, { recursive: true, mode: 0o700 });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed') return;

    const attachment = result.attachments.find(
      (a) => a.name === 'pw-doctor-dom' && a.contentType === 'text/html',
    );
    if (!attachment?.body) return;

    const fileHash = hashString(test.location.file);
    const testHash = hashString(test.title);
    const filename = `${fileHash}-${testHash}.html`;
    const outputPath = path.join(this.outputDir, filename);

    fs.writeFileSync(outputPath, attachment.body, { mode: 0o600 });
  }
}

export default PwDoctorReporter;
```

2. Write unit tests:
   - `onBegin` creates the captures directory and clears old captures
   - `onTestEnd` with failed test + attachment writes HTML file
   - `onTestEnd` with passed test does nothing
   - `onTestEnd` with failed test but no attachment does nothing
   - File is named with correct hash pattern

3. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

4. Commit: `git add packages/cli/src/reporter/ packages/cli/tests/reporter/ && git commit -m "feat: add Playwright reporter for writing captured DOM to disk"`

---

### Task 4: DOM Redactor

**Files:**
- Create: `packages/cli/src/core/dom-redactor.ts`
- Test: `packages/cli/tests/core/dom-redactor.test.ts`

**What to do:**

1. Create `dom-redactor.ts` that uses cheerio to parse and sanitize HTML.

```typescript
import * as cheerio from 'cheerio';
import { REDACT_SENSITIVE_PATTERNS, SELECTOR_RELEVANT_ATTRIBUTES } from '@pw-doctor/shared';

export interface RedactionOptions {
  preset?: 'moderate' | 'strict' | 'minimal';
  stripAttributes?: string[];
  preserveAttributes?: string[];
  stripSelectors?: string[];
  customPatterns?: RegExp[];
  maxDepth?: number;
  maxSize?: number;
}

export interface RedactionResult {
  html: string;
  stats: {
    elementsRemoved: number;
    attributesStripped: number;
    patternsRedacted: number;
    truncated: boolean;
  };
}

export function redactHtml(html: string, options?: RedactionOptions): RedactionResult { ... }
```

2. Implement the redaction layers based on preset:

**Moderate (default):**
- Remove `<script>`, `<style>`, `<noscript>` tags entirely
- Remove HTML comments
- Strip `href`/`src`/`action` down to domain only (or `[REDACTED]` if no domain)
- Replace `<input type="password">` value with `[REDACTED]`
- Apply `REDACT_SENSITIVE_PATTERNS` regex to all text nodes and remaining attribute values
- Apply `stripAttributes` list (default: style, onclick, onload, onsubmit, etc.)
- Preserve `SELECTOR_RELEVANT_ATTRIBUTES`
- Apply `maxDepth` — flatten elements deeper than N levels
- Apply `maxSize` — truncate with `<!-- pw-doctor: truncated -->` if over limit

**Strict:**
- Everything in moderate PLUS:
- Strip ALL text content (replace with `[TEXT]`)
- Strip all attributes except `SELECTOR_RELEVANT_ATTRIBUTES`

**Minimal:**
- Only strip `<script>` and `<style>` tags

3. Write tests:
   - `redactHtml` strips script/style tags
   - Preserves data-testid, role, aria-label, class, id
   - Scrubs email patterns
   - Scrubs JWT patterns
   - Scrubs API key patterns
   - Respects maxSize truncation
   - Respects maxDepth flattening
   - Strict preset strips text content
   - Minimal preset only strips script/style
   - Custom stripSelectors removes matching elements
   - preserveAttributes override works

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/core/dom-redactor.ts packages/cli/tests/core/dom-redactor.test.ts && git commit -m "feat: add DOM redaction pipeline with moderate/strict/minimal presets"`

---

### Task 5: AI Adapter Interface and Prompt Builder

**Files:**
- Create: `packages/cli/src/ai/ai-adapter.ts`
- Create: `packages/cli/src/ai/prompt-builder.ts`
- Test: `packages/cli/tests/ai/prompt-builder.test.ts`

**What to do:**

1. Define the provider-agnostic interface in `ai-adapter.ts`:

```typescript
import type { AiRepairInput, AiRepairResponse } from '@pw-doctor/shared';

export interface AiRepairAdapter {
  readonly provider: 'anthropic' | 'openai';
  suggestRepair(input: AiRepairInput): Promise<AiRepairResponse>;
}

export class AiAdapterError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = 'AiAdapterError';
  }
}
```

2. Create `prompt-builder.ts` that builds the system prompt and user message for AI repair:

```typescript
import type { AiRepairInput } from '@pw-doctor/shared';

export interface BuiltPrompt {
  systemPrompt: string;
  userMessage: string;
}

export function buildRepairPrompt(input: AiRepairInput): BuiltPrompt { ... }
```

The system prompt should instruct the AI to:
- Act as a Playwright test selector repair expert
- Analyze the provided DOM HTML and failed selector
- Suggest 1-3 alternative selectors using Playwright's preferred methods (getByTestId > getByRole > getByText > locator)
- Return JSON matching a specific schema: `{ candidates: [{ selector, method, confidence, reasoning }] }`
- Never suggest CSS selectors with classes that look generated/dynamic
- Prefer semantic selectors (role, label, testid) over structural ones

The user message should include: failed selector, method, error message, relevant code context, and the redacted HTML.

3. Write tests for `buildRepairPrompt`:
   - Returns system prompt mentioning Playwright
   - Returns user message containing the failed selector
   - Returns user message containing the redacted HTML
   - User message includes code context
   - System prompt requests JSON output format

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/ai/ packages/cli/tests/ai/ && git commit -m "feat: add AI adapter interface and prompt builder"`

---

### Task 6: Anthropic Adapter Implementation

**Files:**
- Create: `packages/cli/src/ai/anthropic-adapter.ts`
- Test: `packages/cli/tests/ai/anthropic-adapter.test.ts`

**What to do:**

1. Install dependency: `cd /Users/petr/projects/pw-doctor/packages/cli && npm install @anthropic-ai/sdk`

2. Implement `AnthropicAdapter` that implements `AiRepairAdapter`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { AiRepairInput, AiRepairResponse } from '@pw-doctor/shared';
import type { AiRepairAdapter } from './ai-adapter.js';
import { AiAdapterError } from './ai-adapter.js';
import { buildRepairPrompt } from './prompt-builder.js';

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
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

      // Parse JSON from response (may be wrapped in markdown code block)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new AiAdapterError('No JSON found in AI response', 'anthropic', false);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      // Validate with zod here

      return {
        candidates: parsed.candidates.map((c: any) => ({
          selector: String(c.selector),
          method: String(c.method),
          confidence: Number(c.confidence),
          reasoning: String(c.reasoning),
        })),
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
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
```

3. Write unit tests that mock the Anthropic SDK:
   - Successful response is parsed correctly
   - JSON wrapped in markdown code blocks is extracted
   - Non-JSON response throws AiAdapterError with isRetryable=false
   - API 500 error throws AiAdapterError with isRetryable=true
   - API 401 error throws AiAdapterError with isRetryable=false
   - Token usage is summed correctly

   Use `vi.mock('@anthropic-ai/sdk')` to mock the SDK.

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/ai/anthropic-adapter.ts packages/cli/tests/ai/anthropic-adapter.test.ts package.json package-lock.json && git commit -m "feat: add Anthropic AI repair adapter"`

---

### Task 7: OpenAI Adapter Implementation

**Files:**
- Create: `packages/cli/src/ai/openai-adapter.ts`
- Test: `packages/cli/tests/ai/openai-adapter.test.ts`

**What to do:**

1. Install dependency: `cd /Users/petr/projects/pw-doctor/packages/cli && npm install openai`

2. Implement `OpenAiAdapter` that implements `AiRepairAdapter`:

```typescript
import OpenAI from 'openai';
import type { AiRepairInput, AiRepairResponse } from '@pw-doctor/shared';
import type { AiRepairAdapter } from './ai-adapter.js';
import { AiAdapterError } from './ai-adapter.js';
import { buildRepairPrompt } from './prompt-builder.js';

export interface OpenAiAdapterOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class OpenAiAdapter implements AiRepairAdapter {
  readonly provider = 'openai' as const;
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: OpenAiAdapterOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'gpt-4o';
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async suggestRepair(input: AiRepairInput): Promise<AiRepairResponse> {
    const { systemPrompt, userMessage } = buildRepairPrompt(input);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0]?.message?.content ?? '';
      const parsed = JSON.parse(text);

      return {
        candidates: parsed.candidates.map((c: any) => ({
          selector: String(c.selector),
          method: String(c.method),
          confidence: Number(c.confidence),
          reasoning: String(c.reasoning),
        })),
        tokensUsed: (response.usage?.total_tokens) ?? 0,
        provider: 'openai',
      };
    } catch (error) {
      if (error instanceof AiAdapterError) throw error;
      const isRetryable = error instanceof OpenAI.APIError && error.status >= 500;
      throw new AiAdapterError(
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
        'openai',
        isRetryable,
      );
    }
  }
}
```

3. Write unit tests that mock the OpenAI SDK (same pattern as Anthropic tests):
   - Successful response parsed correctly
   - Uses `response_format: { type: 'json_object' }` (no markdown extraction needed)
   - API errors wrapped correctly
   - Token usage extracted from response.usage

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/ai/openai-adapter.ts packages/cli/tests/ai/openai-adapter.test.ts package.json package-lock.json && git commit -m "feat: add OpenAI AI repair adapter"`

---

### Task 8: Integrate AI into Repair Pipeline

**Files:**
- Modify: `packages/cli/src/repair/repair-pipeline.ts`
- Create: `packages/cli/src/ai/create-adapter.ts`
- Modify: `packages/cli/tests/repair/repair-pipeline.test.ts`
- Test: `packages/cli/tests/ai/create-adapter.test.ts`

**What to do:**

1. Create `create-adapter.ts` factory:
```typescript
import type { AiRepairAdapter } from './ai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { OpenAiAdapter } from './openai-adapter.js';

export interface CreateAdapterOptions {
  provider: 'anthropic' | 'openai';
  model?: string;
  maxTokens?: number;
}

export function createAiAdapter(options: CreateAdapterOptions): AiRepairAdapter {
  const apiKey = options.provider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      `Missing ${options.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} environment variable. ` +
      'Run `pw-doctor credentials check` for help.',
    );
  }

  if (options.provider === 'anthropic') {
    return new AnthropicAdapter({ apiKey, model: options.model, maxTokens: options.maxTokens });
  }
  return new OpenAiAdapter({ apiKey, model: options.model, maxTokens: options.maxTokens });
}
```

2. Update `repair-pipeline.ts`:
   - Add optional `aiAdapter` parameter to `generateRepairCandidates` and `buildRepairPlan`
   - If `aiAdapter` is provided and `html` is non-empty, call `aiAdapter.suggestRepair()` and convert the response candidates to `RepairCandidate[]` with `strategy: 'ai'`
   - Merge AI candidates with heuristic candidates before ranking
   - Track token usage in the return type

3. Update `RepairPlan` type to include `aiTokensUsed?: number`.

4. Write tests:
   - `createAiAdapter` returns AnthropicAdapter when provider is 'anthropic' and env var set
   - `createAiAdapter` returns OpenAiAdapter when provider is 'openai' and env var set
   - `createAiAdapter` throws when env var missing
   - Repair pipeline with mock AI adapter merges AI candidates
   - Repair pipeline without AI adapter still works (existing tests pass)

5. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

6. Commit: `git add packages/cli/src/ai/ packages/cli/src/repair/ packages/cli/tests/ && git commit -m "feat: integrate AI repair into pipeline with adapter factory"`

---

### Task 9: Wire DOM Capture + AI + Redaction into Heal Command

**Files:**
- Modify: `packages/cli/src/commands/heal.ts`
- Modify: `packages/cli/tests/e2e/heal.test.ts`

**What to do:**

1. Update heal command to:
   - Read captured HTML from `.pw-doctor/captures/` for each failure (match by file hash + test hash)
   - If HTML found, run it through `redactHtml()` before passing to repair pipeline
   - If AI is enabled in config and env var is set, create adapter and pass to `buildRepairPlan`
   - Track total AI tokens used across all repairs
   - Add `--no-ai` flag to disable AI even if configured
   - Show AI token usage in summary

2. Add helper function to find captured HTML:
```typescript
function findCapturedHtml(capturesDir: string, file: string, testName: string): string | null {
  // Hash file and test name same way reporter does
  // Look for matching file in captures dir
  // Return contents or null
}
```

3. Update tests to verify:
   - Heal command reads from captures directory when available
   - Heal command works without captures (existing behavior)
   - `--no-ai` flag disables AI

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/commands/heal.ts packages/cli/tests/ && git commit -m "feat: wire DOM capture, redaction, and AI into heal command"`

---

### Task 10: Interactive Mode

**Files:**
- Create: `packages/cli/src/interactive/prompt.ts`
- Modify: `packages/cli/src/commands/heal.ts`
- Test: `packages/cli/tests/interactive/prompt.test.ts`

**What to do:**

1. Create `prompt.ts` with interactive candidate selection:

```typescript
import readline from 'node:readline';
import chalk from 'chalk';
import type { RankedCandidate } from '../repair/candidate-ranker.js';

export type InteractiveChoice =
  | { action: 'apply'; candidate: RankedCandidate }
  | { action: 'edit'; selector: string; method: string }
  | { action: 'skip' }
  | { action: 'quit' };

export async function promptForCandidate(
  failure: { file: string; line: number; selector: string },
  candidates: RankedCandidate[],
): Promise<InteractiveChoice> { ... }
```

2. Display format:
```
  login.spec.ts:15 — page.locator('.submit-btn')

  Candidates:
    1. getByRole('button', { name: 'Submit' })  [92% confidence, attribute_match]
    2. getByText('Submit')                        [75% confidence, text_match]
    3. getByTestId('submit-button')               [60% confidence, ai]

  [1-3] Apply candidate / [e] Edit manually / [s] Skip / [q] Quit all
  >
```

3. For `[e]dit`, prompt for selector and method:
```
  Enter method (getByRole/getByTestId/locator/etc): getByTestId
  Enter selector: my-custom-id
```

4. Add `--interactive` flag to heal command. When set, instead of auto-applying or dry-running, loop through each failure and call `promptForCandidate`. Interactive mode requires a TTY — error if stdin is not a TTY.

5. Write tests (mock readline):
   - Input '1' selects first candidate
   - Input 's' returns skip
   - Input 'q' returns quit
   - Input 'e' triggers edit flow
   - Non-TTY environment throws error

6. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

7. Commit: `git add packages/cli/src/interactive/ packages/cli/src/commands/heal.ts packages/cli/tests/interactive/ && git commit -m "feat: add interactive mode for per-candidate approve/edit/skip"`

---

### Task 11: Credentials Check Command

**Files:**
- Create: `packages/cli/src/commands/credentials.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/commands/credentials.test.ts`

**What to do:**

1. Create a `credentials` command with `check` subcommand:

```typescript
export function credentialsCommand(): Command {
  const cmd = new Command('credentials')
    .description('Manage AI provider credentials');

  cmd.addCommand(
    new Command('check')
      .description('Verify AI provider API keys are configured')
      .action(() => {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        console.log(chalk.bold('API Key Status:\n'));
        console.log(`  Anthropic (ANTHROPIC_API_KEY): ${anthropicKey ? chalk.green('Set') : chalk.red('Not set')}`);
        console.log(`  OpenAI    (OPENAI_API_KEY):    ${openaiKey ? chalk.green('Set') : chalk.red('Not set')}`);
        console.log('');

        if (!anthropicKey && !openaiKey) {
          console.log(chalk.yellow('No API keys configured. Set at least one:'));
          console.log(chalk.gray('  export ANTHROPIC_API_KEY=sk-ant-...'));
          console.log(chalk.gray('  export OPENAI_API_KEY=sk-...'));
          process.exit(1);
        }
      }),
  );

  return cmd;
}
```

2. Register in `index.ts`.

3. Write tests:
   - Shows "Set" when env var exists
   - Shows "Not set" when env var missing
   - Exits 1 when no keys configured
   - Exits 0 when at least one key set

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/commands/credentials.ts packages/cli/src/index.ts packages/cli/tests/commands/ && git commit -m "feat: add credentials check command"`

---

### Task 12: Watch Mode

**Files:**
- Create: `packages/cli/src/commands/watch.ts` (or add --watch flag to heal)
- Test: `packages/cli/tests/commands/watch.test.ts`

**What to do:**

1. Install chokidar: `cd /Users/petr/projects/pw-doctor/packages/cli && npm install chokidar`

2. Add `--watch` flag to the heal command. When set:
   - Use chokidar to watch for changes to files matching `config.testMatch` in `config.testDir`
   - On file change, debounce 500ms, then re-run heal for the changed file only (using `--max-files 1` equivalent)
   - Display a "Watching for changes..." message with the watched patterns
   - Ctrl+C to exit

```typescript
import { watch } from 'chokidar';

function startWatchMode(cwd: string, config: PwDoctorConfig, healOptions: HealOptions): void {
  const pattern = path.join(cwd, config.testDir, config.testMatch);
  console.log(chalk.cyan(`Watching ${pattern} for changes...`));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = watch(pattern, {
    ignoreInitial: true,
    ignored: /node_modules/,
  });

  watcher.on('change', (filePath) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(chalk.cyan(`\nChange detected: ${path.relative(cwd, filePath)}`));
      // Run heal for this specific file
      await runHealForFile(cwd, filePath, config, healOptions);
      console.log(chalk.cyan('\nWatching for changes...'));
    }, 500);
  });
}
```

3. Write tests (mock chokidar):
   - Watcher is created with correct pattern
   - File change triggers heal after debounce
   - node_modules is ignored

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/commands/ packages/cli/tests/commands/ package.json package-lock.json && git commit -m "feat: add watch mode for auto-healing on test file changes"`

---

### Task 13: CI Output Sanitization

**Files:**
- Modify: `packages/cli/src/utils/error-sanitizer.ts`
- Modify: `packages/cli/src/commands/heal.ts`
- Test: `packages/cli/tests/utils/error-sanitizer.test.ts`

**What to do:**

1. Extend `error-sanitizer.ts` with a `sanitizeOutput` function that scrubs all sensitive patterns from CLI output when in CI mode:
   - Apply `REDACT_SENSITIVE_PATTERNS` (same patterns as DOM redactor)
   - Strip file paths outside the project root (replace with relative paths)
   - Strip stack traces to essential info only

2. In heal command, when `--ci` is set:
   - Wrap all console output through sanitizeOutput
   - Output JSON summary instead of colored text
   - Include structured repair records in JSON output

3. Add tests:
   - sanitizeOutput replaces email patterns
   - sanitizeOutput replaces API key patterns
   - CI mode outputs valid JSON
   - CI JSON includes repair records

4. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/src/utils/ packages/cli/src/commands/ packages/cli/tests/ && git commit -m "feat: add CI output sanitization"`

---

### Task 14: npm Publish Prep

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/shared/package.json`
- Create: `packages/cli/src/reporter/index.ts` (re-exports fixture + reporter for users)

**What to do:**

1. Update `packages/cli/package.json`:
   - Add `"repository"`, `"author"`, `"homepage"`, `"bugs"` fields
   - Verify `"files"` array includes everything needed: `["dist", "README.md"]`
   - Add export for reporter: `"./reporter": { "types": "./dist/reporter/index.d.ts", "import": "./dist/reporter/index.js" }`
   - Ensure `"bin"` points to correct path
   - Move `@pw-doctor/shared` from dependency to bundled: add `"bundleDependencies": ["@pw-doctor/shared"]`

2. Create `packages/cli/src/reporter/index.ts`:
```typescript
export { test, expect } from './pw-doctor-fixture.js';
export { default as PwDoctorReporter } from './pw-doctor-reporter.js';
```
This lets users do:
```typescript
// In their test files
import { test, expect } from 'pw-doctor/reporter';
// In playwright.config.ts
reporter: [['pw-doctor/reporter']]
```

3. Verify the build produces correct output:
   - `cd /Users/petr/projects/pw-doctor && npx turbo build`
   - Check `packages/cli/dist/` has all expected files
   - `npm pack --dry-run` in packages/cli to verify package contents

4. Run all tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

5. Commit: `git add packages/cli/package.json packages/cli/src/reporter/index.ts packages/shared/package.json && git commit -m "feat: npm publish prep — exports, bundling, package metadata"`

---

### Task 15: Init Command Update

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Test: `packages/cli/tests/commands/init.test.ts` (or existing init tests)

**What to do:**

1. Update `pw-doctor init` to:
   - Detect if `playwright.config.ts` exists
   - If it does, suggest adding the pw-doctor reporter and fixture
   - Show the user what to add:
     ```
     Add to playwright.config.ts:
       reporter: [['default'], ['pw-doctor/reporter']]

     In your test files, replace:
       import { test, expect } from '@playwright/test';
     with:
       import { test, expect } from 'pw-doctor/reporter';
     ```
   - Add `ai.enabled: true` to default config when a provider key is detected in env

2. Write/update tests:
   - Init suggests reporter when playwright.config.ts exists
   - Init includes AI config when env var detected

3. Run tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

4. Commit: `git add packages/cli/src/commands/init.ts packages/cli/tests/ && git commit -m "feat: update init command to suggest reporter setup and AI config"`

---

### Task 16: Integration Test — Full AI Heal Loop

**Files:**
- Create: `packages/cli/tests/e2e/ai-heal.test.ts`

**What to do:**

1. Write an integration test that exercises the full pipeline:
   - Mock the AI adapter (don't call real APIs)
   - Provide sample captured HTML (write to .pw-doctor/captures/)
   - Run buildRepairPlan with HTML + mock AI adapter
   - Verify AI candidates are merged with heuristic candidates
   - Verify redaction was applied (check that the HTML passed to mock adapter has no scripts)
   - Verify AST patching works with AI-suggested selector
   - Verify token tracking

2. Write a test for interactive mode flow:
   - Mock readline to simulate user input
   - Verify candidate display format
   - Verify apply/skip/quit flows

3. Run all tests: `cd /Users/petr/projects/pw-doctor/packages/cli && npx vitest run`

4. Commit: `git add packages/cli/tests/e2e/ && git commit -m "test: add integration tests for full AI heal loop and interactive mode"`
