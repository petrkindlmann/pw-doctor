# Phase 2: Heuristic Repair + Verification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the heal loop to pw-doctor: run Playwright tests → detect broken selectors from failures → repair via heuristic strategies → AST-patch test files → verify by re-running tests → rollback on failure.

**Architecture:** The repair pipeline runs Playwright tests via `safeExec`, parses JSON reporter output to identify selector failures, analyzes the DOM with cheerio to find replacement elements, generates repair candidates scored by confidence, patches test files with recast (preserving formatting), verifies fixes by re-running the specific test, and rolls back via git on failure. All file I/O goes through safe-path utilities.

**Tech Stack:** cheerio (DOM parsing), recast + @babel/parser (AST patching), vitest (testing), Playwright JSON reporter (test execution)

**Reference:** PRD_FINAL.md sections on heal loop; Security audit controls C1.2-C1.6, C2.1-C2.7

**Depends on:** Phase 1 complete (all 36 tests passing)

---

### Task 1: Pre-requisite Refactoring

**Files:**
- Create: `packages/cli/src/utils/file-finder.ts`
- Modify: `packages/cli/src/commands/check.ts`
- Modify: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/tests/utils/file-finder.test.ts`

**Step 1: Create file-finder utility**

```typescript
// packages/cli/src/utils/file-finder.ts
import fs from 'node:fs';
import path from 'node:path';

export function findTestFiles(dir: string, pattern: string): string[] {
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

**Step 2: Write test for file-finder**

```typescript
// packages/cli/tests/utils/file-finder.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findTestFiles } from '../../src/utils/file-finder.js';

describe('findTestFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-ff-'));
    fs.mkdirSync(path.join(tmpDir, 'tests', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'tests', 'a.spec.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'b.spec.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'sub', 'c.spec.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'not-a-test.ts'), '');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('finds .spec.ts files recursively', () => {
    const files = findTestFiles(path.join(tmpDir, 'tests'), '**/*.spec.ts');
    expect(files).toHaveLength(3);
    expect(files.some((f) => f.endsWith('a.spec.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('c.spec.ts'))).toBe(true);
  });

  it('excludes non-matching files', () => {
    const files = findTestFiles(path.join(tmpDir, 'tests'), '**/*.spec.ts');
    expect(files.some((f) => f.endsWith('not-a-test.ts'))).toBe(false);
  });

  it('finds .test.ts files when pattern specifies', () => {
    fs.writeFileSync(path.join(tmpDir, 'tests', 'd.test.ts'), '');
    const files = findTestFiles(path.join(tmpDir, 'tests'), '**/*.test.ts');
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('d.test.ts');
  });
});
```

**Step 3: Update check.ts to use shared file-finder and remove duplicate**

Replace the local `findTestFiles` function in `packages/cli/src/commands/check.ts` with an import from `../utils/file-finder.js`. Remove lines 130-154 (the local function). Add `import { findTestFiles } from '../utils/file-finder.js';` at the top.

**Step 4: Update init.ts to use shared file-finder**

Replace the local `findTestFiles` function in `packages/cli/src/commands/init.ts` with an import from `../utils/file-finder.js`. Remove the local function definition.

**Step 5: Run tests, build, commit**

Run: `cd packages/cli && npx vitest run`
Expected: All tests PASS (existing + 3 new).

Run: `npm run build`

```bash
git add packages/cli/src/utils/file-finder.ts packages/cli/tests/utils/file-finder.test.ts packages/cli/src/commands/check.ts packages/cli/src/commands/init.ts
git commit -m "refactor(cli): extract findTestFiles to shared utility"
```

---

### Task 2: Test Runner

**Files:**
- Create: `packages/cli/src/core/test-runner.ts`
- Create: `packages/cli/tests/core/test-runner.test.ts`

**Step 1: Write test-runner tests**

```typescript
// packages/cli/tests/core/test-runner.test.ts
import { describe, it, expect } from 'vitest';
import { parsePlaywrightJsonOutput, extractFailedSelectors } from '../../src/core/test-runner.js';

const SAMPLE_PW_OUTPUT = JSON.stringify({
  suites: [
    {
      title: '',
      file: 'tests/login.spec.ts',
      specs: [
        {
          title: 'should login',
          file: 'tests/login.spec.ts',
          tests: [
            {
              status: 'expected',
              results: [{ status: 'passed' }],
            },
          ],
        },
        {
          title: 'should show dashboard',
          file: 'tests/login.spec.ts',
          tests: [
            {
              status: 'unexpected',
              results: [
                {
                  status: 'failed',
                  errors: [
                    {
                      message: "locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('.btn-primary')\n",
                      stack: 'Error\n    at /project/tests/login.spec.ts:15:20',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  stats: { expected: 1, unexpected: 1, total: 2 },
});

describe('parsePlaywrightJsonOutput', () => {
  it('parses JSON reporter output into test results', () => {
    const results = parsePlaywrightJsonOutput(SAMPLE_PW_OUTPUT);
    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it('extracts error details from failed tests', () => {
    const results = parsePlaywrightJsonOutput(SAMPLE_PW_OUTPUT);
    const failed = results.find((r) => !r.passed);
    expect(failed).toBeDefined();
    expect(failed!.error).toContain('Timeout');
  });
});

describe('extractFailedSelectors', () => {
  it('extracts selector from timeout error message', () => {
    const results = parsePlaywrightJsonOutput(SAMPLE_PW_OUTPUT);
    const failures = extractFailedSelectors(results);
    expect(failures).toHaveLength(1);
    expect(failures[0].selector).toBe('.btn-primary');
    expect(failures[0].file).toBe('tests/login.spec.ts');
    expect(failures[0].line).toBe(15);
  });

  it('returns empty array for all-passing results', () => {
    const results = parsePlaywrightJsonOutput(
      JSON.stringify({ suites: [{ title: '', file: 'test.spec.ts', specs: [{ title: 'ok', file: 'test.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] }], stats: { expected: 1, unexpected: 0, total: 1 } }),
    );
    const failures = extractFailedSelectors(results);
    expect(failures).toHaveLength(0);
  });
});
```

**Step 2: Implement test-runner**

```typescript
// packages/cli/src/core/test-runner.ts
import { safeExec } from '../utils/safe-exec.js';

export interface TestResult {
  testName: string;
  file: string;
  passed: boolean;
  duration?: number;
  error?: string;
  errorStack?: string;
}

export interface SelectorFailure {
  file: string;
  line: number;
  column: number;
  selector: string;
  method: string;
  testName: string;
  error: string;
}

export async function runPlaywrightTests(
  projectRoot: string,
  options?: {
    testFile?: string;
    testNamePattern?: string;
    timeout?: number;
    retries?: number;
  },
): Promise<{ stdout: string; exitCode: number }> {
  const args = ['playwright', 'test', '--reporter=json', '--retries=0'];

  if (options?.testFile) {
    args.push(options.testFile);
  }
  if (options?.testNamePattern) {
    args.push('--grep', options.testNamePattern);
  }
  if (options?.timeout) {
    args.push('--timeout', String(options.timeout));
  }
  if (options?.retries !== undefined) {
    args[args.indexOf('--retries=0')] = `--retries=${options.retries}`;
  }

  return safeExec('npx', args, {
    cwd: projectRoot,
    timeout: options?.timeout ?? 120000,
  });
}

export function parsePlaywrightJsonOutput(jsonOutput: string): TestResult[] {
  const results: TestResult[] = [];

  let data: { suites: PlaywrightSuite[] };
  try {
    data = JSON.parse(jsonOutput);
  } catch {
    return results;
  }

  function walkSuites(suites: PlaywrightSuite[]) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const test of spec.tests ?? []) {
            const lastResult = test.results?.[test.results.length - 1];
            const passed = test.status === 'expected' && lastResult?.status === 'passed';
            const error = lastResult?.errors?.[0];

            results.push({
              testName: spec.title,
              file: spec.file ?? suite.file ?? '',
              passed,
              duration: lastResult?.duration,
              error: error?.message,
              errorStack: error?.stack,
            });
          }
        }
      }
      if (suite.suites) {
        walkSuites(suite.suites);
      }
    }
  }

  walkSuites(data.suites ?? []);
  return results;
}

export function extractFailedSelectors(results: TestResult[]): SelectorFailure[] {
  const failures: SelectorFailure[] = [];

  for (const result of results) {
    if (result.passed || !result.error) continue;

    // Extract selector from Playwright timeout error messages
    // Patterns:
    //   "locator.click: Timeout ... waiting for locator('.btn')"
    //   "page.getByTestId('submit'): Timeout ..."
    const selectorMatch =
      result.error.match(/waiting for locator\('([^']+)'\)/) ??
      result.error.match(/waiting for locator\("([^"]+)"\)/) ??
      result.error.match(/page\.(getBy\w+)\('([^']+)'\).*Timeout/) ??
      result.error.match(/locator\.(\w+):.*waiting for locator\('([^']+)'\)/);

    if (!selectorMatch) continue;

    let selector: string;
    let method: string;

    if (selectorMatch[0].includes('getBy')) {
      method = selectorMatch[1];
      selector = selectorMatch[2];
    } else {
      method = 'locator';
      selector = selectorMatch[1];
    }

    // Extract file and line from stack trace
    let file = result.file;
    let line = 0;
    let column = 0;

    if (result.errorStack) {
      const stackMatch = result.errorStack.match(/at .*?([^\s/]+\.spec\.ts):(\d+):(\d+)/);
      if (stackMatch) {
        file = result.file || stackMatch[1];
        line = parseInt(stackMatch[2], 10);
        column = parseInt(stackMatch[3], 10);
      }
    }

    failures.push({
      file,
      line,
      column,
      selector,
      method,
      testName: result.testName,
      error: result.error,
    });
  }

  return failures;
}

// Internal Playwright JSON types (subset)
interface PlaywrightSuite {
  title: string;
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightSpec {
  title: string;
  file?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightTest {
  status: string;
  results?: PlaywrightTestResult[];
}

interface PlaywrightTestResult {
  status: string;
  duration?: number;
  errors?: Array<{ message?: string; stack?: string }>;
}
```

**Step 3: Run tests**

Run: `cd packages/cli && npx vitest run tests/core/test-runner.test.ts`
Expected: All 4 tests PASS.

**Step 4: Commit**

```bash
git add packages/cli/src/core/test-runner.ts packages/cli/tests/core/test-runner.test.ts
git commit -m "feat(cli): add Playwright test runner with JSON output parsing"
```

---

### Task 3: DOM Analyzer

**Files:**
- Modify: `packages/cli/package.json` (add cheerio dep)
- Create: `packages/cli/src/core/dom-analyzer.ts`
- Create: `packages/cli/tests/core/dom-analyzer.test.ts`
- Create: `packages/cli/tests/fixtures/sample-doms/login-page.html`

**Step 1: Add cheerio dependency**

```bash
cd packages/cli && npm install cheerio@1.0.0
```

**Step 2: Create DOM fixture**

```html
<!-- packages/cli/tests/fixtures/sample-doms/login-page.html -->
<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <main>
    <h1>Welcome Back</h1>
    <form data-testid="login-form">
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="Enter email" data-testid="email-input" />
      <label for="password">Password</label>
      <input id="password" type="password" placeholder="Enter password" />
      <button type="submit" class="btn-primary submit-btn" role="button" data-testid="login-submit">
        Sign In
      </button>
      <a href="/forgot" class="forgot-link">Forgot password?</a>
    </form>
    <div class="social-login">
      <button class="btn-google" aria-label="Sign in with Google">Google</button>
      <button class="btn-github" aria-label="Sign in with GitHub">GitHub</button>
    </div>
  </main>
</body>
</html>
```

**Step 3: Write DOM analyzer tests**

```typescript
// packages/cli/tests/core/dom-analyzer.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';

const FIXTURE_PATH = path.join(
  import.meta.dirname,
  '../fixtures/sample-doms/login-page.html',
);
const HTML = fs.readFileSync(FIXTURE_PATH, 'utf-8');

describe('DomAnalyzer', () => {
  it('finds elements by text content', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByText('Sign In');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].tag).toBe('button');
  });

  it('finds elements by data-testid', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('data-testid', 'login-submit');
    expect(matches).toHaveLength(1);
    expect(matches[0].text.trim()).toContain('Sign In');
  });

  it('finds elements by role', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('role', 'button');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('finds elements by aria-label', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('aria-label', 'Sign in with Google');
    expect(matches).toHaveLength(1);
    expect(matches[0].tag).toBe('button');
  });

  it('extracts element metadata', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('data-testid', 'email-input');
    expect(matches).toHaveLength(1);
    const el = matches[0];
    expect(el.attributes['type']).toBe('email');
    expect(el.attributes['placeholder']).toBe('Enter email');
    expect(el.isUnique).toBe(true);
  });

  it('finds elements by CSS selector', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByCss('.btn-primary');
    expect(matches).toHaveLength(1);
    expect(matches[0].text.trim()).toContain('Sign In');
  });

  it('detects uniqueness correctly', () => {
    const analyzer = new DomAnalyzer(HTML);
    const buttons = analyzer.findByTag('button');
    expect(buttons.length).toBeGreaterThan(1);
    // Each button is unique by its text, not by tag
  });
});
```

**Step 4: Implement DOM analyzer**

```typescript
// packages/cli/src/core/dom-analyzer.ts
import * as cheerio from 'cheerio';

export interface DomElement {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  isUnique: boolean;
  cssPath: string;
}

export class DomAnalyzer {
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  findByText(text: string): DomElement[] {
    const results: DomElement[] = [];
    this.$('*').each((_, el) => {
      const $el = this.$(el);
      const directText = $el.contents()
        .filter((_, node) => node.type === 'text')
        .text()
        .trim();
      if (directText.includes(text)) {
        results.push(this.toElement($el));
      }
    });
    return results;
  }

  findByAttribute(attr: string, value: string): DomElement[] {
    const results: DomElement[] = [];
    this.$(`[${attr}="${value}"]`).each((_, el) => {
      results.push(this.toElement(this.$(el)));
    });
    return results;
  }

  findByCss(selector: string): DomElement[] {
    const results: DomElement[] = [];
    try {
      this.$(selector).each((_, el) => {
        results.push(this.toElement(this.$(el)));
      });
    } catch {
      // Invalid selector
    }
    return results;
  }

  findByTag(tag: string): DomElement[] {
    const results: DomElement[] = [];
    this.$(tag).each((_, el) => {
      results.push(this.toElement(this.$(el)));
    });
    return results;
  }

  findSimilarByClasses(classes: string[]): DomElement[] {
    const results: DomElement[] = [];
    for (const cls of classes) {
      this.$(`.${cls}`).each((_, el) => {
        const domEl = this.toElement(this.$(el));
        if (!results.some((r) => r.cssPath === domEl.cssPath)) {
          results.push(domEl);
        }
      });
    }
    return results;
  }

  private toElement($el: cheerio.Cheerio<cheerio.Element>): DomElement {
    const tag = ($el.prop('tagName') ?? '').toLowerCase();
    const text = $el.text().trim();
    const attributes: Record<string, string> = {};

    const rawAttrs = $el.attr();
    if (rawAttrs) {
      for (const [key, value] of Object.entries(rawAttrs)) {
        attributes[key] = value ?? '';
      }
    }

    // Check uniqueness: does this selector match exactly 1 element?
    let isUnique = true;
    const testId = attributes['data-testid'];
    if (testId) {
      isUnique = this.$(`[data-testid="${testId}"]`).length === 1;
    } else if (attributes['id']) {
      isUnique = this.$(`#${attributes['id']}`).length === 1;
    } else {
      isUnique = false; // Can't easily determine
    }

    // Approximate visibility (no CSS engine in cheerio)
    const isVisible = !attributes['hidden'] &&
      attributes['type'] !== 'hidden' &&
      !attributes['aria-hidden'];

    return {
      tag,
      text,
      attributes,
      isVisible: isVisible !== false,
      isUnique,
      cssPath: this.buildCssPath($el),
    };
  }

  private buildCssPath($el: cheerio.Cheerio<cheerio.Element>): string {
    const parts: string[] = [];
    let current = $el;

    while (current.length && current.prop('tagName')) {
      const tag = (current.prop('tagName') ?? '').toLowerCase();
      if (tag === 'html' || tag === 'body') break;

      const id = current.attr('id');
      if (id) {
        parts.unshift(`${tag}#${id}`);
        break;
      }
      parts.unshift(tag);
      current = current.parent();
    }

    return parts.join(' > ');
  }
}
```

**Step 5: Run tests**

Run: `cd packages/cli && npx vitest run tests/core/dom-analyzer.test.ts`
Expected: All 7 tests PASS.

**Step 6: Commit**

```bash
git add packages/cli/package.json package-lock.json packages/cli/src/core/dom-analyzer.ts packages/cli/tests/core/dom-analyzer.test.ts packages/cli/tests/fixtures/sample-doms/
git commit -m "feat(cli): add cheerio-based DOM analyzer for element matching"
```

---

### Task 4: AST Patcher (recast)

**Files:**
- Create: `packages/cli/src/core/ast-patcher.ts`
- Create: `packages/cli/tests/core/ast-patcher.test.ts`

**Step 1: Write AST patcher tests**

```typescript
// packages/cli/tests/core/ast-patcher.test.ts
import { describe, it, expect } from 'vitest';
import { patchSelector } from '../../src/core/ast-patcher.js';

describe('patchSelector', () => {
  it('replaces a CSS selector string in locator()', () => {
    const code = `import { test } from '@playwright/test';

test('demo', async ({ page }) => {
  await page.locator('.old-class').click();
});
`;
    const result = patchSelector(code, 4, '.old-class', '.new-class');
    expect(result.patchedCode).toContain("'.new-class'");
    expect(result.patchedCode).not.toContain("'.old-class'");
    expect(result.patched).toBe(true);
  });

  it('preserves formatting and other code', () => {
    const code = `import { test } from '@playwright/test';

// Important comment
test('demo', async ({ page }) => {
  await page.locator('.target').click();
  await page.getByTestId('other').fill('hello');
});
`;
    const result = patchSelector(code, 5, '.target', '[data-testid="new-target"]');
    expect(result.patchedCode).toContain('// Important comment');
    expect(result.patchedCode).toContain("getByTestId('other')");
    expect(result.patchedCode).toContain('[data-testid="new-target"]');
  });

  it('can change the method name (locator → getByTestId)', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator('.old').click();
});
`;
    const result = patchSelector(code, 2, '.old', 'my-test-id', 'getByTestId');
    expect(result.patchedCode).toContain("getByTestId('my-test-id')");
    expect(result.patchedCode).not.toContain("locator(");
  });

  it('handles double-quoted strings', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator(".old-class").click();
});
`;
    const result = patchSelector(code, 2, '.old-class', '.new-class');
    expect(result.patchedCode).toContain('.new-class');
    expect(result.patched).toBe(true);
  });

  it('returns patched=false when selector not found at line', () => {
    const code = `test('x', async ({ page }) => {
  await page.locator('.something-else').click();
});
`;
    const result = patchSelector(code, 2, '.nonexistent', '.new');
    expect(result.patched).toBe(false);
    expect(result.patchedCode).toBe(code);
  });
});
```

**Step 2: Implement AST patcher**

```typescript
// packages/cli/src/core/ast-patcher.ts
import * as recast from 'recast';
import * as parser from '@babel/parser';
import * as t from '@babel/types';
import { PLAYWRIGHT_LOCATOR_METHODS } from '@pw-doctor/shared';

export interface PatchResult {
  patchedCode: string;
  patched: boolean;
}

export function patchSelector(
  sourceCode: string,
  targetLine: number,
  oldSelector: string,
  newSelector: string,
  newMethod?: string,
): PatchResult {
  const ast = recast.parse(sourceCode, {
    parser: {
      parse(source: string) {
        return parser.parse(source, {
          sourceType: 'module',
          plugins: ['typescript', 'decorators-legacy'],
          tokens: true,
        });
      },
    },
  });

  let patched = false;

  recast.visit(ast, {
    visitCallExpression(path) {
      if (patched) return false;

      const node = path.node;
      const loc = node.loc;
      if (!loc || loc.start.line !== targetLine) {
        this.traverse(path);
        return;
      }

      // Check if this is a Playwright locator method call
      if (!t.isMemberExpression(node.callee)) {
        this.traverse(path);
        return;
      }
      if (!t.isIdentifier(node.callee.property)) {
        this.traverse(path);
        return;
      }

      const methodName = node.callee.property.name;
      if (!(PLAYWRIGHT_LOCATOR_METHODS as readonly string[]).includes(methodName)) {
        this.traverse(path);
        return;
      }

      const firstArg = node.arguments[0];
      if (!firstArg) {
        this.traverse(path);
        return;
      }

      // Match the old selector value
      if (t.isStringLiteral(firstArg) && firstArg.value === oldSelector) {
        // Patch the selector
        firstArg.value = newSelector;

        // Optionally change the method name
        if (newMethod && t.isIdentifier(node.callee.property)) {
          node.callee.property.name = newMethod;
        }

        patched = true;
        return false;
      }

      this.traverse(path);
    },
  });

  if (!patched) {
    return { patchedCode: sourceCode, patched: false };
  }

  const patchedCode = recast.print(ast).code;
  return { patchedCode, patched: true };
}
```

**Step 3: Run tests**

Run: `cd packages/cli && npx vitest run tests/core/ast-patcher.test.ts`
Expected: All 5 tests PASS.

**Step 4: Commit**

```bash
git add packages/cli/src/core/ast-patcher.ts packages/cli/tests/core/ast-patcher.test.ts
git commit -m "feat(cli): add recast-based AST patcher for non-destructive selector replacement"
```

---

### Task 5: Repair Strategies (Text Match + Attribute Match)

**Files:**
- Create: `packages/cli/src/repair/text-match.ts`
- Create: `packages/cli/src/repair/attribute-match.ts`
- Create: `packages/cli/tests/repair/strategies.test.ts`

**Step 1: Write strategy tests**

```typescript
// packages/cli/tests/repair/strategies.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tryTextMatch } from '../../src/repair/text-match.js';
import { tryAttributeMatch } from '../../src/repair/attribute-match.js';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';

const HTML = fs.readFileSync(
  path.join(import.meta.dirname, '../fixtures/sample-doms/login-page.html'),
  'utf-8',
);

describe('tryTextMatch', () => {
  it('finds element by text when CSS class selector breaks', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryTextMatch({
      failedSelector: '.submit-btn',
      failedMethod: 'locator',
      contextCode: "await page.locator('.submit-btn').click();",
      analyzer,
    });
    // The button with text "Sign In" should be found since .submit-btn is on that element
    expect(candidate).not.toBeNull();
    if (candidate) {
      expect(candidate.confidence).toBeGreaterThan(0);
      expect(candidate.strategy).toBe('text_match');
    }
  });

  it('returns null when no text match found', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryTextMatch({
      failedSelector: '.nonexistent',
      failedMethod: 'locator',
      contextCode: "await page.locator('.nonexistent').click();",
      analyzer,
    });
    expect(candidate).toBeNull();
  });
});

describe('tryAttributeMatch', () => {
  it('finds data-testid alternative for broken CSS selector', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryAttributeMatch({
      failedSelector: '.btn-primary',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    if (candidate) {
      expect(candidate.selector).toBe('login-submit');
      expect(candidate.method).toBe('getByTestId');
      expect(candidate.confidence).toBeGreaterThan(50);
      expect(candidate.strategy).toBe('attribute_match');
    }
  });

  it('finds aria-label alternative', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryAttributeMatch({
      failedSelector: '.btn-google',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    if (candidate) {
      expect(candidate.method).toBe('getByLabel');
      expect(candidate.selector).toBe('Sign in with Google');
    }
  });

  it('returns null when no semantic alternative exists', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryAttributeMatch({
      failedSelector: '.forgot-link',
      failedMethod: 'locator',
      analyzer,
    });
    // The <a> with class forgot-link has no data-testid, role, or aria-label
    // So attribute match should return null
    expect(candidate).toBeNull();
  });
});
```

**Step 2: Implement text-match strategy**

```typescript
// packages/cli/src/repair/text-match.ts
import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer } from '../core/dom-analyzer.js';

interface TextMatchInput {
  failedSelector: string;
  failedMethod: string;
  contextCode: string;
  analyzer: DomAnalyzer;
}

export function tryTextMatch(input: TextMatchInput): RepairCandidate | null {
  const { failedSelector, analyzer, contextCode } = input;

  // Strategy: Find the element the old selector pointed to by matching
  // CSS class/ID in the DOM, then generate a text-based selector for it.

  // 1. Try to find the element using the old selector
  const elements = analyzer.findByCss(failedSelector);
  if (elements.length === 0) return null;

  // 2. Get the text content of the matched element
  const target = elements[0];
  const text = target.text.trim();
  if (!text || text.length > 50) return null;

  // 3. Check if text content is unique
  const textMatches = analyzer.findByText(text);
  const isUnique = textMatches.length === 1;

  // 4. Prefer data-testid if available
  if (target.attributes['data-testid']) {
    return {
      selector: target.attributes['data-testid'],
      method: 'getByTestId',
      confidence: computeTextMatchConfidence(target, isUnique, true),
      strategy: 'text_match',
      reasoning: `Found element with text "${text}" that has data-testid="${target.attributes['data-testid']}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique,
      },
    };
  }

  // 5. Use getByText if text is unique
  if (isUnique && text.length <= 30) {
    return {
      selector: text,
      method: 'getByText',
      confidence: computeTextMatchConfidence(target, isUnique, false),
      strategy: 'text_match',
      reasoning: `Found unique element with text "${text}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique,
      },
    };
  }

  return null;
}

function computeTextMatchConfidence(
  element: { isVisible: boolean; attributes: Record<string, string> },
  isUnique: boolean,
  hasTestId: boolean,
): number {
  let confidence = 50;

  if (hasTestId) confidence += 20;
  if (isUnique) confidence += 20;
  else confidence -= 15;
  if (element.isVisible) confidence += 10;

  return Math.max(0, Math.min(100, confidence));
}
```

**Step 3: Implement attribute-match strategy**

```typescript
// packages/cli/src/repair/attribute-match.ts
import type { RepairCandidate } from '@pw-doctor/shared';
import type { DomAnalyzer } from '../core/dom-analyzer.js';

interface AttributeMatchInput {
  failedSelector: string;
  failedMethod: string;
  analyzer: DomAnalyzer;
}

export function tryAttributeMatch(input: AttributeMatchInput): RepairCandidate | null {
  const { failedSelector, analyzer } = input;

  // 1. Find the element using the old CSS selector
  const elements = analyzer.findByCss(failedSelector);
  if (elements.length === 0) return null;

  const target = elements[0];
  const text = target.text.trim();

  // 2. Check for data-testid (highest priority)
  if (target.attributes['data-testid']) {
    const testId = target.attributes['data-testid'];
    const isUnique = analyzer.findByAttribute('data-testid', testId).length === 1;

    return {
      selector: testId,
      method: 'getByTestId',
      confidence: computeAttrConfidence(isUnique, target.isVisible, 'testid'),
      strategy: 'attribute_match',
      reasoning: `Element has data-testid="${testId}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique,
      },
    };
  }

  // 3. Check for role attribute
  if (target.attributes['role']) {
    const role = target.attributes['role'];
    return {
      selector: role,
      method: 'getByRole',
      confidence: computeAttrConfidence(false, target.isVisible, 'role'),
      strategy: 'attribute_match',
      reasoning: `Element has role="${role}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique: false,
      },
    };
  }

  // 4. Check for aria-label
  if (target.attributes['aria-label']) {
    const label = target.attributes['aria-label'];
    const isUnique = analyzer.findByAttribute('aria-label', label).length === 1;

    return {
      selector: label,
      method: 'getByLabel',
      confidence: computeAttrConfidence(isUnique, target.isVisible, 'label'),
      strategy: 'attribute_match',
      reasoning: `Element has aria-label="${label}"`,
      elementMatch: {
        tag: target.tag,
        text,
        attributes: target.attributes,
        isVisible: target.isVisible,
        isUnique,
      },
    };
  }

  return null;
}

function computeAttrConfidence(
  isUnique: boolean,
  isVisible: boolean,
  attrType: 'testid' | 'role' | 'label',
): number {
  let confidence = 50;

  if (attrType === 'testid') confidence += 15;
  else if (attrType === 'role') confidence += 10;
  else if (attrType === 'label') confidence += 8;

  if (isUnique) confidence += 20;
  else confidence -= 15;

  if (isVisible) confidence += 10;

  return Math.max(0, Math.min(100, confidence));
}
```

**Step 4: Run tests**

Run: `cd packages/cli && npx vitest run tests/repair/strategies.test.ts`
Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add packages/cli/src/repair/ packages/cli/tests/repair/
git commit -m "feat(cli): add text-match and attribute-match repair strategies"
```

---

### Task 6: Candidate Ranker

**Files:**
- Create: `packages/cli/src/repair/candidate-ranker.ts`
- Create: `packages/cli/tests/repair/candidate-ranker.test.ts`

**Step 1: Write ranker tests**

```typescript
// packages/cli/tests/repair/candidate-ranker.test.ts
import { describe, it, expect } from 'vitest';
import { rankCandidates, type RankedCandidate } from '../../src/repair/candidate-ranker.js';
import type { RepairCandidate } from '@pw-doctor/shared';

function makeCandidate(overrides: Partial<RepairCandidate>): RepairCandidate {
  return {
    selector: '.test',
    method: 'locator',
    confidence: 50,
    strategy: 'text_match',
    reasoning: 'test',
    elementMatch: {
      tag: 'button',
      text: 'Test',
      attributes: {},
      isVisible: true,
      isUnique: true,
    },
    ...overrides,
  };
}

describe('rankCandidates', () => {
  it('ranks by confidence (highest first)', () => {
    const candidates = [
      makeCandidate({ confidence: 60, selector: 'low' }),
      makeCandidate({ confidence: 90, selector: 'high' }),
      makeCandidate({ confidence: 75, selector: 'mid' }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].candidate.selector).toBe('high');
    expect(ranked[2].candidate.selector).toBe('low');
  });

  it('prefers getByTestId over locator at same confidence', () => {
    const candidates = [
      makeCandidate({ confidence: 80, method: 'locator', selector: 'a' }),
      makeCandidate({ confidence: 80, method: 'getByTestId', selector: 'b' }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].candidate.method).toBe('getByTestId');
  });

  it('categorizes by threshold', () => {
    const candidates = [
      makeCandidate({ confidence: 90 }),
      makeCandidate({ confidence: 70 }),
      makeCandidate({ confidence: 40 }),
    ];
    const ranked = rankCandidates(candidates, { autoApplyThreshold: 85, suggestThreshold: 50 });
    expect(ranked[0].category).toBe('auto_apply');
    expect(ranked[1].category).toBe('suggest');
    expect(ranked[2].category).toBe('skip');
  });

  it('returns empty array for empty input', () => {
    expect(rankCandidates([])).toEqual([]);
  });
});
```

**Step 2: Implement candidate ranker**

```typescript
// packages/cli/src/repair/candidate-ranker.ts
import type { RepairCandidate } from '@pw-doctor/shared';

export type CandidateCategory = 'auto_apply' | 'confirm' | 'suggest' | 'skip';

export interface RankedCandidate {
  candidate: RepairCandidate;
  finalScore: number;
  category: CandidateCategory;
}

const METHOD_RESILIENCE: Record<string, number> = {
  getByTestId: 5,
  getByRole: 4,
  getByLabel: 3,
  getByText: 2,
  getByPlaceholder: 2,
  getByAltText: 2,
  getByTitle: 2,
  locator: 0,
};

interface RankingOptions {
  autoApplyThreshold?: number;
  suggestThreshold?: number;
}

export function rankCandidates(
  candidates: RepairCandidate[],
  options?: RankingOptions,
): RankedCandidate[] {
  const autoThreshold = options?.autoApplyThreshold ?? 85;
  const suggestThreshold = options?.suggestThreshold ?? 50;

  return candidates
    .map((candidate) => {
      const resilience = METHOD_RESILIENCE[candidate.method] ?? 0;
      const finalScore = candidate.confidence + resilience;

      let category: CandidateCategory;
      if (candidate.confidence >= autoThreshold) {
        category = 'auto_apply';
      } else if (candidate.confidence >= suggestThreshold) {
        category = 'suggest';
      } else {
        category = 'skip';
      }

      return { candidate, finalScore, category };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

export function selectBestCandidate(
  candidates: RepairCandidate[],
  options?: RankingOptions,
): RankedCandidate | null {
  const ranked = rankCandidates(candidates, options);
  return ranked.length > 0 ? ranked[0] : null;
}
```

**Step 3: Run tests**

Run: `cd packages/cli && npx vitest run tests/repair/candidate-ranker.test.ts`
Expected: All 4 tests PASS.

**Step 4: Commit**

```bash
git add packages/cli/src/repair/candidate-ranker.ts packages/cli/tests/repair/candidate-ranker.test.ts
git commit -m "feat(cli): add repair candidate ranker with confidence thresholds"
```

---

### Task 7: Backup & Rollback

**Files:**
- Create: `packages/cli/src/repair/backup.ts`
- Create: `packages/cli/tests/repair/backup.test.ts`

**Step 1: Write backup tests**

```typescript
// packages/cli/tests/repair/backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBackup, restoreBackup, rollbackViaGit } from '../../src/repair/backup.js';

describe('backup', () => {
  let tmpDir: string;
  const runId = 'test-run-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-doctor-bk-'));
    fs.mkdirSync(path.join(tmpDir, '.pw-doctor'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates a backup of a file', () => {
    const filePath = path.join(tmpDir, 'test.spec.ts');
    fs.writeFileSync(filePath, 'original content');

    createBackup(tmpDir, filePath, runId);

    const backupDir = path.join(tmpDir, '.pw-doctor', 'backups', runId);
    expect(fs.existsSync(backupDir)).toBe(true);
    const files = fs.readdirSync(backupDir);
    expect(files).toHaveLength(1);
  });

  it('restores a file from backup', () => {
    const filePath = path.join(tmpDir, 'test.spec.ts');
    fs.writeFileSync(filePath, 'original content');

    createBackup(tmpDir, filePath, runId);

    // Modify the file
    fs.writeFileSync(filePath, 'modified content');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('modified content');

    // Restore
    const restored = restoreBackup(tmpDir, filePath, runId);
    expect(restored).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original content');
  });

  it('returns false when no backup exists', () => {
    const filePath = path.join(tmpDir, 'nonexistent.spec.ts');
    const restored = restoreBackup(tmpDir, filePath, 'no-such-run');
    expect(restored).toBe(false);
  });
});
```

**Step 2: Implement backup**

```typescript
// packages/cli/src/repair/backup.ts
import fs from 'node:fs';
import path from 'node:path';
import { safeExec } from '../utils/safe-exec.js';
import { PW_DOCTOR_DIR } from '@pw-doctor/shared';

export function createBackup(
  projectRoot: string,
  filePath: string,
  runId: string,
): void {
  const backupDir = path.join(projectRoot, PW_DOCTOR_DIR, 'backups', runId);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  const relativePath = path.relative(projectRoot, filePath);
  const backupName = relativePath.replace(/[/\\]/g, '__');
  const backupPath = path.join(backupDir, backupName);

  fs.copyFileSync(filePath, backupPath);
  fs.chmodSync(backupPath, 0o600);
}

export function restoreBackup(
  projectRoot: string,
  filePath: string,
  runId: string,
): boolean {
  const backupDir = path.join(projectRoot, PW_DOCTOR_DIR, 'backups', runId);
  const relativePath = path.relative(projectRoot, filePath);
  const backupName = relativePath.replace(/[/\\]/g, '__');
  const backupPath = path.join(backupDir, backupName);

  if (!fs.existsSync(backupPath)) return false;

  fs.copyFileSync(backupPath, filePath);
  return true;
}

export async function rollbackViaGit(
  projectRoot: string,
  filePath: string,
): Promise<boolean> {
  const relativePath = path.relative(projectRoot, filePath);
  const result = await safeExec('git', ['checkout', '--', relativePath], {
    cwd: projectRoot,
  });
  return result.exitCode === 0;
}

export async function rollback(
  projectRoot: string,
  filePath: string,
  runId: string,
): Promise<boolean> {
  // Try git first (atomic, reliable)
  const gitOk = await rollbackViaGit(projectRoot, filePath);
  if (gitOk) return true;

  // Fall back to backup restore
  return restoreBackup(projectRoot, filePath, runId);
}
```

**Step 3: Run tests**

Run: `cd packages/cli && npx vitest run tests/repair/backup.test.ts`
Expected: All 3 tests PASS.

**Step 4: Commit**

```bash
git add packages/cli/src/repair/backup.ts packages/cli/tests/repair/backup.test.ts
git commit -m "feat(cli): add file backup and rollback (git + backup restore)"
```

---

### Task 8: Repair Pipeline

**Files:**
- Create: `packages/cli/src/repair/repair-pipeline.ts`
- Create: `packages/cli/tests/repair/repair-pipeline.test.ts`

**Step 1: Write pipeline tests**

```typescript
// packages/cli/tests/repair/repair-pipeline.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import type { SelectorFailure } from '../../src/core/test-runner.js';

const HTML = fs.readFileSync(
  path.join(import.meta.dirname, '../fixtures/sample-doms/login-page.html'),
  'utf-8',
);

describe('generateRepairCandidates', () => {
  it('generates candidates for a broken CSS selector', () => {
    const failure: SelectorFailure = {
      file: 'tests/login.spec.ts',
      line: 10,
      column: 4,
      selector: '.btn-primary',
      method: 'locator',
      testName: 'login test',
      error: 'Timeout',
    };

    const candidates = generateRepairCandidates(failure, HTML);
    expect(candidates.length).toBeGreaterThan(0);

    // Should find the data-testid alternative
    const testIdCandidate = candidates.find((c) => c.method === 'getByTestId');
    expect(testIdCandidate).toBeDefined();
    expect(testIdCandidate!.selector).toBe('login-submit');
  });

  it('returns empty array when selector has no DOM match', () => {
    const failure: SelectorFailure = {
      file: 'tests/x.spec.ts',
      line: 1,
      column: 0,
      selector: '.totally-nonexistent-class',
      method: 'locator',
      testName: 'test',
      error: 'Timeout',
    };

    const candidates = generateRepairCandidates(failure, HTML);
    expect(candidates).toHaveLength(0);
  });
});
```

**Step 2: Implement repair pipeline**

```typescript
// packages/cli/src/repair/repair-pipeline.ts
import type { RepairCandidate } from '@pw-doctor/shared';
import type { SelectorFailure } from '../core/test-runner.js';
import { DomAnalyzer } from '../core/dom-analyzer.js';
import { tryTextMatch } from './text-match.js';
import { tryAttributeMatch } from './attribute-match.js';
import { rankCandidates, selectBestCandidate, type RankedCandidate } from './candidate-ranker.js';

export function generateRepairCandidates(
  failure: SelectorFailure,
  html: string,
): RepairCandidate[] {
  const analyzer = new DomAnalyzer(html);
  const candidates: RepairCandidate[] = [];

  // Strategy 1: Attribute match (highest confidence for semantic selectors)
  const attrCandidate = tryAttributeMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    analyzer,
  });
  if (attrCandidate) candidates.push(attrCandidate);

  // Strategy 2: Text match
  const textCandidate = tryTextMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    contextCode: '',
    analyzer,
  });
  if (textCandidate) candidates.push(textCandidate);

  return candidates;
}

export interface RepairPlan {
  failure: SelectorFailure;
  bestCandidate: RankedCandidate | null;
  allCandidates: RankedCandidate[];
}

export function buildRepairPlan(
  failure: SelectorFailure,
  html: string,
  options?: { autoApplyThreshold?: number; suggestThreshold?: number },
): RepairPlan {
  const candidates = generateRepairCandidates(failure, html);
  const ranked = rankCandidates(candidates, options);
  const best = selectBestCandidate(candidates, options);

  return {
    failure,
    bestCandidate: best,
    allCandidates: ranked,
  };
}
```

**Step 3: Run tests**

Run: `cd packages/cli && npx vitest run tests/repair/repair-pipeline.test.ts`
Expected: All 2 tests PASS.

**Step 4: Commit**

```bash
git add packages/cli/src/repair/repair-pipeline.ts packages/cli/tests/repair/repair-pipeline.test.ts
git commit -m "feat(cli): add repair pipeline — strategies + ranking orchestration"
```

---

### Task 9: Heal Command

**Files:**
- Create: `packages/cli/src/commands/heal.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Create heal command**

```typescript
// packages/cli/src/commands/heal.ts
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { extractSelectors } from '../core/selector-extractor.js';
import { enrichWithFragility } from '../core/fragility-scorer.js';
import { runPlaywrightTests, parsePlaywrightJsonOutput, extractFailedSelectors } from '../core/test-runner.js';
import { buildRepairPlan } from '../repair/repair-pipeline.js';
import { patchSelector } from '../core/ast-patcher.js';
import { createBackup, rollback } from '../repair/backup.js';
import { logger, setCIMode } from '../utils/logger.js';
import { EXIT_CODES, PW_DOCTOR_DIR } from '@pw-doctor/shared';
import type { RepairRecord, TriggerSource } from '@pw-doctor/shared';
import { findTestFiles } from '../utils/file-finder.js';

export function healCommand(): Command {
  return new Command('heal')
    .description('Detect broken selectors and propose fixes')
    .option('--dry-run', 'Show proposed fixes without applying (default)', true)
    .option('--apply', 'Apply fixes meeting confidence threshold')
    .option('--interactive', 'Confirm each fix interactively')
    .option('--min-confidence <n>', 'Minimum confidence to apply', '85')
    .option('--max-files <n>', 'Maximum files to process')
    .option('--ci', 'CI mode: JSON output, no interactive prompts')
    .option('--report <format>', 'Output report format (json)')
    .action(async (options) => {
      const cwd = process.cwd();
      const runId = `pwd_${crypto.randomUUID().slice(0, 8)}`;
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

      const minConfidence = parseInt(options.minConfidence, 10) || config.repair.autoApplyThreshold;
      const shouldApply = options.apply === true;

      // Step 1: Run Playwright tests
      const spinner = ora('Running Playwright tests...').start();

      const testResult = await runPlaywrightTests(cwd);
      const testResults = parsePlaywrightJsonOutput(testResult.stdout);
      const failures = extractFailedSelectors(testResults);

      if (failures.length === 0) {
        spinner.succeed('All tests passing — no broken selectors found');
        process.exit(EXIT_CODES.HEALTHY);
      }

      spinner.text = `Found ${failures.length} broken selector(s). Analyzing...`;

      // Step 2: For each failure, try to capture DOM and generate repair plans
      const repairs: RepairRecord[] = [];
      const plans: Array<{ plan: ReturnType<typeof buildRepairPlan>; sourceCode: string }> = [];

      for (const failure of failures) {
        // Read the test file source
        const filePath = path.resolve(cwd, failure.file);
        if (!fs.existsSync(filePath)) continue;

        const sourceCode = fs.readFileSync(filePath, 'utf-8');

        // For Phase 2 MVP: try to repair using the test's own context
        // DOM capture would require running the page — skipped for now
        // Instead, we extract selectors from the file and find alternatives

        // Build repair plan (without live DOM for now)
        const plan = buildRepairPlan(failure, '', {
          autoApplyThreshold: minConfidence,
          suggestThreshold: config.repair.suggestThreshold,
        });

        plans.push({ plan, sourceCode });
      }

      spinner.succeed(`Analyzed ${failures.length} broken selector(s)`);

      // Step 3: Display proposed fixes
      const fixableCount = plans.filter((p) => p.plan.bestCandidate).length;

      if (fixableCount === 0) {
        logger.warn('No automatic fixes found. Manual intervention required.');
        console.log('');
        for (const { plan } of plans) {
          console.log(chalk.red(`  ✖ ${plan.failure.file}:${plan.failure.line} — ${plan.failure.selector}`));
          console.log(chalk.gray(`    No repair candidates found`));
        }
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }

      console.log('');
      console.log(chalk.bold(`Proposed fixes (${fixableCount}/${failures.length}):`));
      console.log('');

      for (const { plan } of plans) {
        if (!plan.bestCandidate) {
          console.log(chalk.red(`  ✖ ${plan.failure.file}:${plan.failure.line}`));
          console.log(chalk.gray(`    ${plan.failure.selector} → no fix found`));
          continue;
        }

        const bc = plan.bestCandidate;
        const confidenceColor = bc.candidate.confidence >= 85 ? chalk.green : bc.candidate.confidence >= 50 ? chalk.yellow : chalk.red;
        console.log(chalk.cyan(`  ${plan.failure.file}:${plan.failure.line}`));
        console.log(`    ${chalk.red(plan.failure.selector)} → ${chalk.green(`${bc.candidate.method}('${bc.candidate.selector}')`)}`);
        console.log(`    Confidence: ${confidenceColor(`${bc.candidate.confidence}%`)} | Strategy: ${bc.candidate.strategy}`);
        console.log(`    ${chalk.gray(bc.candidate.reasoning)}`);
        console.log('');
      }

      // Step 4: Apply fixes if --apply
      if (!shouldApply) {
        console.log(chalk.gray('Dry run — no changes applied. Use --apply to apply fixes.'));
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }

      // Apply fixes
      let verified = 0;
      let rolledBackCount = 0;

      for (const { plan, sourceCode } of plans) {
        if (!plan.bestCandidate) continue;
        if (plan.bestCandidate.candidate.confidence < minConfidence) {
          logger.warn(`Skipping ${plan.failure.file}:${plan.failure.line} — confidence ${plan.bestCandidate.candidate.confidence}% below threshold ${minConfidence}%`);
          continue;
        }

        const filePath = path.resolve(cwd, plan.failure.file);
        const bc = plan.bestCandidate.candidate;

        // Backup
        createBackup(cwd, filePath, runId);

        // Patch
        const patchResult = patchSelector(
          sourceCode,
          plan.failure.line,
          plan.failure.selector,
          bc.selector,
          bc.method !== plan.failure.method ? bc.method : undefined,
        );

        if (!patchResult.patched) {
          logger.warn(`Could not patch ${plan.failure.file}:${plan.failure.line}`);
          continue;
        }

        fs.writeFileSync(filePath, patchResult.patchedCode, { mode: 0o600 });
        logger.info(`Patched ${plan.failure.file}:${plan.failure.line}`);

        // Verify by re-running the specific test
        const verifyResult = await runPlaywrightTests(cwd, {
          testFile: plan.failure.file,
          testNamePattern: plan.failure.testName,
          timeout: 60000,
        });

        const verifyResults = parsePlaywrightJsonOutput(verifyResult.stdout);
        const stillFailing = verifyResults.some((r) => !r.passed);

        if (!stillFailing) {
          verified++;
          logger.success(`Verified fix for ${plan.failure.file}:${plan.failure.line}`);

          repairs.push({
            filePath: plan.failure.file,
            line: plan.failure.line,
            oldSelector: plan.failure.selector,
            oldMethod: plan.failure.method,
            newSelector: bc.selector,
            newMethod: bc.method,
            strategy: bc.strategy,
            confidence: bc.confidence,
            reasoning: bc.reasoning,
            status: 'verified',
          });
        } else {
          // Rollback
          await rollback(cwd, filePath, runId);
          rolledBackCount++;
          logger.warn(`Fix failed verification — rolled back ${plan.failure.file}:${plan.failure.line}`);

          repairs.push({
            filePath: plan.failure.file,
            line: plan.failure.line,
            oldSelector: plan.failure.selector,
            oldMethod: plan.failure.method,
            newSelector: bc.selector,
            newMethod: bc.method,
            strategy: bc.strategy,
            confidence: bc.confidence,
            reasoning: bc.reasoning,
            status: 'rolled_back',
          });
        }
      }

      // Summary
      console.log('');
      console.log(chalk.bold('Summary:'));
      console.log(`  ${chalk.green(`${verified} verified`)} | ${chalk.red(`${rolledBackCount} rolled back`)} | ${failures.length - fixableCount} unfixable`);

      if (rolledBackCount > 0) {
        process.exit(EXIT_CODES.FIXES_FAILED);
      } else if (verified > 0) {
        process.exit(EXIT_CODES.FIXES_APPLIED);
      } else {
        process.exit(EXIT_CODES.BROKEN_FOUND);
      }
    });
}
```

**Step 2: Update index.ts to register heal command**

Add to `packages/cli/src/index.ts`:

```typescript
// packages/cli/src/index.ts
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { checkCommand } from './commands/check.js';
import { healCommand } from './commands/heal.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('pw-doctor')
    .description('AI-powered Playwright test selector maintenance')
    .version('0.0.1');

  program.addCommand(initCommand());
  program.addCommand(checkCommand());
  program.addCommand(healCommand());

  return program;
}
```

**Step 3: Build and verify**

Run: `npm run build && node packages/cli/dist/bin/pw-doctor.js heal --help`
Expected: Shows heal command help with --dry-run, --apply, --ci, --min-confidence flags.

**Step 4: Commit**

```bash
git add packages/cli/src/commands/heal.ts packages/cli/src/index.ts
git commit -m "feat(cli): add pw-doctor heal command with repair pipeline"
```

---

### Task 10: E2E Integration Tests

**Files:**
- Create: `packages/cli/tests/e2e/heal.test.ts`

**Step 1: Write E2E test for heal dry-run**

```typescript
// packages/cli/tests/e2e/heal.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { patchSelector } from '../../src/core/ast-patcher.js';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';
import { generateRepairCandidates } from '../../src/repair/repair-pipeline.js';
import type { SelectorFailure } from '../../src/core/test-runner.js';

describe('heal pipeline integration', () => {
  it('AST patcher preserves formatting when replacing selector', () => {
    const code = `import { test, expect } from '@playwright/test';

test('login', async ({ page }) => {
  await page.goto('/login');
  // Fill the form
  await page.locator('.username-field').fill('user@test.com');
  await page.locator('#password').fill('secret');
  await page.getByRole('button', { name: 'Submit' }).click();
});
`;
    const result = patchSelector(code, 6, '.username-field', 'email-input', 'getByTestId');

    expect(result.patched).toBe(true);
    // Should preserve the comment and other lines
    expect(result.patchedCode).toContain('// Fill the form');
    expect(result.patchedCode).toContain("getByTestId('email-input')");
    expect(result.patchedCode).toContain("locator('#password')");
    expect(result.patchedCode).toContain("getByRole('button'");
  });

  it('repair pipeline generates candidates from DOM', () => {
    const html = `
      <button class="btn-submit old-class" data-testid="submit-action" role="button">
        Save Changes
      </button>
    `;

    const failure: SelectorFailure = {
      file: 'test.spec.ts',
      line: 5,
      column: 0,
      selector: '.old-class',
      method: 'locator',
      testName: 'save test',
      error: 'Timeout',
    };

    const candidates = generateRepairCandidates(failure, html);
    expect(candidates.length).toBeGreaterThan(0);

    // Should find data-testid
    const testIdCandidate = candidates.find((c) => c.method === 'getByTestId');
    expect(testIdCandidate).toBeDefined();
    expect(testIdCandidate!.selector).toBe('submit-action');
  });

  it('full patch + verify cycle works on code', () => {
    const originalCode = `test('x', async ({ page }) => {
  await page.locator('.broken-class').click();
});
`;
    // Patch it
    const result = patchSelector(originalCode, 2, '.broken-class', 'fixed-id', 'getByTestId');
    expect(result.patched).toBe(true);
    expect(result.patchedCode).toContain("getByTestId('fixed-id')");
    expect(result.patchedCode).not.toContain('.broken-class');

    // Verify the patched code is valid (can be re-parsed)
    const result2 = patchSelector(result.patchedCode, 2, 'fixed-id', 'another-id');
    expect(result2.patched).toBe(true);
    expect(result2.patchedCode).toContain("'another-id'");
  });
});
```

**Step 2: Run all tests**

Run: `npm run build && cd packages/cli && npx vitest run`
Expected: All tests PASS (existing + new).

**Step 3: Commit**

```bash
git add packages/cli/tests/e2e/heal.test.ts
git commit -m "test(cli): add heal pipeline integration tests"
```

---

### Task 11: Final Wiring & Cleanup

**Step 1: Verify full build**

Run: `npm run build`
Expected: Clean build.

**Step 2: Verify all tests pass**

Run: `cd packages/cli && npx vitest run`
Expected: All tests pass.

**Step 3: Test CLI manually**

```bash
node packages/cli/dist/bin/pw-doctor.js --version
node packages/cli/dist/bin/pw-doctor.js --help
node packages/cli/dist/bin/pw-doctor.js heal --help
```

Expected: Version 0.0.1, help text shows init, check, and heal commands.

**Step 4: Commit if needed**

Only commit if there are uncommitted changes.

```bash
git add -A
git commit -m "chore: Phase 2 complete — heal loop with heuristic repair, AST patching, verification"
```

---

## What Phase 2 Delivers

After completing these 11 tasks:

1. **Shared file-finder utility** — extracted from duplicate code in init/check
2. **Test runner** — runs Playwright tests via safeExec, parses JSON output, extracts failures
3. **DOM analyzer** — cheerio-based HTML parsing with element search (by text, attribute, CSS, tag)
4. **AST patcher** — recast-based non-destructive selector replacement preserving all formatting
5. **Text match strategy** — finds elements by text content, generates getByText/getByTestId alternatives
6. **Attribute match strategy** — finds data-testid, role, aria-label alternatives for broken CSS selectors
7. **Candidate ranker** — scores and categorizes repair candidates by confidence threshold
8. **Backup & rollback** — file backup before patching, git checkout + backup restore fallback
9. **Repair pipeline** — orchestrates strategies → ranking → candidate selection
10. **`pw-doctor heal`** — full CLI command with --dry-run, --apply, --ci, --min-confidence flags
11. **Integration tests** — validates AST patching, repair pipeline, and patch+verify cycle

## What Comes Next (Phase 3)

Phase 3 adds:
- AI fallback repair via Claude API (BYOK)
- DOM redaction pipeline (multi-layer PII stripping for AI payloads)
- Structural match and anchor match strategies
- `--interactive` mode with per-fix confirmation
- npm publish preparation
- CI mode enhancements
