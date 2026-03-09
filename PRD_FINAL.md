# PW-Doctor — Final PRD, Architecture & Implementation Specification

> **Status:** Approved for implementation
> **Date:** 2026-03-08
> **Sources synthesized:** archive/REBUILD_PROMPT.md, archive/PRD_CODEX_OPTIMIZED.md, archive/PRD_CODEX_APPENDIX.md, archive/PRD_Gemini_V2.md
> **Security audit:** [docs/plans/2026-03-08-security-audit.md](docs/plans/2026-03-08-security-audit.md)

---

## 1. Product Definition

**Name:** PW-Doctor

**One-line:** CLI tool + SaaS platform that detects broken Playwright selectors by running tests to failure, captures the live DOM at the exact failure point, proposes safe fixes with confidence scoring, and verifies them — all via AST patching, never regex.

**Business objective (12 months):** 50 paying teams using the Pro tier, with positive gross margin and a measurable false-fix rate ≤ 3%.

---

## 2. Problem Statement

Playwright test suites degrade as UI changes break selectors. Teams lose release velocity because:
- Failures are discovered late in CI
- Fixes are manual, tedious, and error-prone
- No tooling understands *why* a selector broke or *what it was targeting*

**Current alternatives and why they fail:**

| Alternative | Failure mode |
|---|---|
| Manual repair | Slow (4+ hours/week for large suites), blocks PRs |
| Internal scripts (regex-based) | Fragile, break on file structure changes, no confidence |
| Strict `data-testid` discipline | Not universally adopted, doesn't prevent structural DOM shifts |
| Generic AI "paste to ChatGPT" | No DOM context, guesses blindly, 80% failure rate |

**Gap:** No tool runs the test to the failure point, captures the actual DOM state, and generates a verified, reviewable patch with confidence scoring.

---

## 3. Target User & ICP

### Primary ICP

| Attribute | Value |
|---|---|
| Company size | 15–200 engineers |
| Test suite | ≥ 300 Playwright selectors |
| Release cadence | Weekly or more frequent |
| CI system | GitHub Actions, GitLab CI, or similar |
| Pain level | ≥ 3 hours/week spent on selector maintenance |
| Budget holder | Engineering lead or QA lead |

### Secondary users
- QA automation leads maintaining cross-project test infrastructure
- DevOps engineers integrating test health into CI pipelines

### Explicit non-ICP (do not target in MVP)
- Teams with < 100 selectors (insufficient pain)
- Teams with perfect test-id discipline and < 1% breakage rate
- Highly regulated orgs requiring immediate on-prem deployment before product maturity

---

## 4. Core Value Proposition

For teams with frequent selector breakage, PW-Doctor:
1. **Detects** broken selectors by running tests to failure and capturing the DOM at the exact failure point
2. **Repairs** selectors using heuristics first (free, fast), AI second (smart, BYOK)
3. **Verifies** every fix by re-running the affected test immediately
4. **Patches** test files via AST manipulation (never regex), producing clean git diffs
5. **Reports** with confidence scores, so teams know which fixes to trust

**Success condition:** ≥ 50% reduction in manual selector-fix time within 30 days.

---

## 5. The Heal Loop — Core Architecture

This is the single most critical design decision. PW-Doctor does NOT validate selectors independently against live sites. It runs the actual test.

### Why "Run Test to Failure" Beats "Scan Live Site"

Selectors exist in context. `page.locator('.cart-item')` only makes sense after navigating, logging in, and adding items. Visiting the homepage and checking if `.cart-item` exists is meaningless. The only reliable way to find a replacement is to capture the DOM in the exact state where the selector was supposed to work.

### The Loop

```
Step 1: EXECUTE
  Run the Playwright test normally.
  If it passes → selector is healthy, record status, move on.
  If it fails with TimeoutError at a locator call → proceed to Step 2.

Step 2: CAPTURE
  At the failure point, the page is in the exact state where the selector
  should have worked. Extract:
  - Full page DOM (page.content())
  - Accessibility tree (page.accessibility.snapshot())
  - The failing selector string + its position in the test file (from error stack)
  - Test code context (5 lines before/after the failure)

Step 3: EXTRACT
  Use AST parsing (recast + @babel/parser) to locate the exact AST node
  in the test file that contains the broken selector string at the reported
  line/column. This gives us:
  - The selector value
  - The selector type (locator, getByRole, getByTestId, etc.)
  - The Playwright API call wrapping it
  - Chained operations (.click(), .fill(), .waitFor(), etc.)

Step 4: REPAIR (Heuristic — free, <100ms)
  Search the captured DOM for the intended element using layered heuristics:

  4a. Text content match:
      If the old selector targeted an element with text "Submit",
      find elements with that text in the current DOM.

  4b. data-testid/role/aria match:
      Look for semantic attributes on elements near where the old
      element would have been (same parent, same section).

  4c. Structural similarity:
      Compare the old selector's structural position (nth-child, parent
      chain) to current DOM structure using fuzzy matching (fuse.js).

  4d. Neighboring anchor:
      Find stable elements near the target (headings, labels, landmarks)
      and build a relative selector from those anchors.

  If heuristics produce a candidate with confidence ≥ 70% → proceed to Step 6.
  If not → proceed to Step 5.

Step 5: REPAIR (AI Fallback — BYOK, ~2s)
  Send to Claude API:
  - The broken selector and its type
  - The accessibility tree (not raw HTML — smaller, more semantic)
  - The test code context (what the test does before and after this line)
  - The Playwright API used (locator vs getByRole vs getByTestId)
  - Instruction: "Find the element this selector was targeting. Return the
    most resilient selector (prefer data-testid > role > text > css).
    Return confidence 0-100 and one-line reasoning."

  DOM preprocessing before sending to AI:
  - Strip <svg> internals (replace with <svg data-pw-stripped/>)
  - Strip <style> blocks
  - Strip inline styles
  - Remove data: URIs
  - Redact values matching email/token/secret patterns
  - Truncate to 8000 tokens max (keep elements around the likely target area)

Step 6: PATCH
  Use recast AST transformation to replace the selector value
  in the exact AST node identified in Step 3.
  - Preserves all formatting, comments, whitespace
  - Handles string literals (single, double, backtick)
  - Handles chained locators correctly
  - Produces a clean, minimal git diff

Step 7: VERIFY
  Re-run the specific test that failed.
  - PASS → Fix confirmed. Record to history. Keep the file change.
  - FAIL → Atomic rollback: `git checkout -- <file>`. Mark as
    "needs manual review" with full context in the report.

Step 8: REPORT
  Output structured results:
  - Terminal: color table with file, selector, status, confidence, strategy
  - JSON: machine-readable report (schema versioned)
  - Exit code: 0 = all healthy, 1 = broken found, 2 = fixes applied
```

---

## 6. CLI Commands

### `pw-doctor init`

Detects Playwright project, creates config, optionally links to SaaS account.

```
Flow:
1. Search for playwright.config.{ts,js,mjs} in cwd and parents
2. Detect test directory (tests/, e2e/, spec/)
3. Create .pw-doctor.config.ts with defaults
4. Scan test files, count selectors, report initial stats
5. If --link flag: device code auth flow to connect to dashboard
```

Config file (`.pw-doctor.config.ts`):
```typescript
import { defineConfig } from 'pw-doctor';

export default defineConfig({
  // Where to find test files
  testDir: './tests',
  testMatch: '**/*.spec.ts',

  // Base URL for the application under test
  baseUrl: 'https://staging.example.com',

  // Auth state file for authenticated tests
  storageState: './auth/state.json',

  // Setup commands to run before validation (e.g., start dev server)
  setup: {
    command: 'npm run dev',
    port: 3000,
    timeout: 30000,
  },

  // Repair configuration
  repair: {
    // Maximum files to modify per run
    maxFiles: 10,
    // Maximum replacements per file
    maxReplacementsPerFile: 5,
    // Minimum confidence to auto-apply (with --apply)
    autoApplyThreshold: 85,
    // Minimum confidence to suggest (below this = flag for manual review)
    suggestThreshold: 50,
  },

  // AI configuration
  ai: {
    // Enable AI fallback (requires ANTHROPIC_API_KEY env var)
    enabled: false,
    // Provider (only 'anthropic' in v1)
    provider: 'anthropic',
    // Model to use
    model: 'claude-sonnet-4-20250514',
    // Max tokens per request
    maxTokens: 4096,
    // Max AI calls per run (cost control)
    maxCallsPerRun: 20,
    // Token budget per run
    tokenBudgetPerRun: 50000,
  },

  // Redaction rules for DOM content sent to AI
  redact: {
    // Patterns to redact (replaced with [REDACTED])
    patterns: [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // emails
      /(?:bearer|token|key|secret|password)\s*[=:]\s*\S+/gi, // secrets
    ],
    // HTML attributes to strip before sending to AI
    stripAttributes: ['style', 'onclick', 'onload'],
  },

  // Reporting
  report: {
    // Output format for --report flag
    format: 'json', // 'json' | 'html' | 'markdown'
    // Where to write report files
    outputDir: '.pw-doctor/reports',
  },

  // SaaS sync (Pro tier)
  sync: {
    enabled: false,
    apiKey: process.env.PW_DOCTOR_API_KEY,
    endpoint: 'https://api.pw-doctor.dev',
  },
});
```

### `pw-doctor check`

Run tests, detect broken selectors, report without fixing.

```
Flags:
  --report <format>     Output report (json|html|markdown)
  --filter <pattern>    Only check tests matching glob pattern
  --timeout <ms>        Per-test timeout (default: 30000)
  --workers <n>         Parallel test workers (default: CPU count / 2)
  --ci                  CI mode: JSON output, no interactive prompts
  --fail-on-broken      Exit code 1 if any broken selectors found (default in CI)

Output:
  Terminal table:
  ┌──────────────────────┬────────────────────┬──────────┬────────────┐
  │ File                 │ Selector           │ Status   │ Fragility  │
  ├──────────────────────┼────────────────────┼──────────┼────────────┤
  │ login.spec.ts:42     │ .btn-primary       │ BROKEN   │ 78/100     │
  │ login.spec.ts:55     │ [data-testid=user] │ HEALTHY  │ 12/100     │
  │ cart.spec.ts:18      │ .cart-item >> nth=0 │ BROKEN   │ 85/100     │
  │ nav.spec.ts:31       │ role=navigation    │ HEALTHY  │ 5/100      │
  └──────────────────────┴────────────────────┴──────────┴────────────┘

  Summary: 47 selectors checked, 2 broken, 0 flaky, 45 healthy
  Health: 95.7%

Exit codes:
  0 = all healthy
  1 = broken selectors found
  2 = tool error (config invalid, can't connect to site, etc.)
```

### `pw-doctor heal`

Detect and repair broken selectors.

```
Flags:
  --dry-run             Show proposed fixes without applying (DEFAULT)
  --apply               Apply fixes that meet confidence threshold
  --apply-all           Apply all fixes regardless of confidence (dangerous)
  --interactive         Confirm each fix interactively (default when TTY)
  --ai                  Enable AI fallback for this run
  --max-files <n>       Override max files limit
  --min-confidence <n>  Override minimum confidence for --apply
  --report <format>     Output report
  --ci                  CI mode

Dry-run output:
  ┌─────────────────────┬──────────────────┬─────────────────────────┬────────┬──────────┐
  │ File                │ Old Selector     │ Proposed Fix            │ Conf.  │ Strategy │
  ├─────────────────────┼──────────────────┼─────────────────────────┼────────┼──────────┤
  │ login.spec.ts:42    │ .btn-primary     │ [data-testid="submit"]  │ 94%    │ heuristic│
  │ cart.spec.ts:18     │ .cart-item:nth(0)│ role=listitem           │ 71%    │ ai       │
  └─────────────────────┴──────────────────┴─────────────────────────┴────────┴──────────┘

  Run `pw-doctor heal --apply` to apply fixes with confidence ≥ 85%

Interactive mode:
  ✔ login.spec.ts:42
    .btn-primary → [data-testid="submit"] (94% confidence, heuristic)
    ▸ Apply  ▸ Skip  ▸ View diff  ▸ View context

  ✔ cart.spec.ts:18
    .cart-item:nth(0) → role=listitem (71% confidence, AI)
    AI reasoning: "The cart items are now rendered as <li> elements inside
    a <ul role='list'>. The class 'cart-item' was removed in a CSS refactor."
    ▸ Apply  ▸ Skip  ▸ View diff  ▸ View context
```

### `pw-doctor verify`

Re-run tests affected by recent repairs to confirm fixes work.

```
Flags:
  --revert-on-fail      Auto-revert failed fixes (default: true)
  --tests <pattern>     Only verify specific tests

Flow:
1. Read .pw-doctor/history/latest.json to find recent repairs
2. Build list of impacted test files
3. Run only those tests
4. For each:
   - PASS → mark repair as verified
   - FAIL → revert file via git, mark as needs-manual-review
5. Output verification summary
```

### `pw-doctor report`

Generate detailed report from scan/heal history.

```
Flags:
  --format <type>       json | html | markdown (default: html)
  --output <path>       Output file path
  --last <n>            Include last N runs (default: 10)

HTML report includes:
  - Selector health summary (donut chart)
  - Most fragile selectors list
  - Repair history timeline
  - Per-file breakdown
  - Proactive suggestions (e.g., "Migrate 23 CSS selectors to data-testid")
```

### `pw-doctor watch`

Continuous monitoring during development.

```
Flags:
  --auto-heal           Auto-attempt repair on detected breakage
  --debounce <ms>       Wait before re-scanning after file change (default: 2000)

Flow:
1. Watch test files and source files for changes (chokidar)
2. On change: re-run affected tests
3. On breakage: run heal loop
4. Output live status in terminal
```

### `pw-doctor login`

Authenticate with PW-Doctor SaaS.

```
Flow:
1. Generate device code
2. Display: "Visit https://pw-doctor.dev/device and enter code: ABCD-1234"
3. Poll for authorization
4. Store API key in OS keychain (macOS Keychain, Linux secret-service, Windows Credential Vault)
5. Fallback: ~/.pw-doctor/credentials (chmod 600)
```

---

## 7. AST Parsing & Patching — Detailed Design

### 7.1 Selector Extraction

Use `@babel/parser` with TypeScript plugin to parse test files into AST. Walk the AST to find all Playwright locator calls.

**Supported patterns:**

```typescript
// Direct locator calls
page.locator('selector')
page.locator('selector', { has: page.locator('nested') })

// Semantic locators
page.getByRole('button', { name: 'Submit' })
page.getByText('Hello')
page.getByTestId('login-form')
page.getByLabel('Email')
page.getByPlaceholder('Enter email')
page.getByAltText('Logo')
page.getByTitle('Settings')

// Chained locators
page.locator('.parent').locator('.child')
page.getByRole('list').getByRole('listitem')
page.locator('.container').filter({ hasText: 'foo' })
page.locator('.items').nth(2)
page.locator('.btn').first()
page.locator('.btn').last()

// Logical combinators
page.locator('.btn').and(page.getByText('Submit'))
page.locator('.btn').or(page.getByRole('button'))

// Frame locators
page.frameLocator('#iframe').locator('.btn')
```

**AST node identification algorithm:**

```typescript
// Pseudocode for selector extraction
function extractSelectors(ast: AST, filePath: string): SelectorInfo[] {
  const selectors: SelectorInfo[] = [];

  traverse(ast, {
    CallExpression(path) {
      // Check if callee matches Playwright patterns
      const method = getMethodName(path); // 'locator', 'getByRole', etc.
      if (!isPlaywrightLocatorMethod(method)) return;

      // Get the receiver to ensure it's page/locator/frame
      const receiver = getReceiver(path);
      if (!isPlaywrightReceiver(receiver)) return;

      // Extract selector argument
      const selectorArg = path.node.arguments[0];
      if (!selectorArg) return;

      // Handle string literals
      if (isStringLiteral(selectorArg)) {
        selectors.push({
          filePath,
          line: path.node.loc.start.line,
          column: path.node.loc.start.column,
          selectorValue: selectorArg.value,
          selectorType: classifySelectorType(method, selectorArg.value),
          apiMethod: method,
          astNodePath: path,
          contextCode: getContextLines(filePath, path.node.loc.start.line, 5),
        });
      }

      // Handle template literals — mark as dynamic, skip for auto-repair
      if (isTemplateLiteral(selectorArg) && selectorArg.expressions.length > 0) {
        selectors.push({
          ...baseInfo,
          selectorValue: templateToString(selectorArg),
          isDynamic: true, // Cannot auto-repair
          selectorType: 'dynamic',
        });
      }

      // Handle getByRole options (second argument)
      if (method === 'getByRole' && path.node.arguments[1]) {
        // Extract { name: 'Submit', exact: true } etc.
        selectors[selectors.length - 1].roleOptions =
          extractObjectLiteral(path.node.arguments[1]);
      }
    },
  });

  return selectors;
}
```

**Selector type classification:**

```typescript
function classifySelectorType(
  method: string,
  value: string,
): SelectorType {
  // Method-based classification
  if (method === 'getByRole') return 'role';
  if (method === 'getByTestId') return 'testid';
  if (method === 'getByText') return 'text';
  if (method === 'getByLabel') return 'label';
  if (method === 'getByPlaceholder') return 'placeholder';
  if (method === 'getByAltText') return 'alttext';
  if (method === 'getByTitle') return 'title';

  // For page.locator(), classify by value
  if (value.startsWith('//') || value.startsWith('xpath=')) return 'xpath';
  if (value.startsWith('text=') || value.startsWith('"')) return 'text';
  if (value.startsWith('#')) return 'id';
  if (value.includes('[data-testid')) return 'testid';
  if (value.includes('[role=') || value.startsWith('role=')) return 'role';

  return 'css'; // Default: CSS selector
}
```

**Fragility scoring:**

```typescript
function computeFragilityScore(selector: SelectorInfo): number {
  let score = 50; // baseline

  // Type-based fragility (lower = more resilient)
  const typeScores: Record<SelectorType, number> = {
    testid: 10,      // Very stable
    role: 15,         // Semantic, stable
    label: 20,        // Stable if labels don't change
    title: 25,
    placeholder: 30,
    alttext: 30,
    text: 40,         // Text changes with copy updates
    id: 35,           // IDs can be auto-generated
    css: 65,          // Classes change frequently
    xpath: 80,        // Extremely fragile
    dynamic: 90,      // Cannot auto-repair
  };
  score = typeScores[selector.selectorType] ?? 50;

  // Structural penalties
  if (selector.selectorValue.includes('nth-child')) score += 15;
  if (selector.selectorValue.includes('nth-of-type')) score += 15;
  if (selector.selectorValue.includes('>>')) score += 10; // deep chaining
  if ((selector.selectorValue.match(/\./g) || []).length > 2) score += 10; // many classes
  if (selector.selectorValue.includes(':has(')) score += 5;

  // Specificity bonus
  if (selector.selectorValue.includes('data-testid')) score -= 20;
  if (selector.selectorValue.match(/^#[a-z][\w-]+$/i)) score -= 10; // simple ID

  return Math.max(0, Math.min(100, score));
}
```

### 7.2 AST Patching with Recast

Recast preserves original formatting. When we replace a selector, only the selector string changes — indentation, comments, trailing commas, everything else stays identical.

```typescript
import * as recast from 'recast';
import * as parser from '@babel/parser';

function patchSelector(
  fileContent: string,
  targetLine: number,
  targetColumn: number,
  oldSelector: string,
  newSelector: string,
  newMethod?: string, // e.g., change locator() to getByTestId()
): { patchedContent: string; diff: string } {
  const ast = recast.parse(fileContent, {
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
      const node = path.node;
      const loc = node.loc;

      if (!loc) return this.traverse(path);

      // Match by line number (and optionally column) to find the exact node
      if (loc.start.line !== targetLine) return this.traverse(path);

      const method = getCalleeMethodName(node);
      if (!isPlaywrightLocatorMethod(method)) return this.traverse(path);

      const firstArg = node.arguments[0];
      if (!firstArg || !isStringLiteral(firstArg)) return this.traverse(path);
      if (firstArg.value !== oldSelector) return this.traverse(path);

      // PATCH: Replace the selector string
      firstArg.value = newSelector;

      // If we also need to change the method (e.g., locator → getByTestId)
      if (newMethod && node.callee.type === 'MemberExpression') {
        node.callee.property.name = newMethod;

        // Adjust arguments for semantic locator methods
        if (newMethod === 'getByTestId') {
          // getByTestId takes just the test ID value, not the full attribute selector
          const testIdMatch = newSelector.match(/data-testid[=~]*["']?([^"'\]]+)/);
          if (testIdMatch) {
            firstArg.value = testIdMatch[1];
          }
        }
      }

      patched = true;
      return false; // stop traversal
    },
  });

  if (!patched) {
    throw new Error(
      `Could not find selector "${oldSelector}" at line ${targetLine} in AST`,
    );
  }

  const patchedContent = recast.print(ast).code;
  return { patchedContent, diff: createUnifiedDiff(fileContent, patchedContent) };
}
```

### 7.3 Handling Edge Cases

**Page Object Model wrappers:**
```typescript
// If selectors are defined in page objects:
// pages/login.page.ts:
//   readonly submitButton = this.page.locator('.btn-primary');
//
// The AST parser handles this identically — it finds locator() calls
// regardless of whether they're in test files or page object files.
// Config option: include page object directories in scan paths.
```

**Dynamic selectors (cannot auto-repair):**
```typescript
// These use template literals with runtime values:
page.locator(`[data-item-id="${itemId}"]`);
page.locator(getSelector(type));

// PW-Doctor marks these as selectorType: 'dynamic'
// and reports them as "cannot auto-repair, manual review required"
// with the file location and context.
```

**Chained locators:**
```typescript
// page.locator('.list').locator('.item').first().click()
// If '.item' is broken, we need to patch the second locator() call
// The AST walker identifies each locator() in the chain independently
// and patches only the one that matches the failure line/column.
```

---

## 8. Heuristic Repair Engine — Detailed Strategies

### Strategy 1: Text Content Match

```typescript
function tryTextMatch(
  failedSelector: string,
  dom: Document,
  accessibilityTree: AccessibilityNode,
): RepairCandidate | null {
  // 1. Find what text the old selector's element had (from historical data
  //    or from the test context: e.g., .click() follows a getByText)
  // 2. Search the DOM for elements containing that text
  // 3. If found: generate the most resilient selector for that element

  // Example: old selector was '.submit-btn'
  // Test context shows: await page.locator('.submit-btn').click()
  // Previous run recorded this element had text "Sign In"
  // DOM search finds: <button data-testid="login-submit">Sign In</button>
  // Generated selector: [data-testid="login-submit"]
  // Confidence: 92% (exact text match + testid available)
}
```

### Strategy 2: data-testid / Semantic Attribute Search

```typescript
function tryAttributeMatch(
  failedSelector: string,
  dom: Document,
): RepairCandidate | null {
  // Parse the old selector to understand intent
  // Look for elements with data-testid, role, aria-label
  // in the same DOM region (same parent container)

  // Matching logic:
  // 1. If old selector was CSS class-based, extract semantic clues from class name
  //    e.g., '.login-submit-btn' → look for data-testid containing 'login' and 'submit'
  // 2. Check if a data-testid was added to the same element
  // 3. Check if a role attribute matches the element's function
}
```

### Strategy 3: Structural Similarity (Fuzzy)

```typescript
function tryStructuralMatch(
  failedSelector: string,
  oldDomSnapshot: string | null, // from previous successful run
  currentDom: Document,
): RepairCandidate | null {
  // Use fuse.js to fuzzy-match element attributes
  // Compare structural position: parent chain, sibling index

  // Algorithm:
  // 1. Parse old selector to identify target properties (tag, classes, attributes)
  // 2. Build candidates from current DOM elements of same tag
  // 3. Score each candidate by:
  //    - Attribute similarity (fuse.js on class names, IDs)
  //    - Position similarity (same depth, similar sibling index)
  //    - Parent chain similarity (shared ancestor classes/roles)
  // 4. Return highest-scoring candidate if above threshold
}
```

### Strategy 4: Neighboring Anchor

```typescript
function tryAnchorMatch(
  failedSelector: string,
  dom: Document,
  testContext: string,
): RepairCandidate | null {
  // Find stable elements near the target (headings, labels, landmarks)
  // Build a relative selector using those anchors

  // Example:
  // Old: page.locator('.price-display')
  // Anchor: <h2>Order Summary</h2> is stable and nearby
  // New: page.locator('h2:has-text("Order Summary") + .order-total')
  // Or: page.getByRole('heading', { name: 'Order Summary' })
  //       .locator('..').locator('.order-total')
}
```

### Candidate Ranking

```typescript
interface RepairCandidate {
  selector: string;
  method: string; // 'locator' | 'getByTestId' | 'getByRole' | etc.
  confidence: number; // 0-100
  strategy: 'text_match' | 'attribute_match' | 'structural_match'
    | 'anchor_match' | 'ai';
  reasoning: string;
  elementMatch: {
    tag: string;
    text: string;
    attributes: Record<string, string>;
    isVisible: boolean;
    isUnique: boolean; // only 1 element matches this selector
    boundingBox: { x: number; y: number; width: number; height: number } | null;
  };
}

function rankCandidates(candidates: RepairCandidate[]): RepairCandidate[] {
  return candidates.sort((a, b) => {
    // Primary: confidence score
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;

    // Secondary: prefer more resilient selector types
    const typeRank: Record<string, number> = {
      getByTestId: 1,
      getByRole: 2,
      getByLabel: 3,
      getByText: 4,
      locator: 5, // CSS selector
    };
    return (typeRank[a.method] ?? 9) - (typeRank[b.method] ?? 9);
  });
}

function computeConfidence(candidate: RepairCandidate): number {
  let confidence = 50;

  // Selector type resilience
  if (candidate.method === 'getByTestId') confidence += 20;
  if (candidate.method === 'getByRole') confidence += 15;
  if (candidate.method === 'getByLabel') confidence += 10;

  // Uniqueness
  if (candidate.elementMatch.isUnique) confidence += 20;
  else confidence -= 15;

  // Visibility
  if (candidate.elementMatch.isVisible) confidence += 10;
  else confidence -= 20;

  // Strategy reliability
  if (candidate.strategy === 'text_match') confidence += 10;
  if (candidate.strategy === 'attribute_match') confidence += 15;
  if (candidate.strategy === 'structural_match') confidence -= 5;

  return Math.max(0, Math.min(100, confidence));
}
```

---

## 9. AI Fallback — Detailed Design

### Prompt Template

```typescript
const AI_REPAIR_PROMPT = `You are a Playwright test selector repair assistant.

A Playwright test has a broken selector that no longer matches any element on the page.

## Broken Selector
- Value: {failedSelector}
- Type: {selectorType} (used via page.{apiMethod}())
- File: {filePath}:{lineNumber}

## Test Context
The test code around the failure:
\`\`\`typescript
{contextCode}
\`\`\`

## Current Page Accessibility Tree
This is the accessibility snapshot of the page at the exact moment the selector failed:
\`\`\`
{accessibilityTree}
\`\`\`

## Your Task
1. Identify what element the broken selector was trying to target based on:
   - The selector name/value hints (e.g., ".submit-btn" was targeting a submit button)
   - The test context (what action follows: .click(), .fill(), .waitFor(), etc.)
   - The page structure in the accessibility tree

2. Find the matching element in the current accessibility tree.

3. Generate the best replacement selector, prioritizing (most resilient first):
   - page.getByTestId('...') — if a data-testid attribute exists
   - page.getByRole('...', { name: '...' }) — if role + accessible name is unique
   - page.getByLabel('...') — for form inputs with labels
   - page.getByText('...') — for elements with unique text
   - page.locator('[data-testid="..."]') — fallback to CSS attribute selector
   - page.locator('css-selector') — last resort

4. Return ONLY a JSON object (no markdown, no explanation outside JSON):
{
  "selector": "the new selector value",
  "method": "locator|getByRole|getByTestId|getByText|getByLabel",
  "confidence": 0-100,
  "reasoning": "one line explaining why this is the right fix",
  "targetElement": "brief description of the element found"
}`;
```

### AI Integration Code

```typescript
import Anthropic from '@anthropic-ai/sdk';

interface AIRepairResult {
  selector: string;
  method: string;
  confidence: number;
  reasoning: string;
  targetElement: string;
  tokensUsed: number;
  costCents: number;
}

async function repairWithAI(
  context: RepairContext,
  config: AIConfig,
): Promise<AIRepairResult | null> {
  // Check budget
  if (context.runBudget.tokensUsed >= config.tokenBudgetPerRun) {
    return null; // Budget exhausted, skip AI
  }
  if (context.runBudget.callsMade >= config.maxCallsPerRun) {
    return null;
  }

  // Prepare DOM — strip to accessibility tree, redact secrets
  const accessibilityTree = await context.page.accessibility.snapshot();
  const sanitizedTree = redactSensitiveContent(
    JSON.stringify(accessibilityTree, null, 2),
    config.redactPatterns,
  );

  // Truncate if too long
  const truncatedTree = truncateToTokenLimit(sanitizedTree, 6000);

  const prompt = AI_REPAIR_PROMPT
    .replace('{failedSelector}', context.failedSelector)
    .replace('{selectorType}', context.selectorType)
    .replace('{apiMethod}', context.apiMethod)
    .replace('{filePath}', context.filePath)
    .replace('{lineNumber}', String(context.lineNumber))
    .replace('{contextCode}', context.contextCode)
    .replace('{accessibilityTree}', truncatedTree);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text'
    ? response.content[0].text : '';

  // Parse JSON from response
  const parsed = parseAIResponse(text);
  if (!parsed) return null;

  // Track usage
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  context.runBudget.tokensUsed += tokensUsed;
  context.runBudget.callsMade += 1;

  return {
    ...parsed,
    tokensUsed,
    costCents: estimateCost(tokensUsed, config.model),
  };
}
```

### DOM Preprocessing

```typescript
function preprocessDOM(html: string): string {
  // 1. Parse HTML
  // 2. Strip SVG internals (keep <svg> tag with attributes for identification)
  // 3. Strip <style> blocks entirely
  // 4. Strip <script> blocks entirely
  // 5. Remove inline style attributes
  // 6. Remove event handler attributes (onclick, onload, etc.)
  // 7. Remove data: URIs (images, fonts)
  // 8. Remove comments
  // 9. Collapse whitespace
  // 10. Apply redaction patterns (emails, tokens, secrets)
  // Result: dramatically smaller DOM that retains structural/semantic info
}

function truncateToTokenLimit(content: string, maxTokens: number): string {
  // Rough estimation: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) return content;

  // Smart truncation: keep the area around likely target elements
  // Use the failed selector as a hint to find the relevant region
  // Keep <head> summary + relevant <body> section
  return smartTruncate(content, maxChars);
}
```

---

## 10. Verification & Rollback

### Verification Flow

```typescript
async function verifyRepair(
  repair: AppliedRepair,
  config: PwDoctorConfig,
): Promise<VerificationResult> {
  // 1. Identify the test file and test name
  const testFile = repair.filePath;
  const testName = repair.testName; // extracted from describe/test block

  // 2. Run only the impacted test
  const result = await runPlaywrightTest({
    testFile,
    testNamePattern: testName,
    timeout: config.repair.verifyTimeout ?? 60000,
    retries: 0, // No retries during verification
  });

  if (result.passed) {
    return {
      status: 'verified',
      repair,
      testDuration: result.duration,
    };
  }

  // 3. Test failed — rollback
  await rollbackRepair(repair);

  return {
    status: 'rolled_back',
    repair,
    failureReason: result.error,
    testDuration: result.duration,
  };
}
```

### Rollback Mechanism

```typescript
async function rollbackRepair(repair: AppliedRepair): Promise<void> {
  // Strategy 1: git checkout (preferred — atomic, reliable)
  try {
    await exec(`git checkout -- "${repair.filePath}"`);
    return;
  } catch {
    // Not a git repo or file not tracked
  }

  // Strategy 2: restore from backup
  // We always save the original file content before patching
  const backupPath = path.join(
    '.pw-doctor', 'backups', repair.runId,
    repair.filePath.replace(/\//g, '__'),
  );
  if (await fileExists(backupPath)) {
    await fs.copyFile(backupPath, repair.filePath);
    return;
  }

  throw new Error(
    `Cannot rollback ${repair.filePath}: no git history and no backup found`,
  );
}
```

### History Storage (Local)

All run data stored in `.pw-doctor/` directory:

```
.pw-doctor/
├── config.ts          ← user config
├── history/
│   ├── runs/
│   │   ├── 2026-03-08T10-30-00Z.json
│   │   └── 2026-03-07T14-22-00Z.json
│   └── selectors.json ← cumulative selector health data
├── backups/
│   └── <run-id>/
│       └── <file-path-flattened>
├── reports/
│   ├── latest.json
│   └── latest.html
└── calibration/       ← test corpus for quality measurement
    └── corpus.json
```

Run history schema:

```typescript
interface RunHistory {
  schemaVersion: 1;
  runId: string;
  timestamp: string;
  trigger: 'cli' | 'ci' | 'watch';
  config: {
    aiEnabled: boolean;
    autoApplyThreshold: number;
  };
  git: {
    commit: string;
    branch: string;
    dirty: boolean;
  } | null;
  results: {
    totalSelectors: number;
    healthy: number;
    broken: number;
    repaired: number;
    verified: number;
    rolledBack: number;
    needsManualReview: number;
    skippedDynamic: number;
  };
  repairs: Array<{
    filePath: string;
    line: number;
    oldSelector: string;
    oldMethod: string;
    newSelector: string;
    newMethod: string;
    strategy: 'text_match' | 'attribute_match' | 'structural_match'
      | 'anchor_match' | 'ai';
    confidence: number;
    reasoning: string;
    status: 'verified' | 'rolled_back' | 'pending_review' | 'skipped';
    aiTokensUsed?: number;
    aiCostCents?: number;
  }>;
  timing: {
    totalMs: number;
    checkMs: number;
    repairMs: number;
    verifyMs: number;
  };
}
```

---

## 11. Tech Stack — Full Specification

### CLI Package

| Component | Library | Version | Why |
|---|---|---|---|
| CLI framework | `commander` | ^13.x | Simple, proven, low overhead |
| Interactive prompts | `@clack/prompts` | ^0.10.x | Beautiful terminal UI, modern |
| Colors | `chalk` | ^5.x | ESM-native terminal colors |
| Spinners | `ora` | ^8.x | Elegant progress indicators |
| Tables | `cli-table3` | ^0.6.x | Formatted terminal tables |
| File watching | `chokidar` | ^4.x | Cross-platform file watching |
| Config | `cosmiconfig` | ^9.x | `.pw-doctor.config.ts` support |
| AST parsing | `@babel/parser` | ^7.x | TypeScript + JSX support |
| AST patching | `recast` | ^0.23.x | Non-destructive code transforms |
| Fuzzy search | `fuse.js` | ^7.x | DOM element fuzzy matching |
| Schema validation | `zod` | ^3.x | Config and data validation |
| AI client | `@anthropic-ai/sdk` | ^0.39.x | Claude API (BYOK) |
| Keychain | `keytar` | ^7.x | OS-native credential storage |
| HTML parsing | `cheerio` | ^1.x | DOM analysis from page.content() |
| Browser | `playwright` | peer dep | Uses project's Playwright install |

### Web Dashboard (V2)

| Component | Library | Why |
|---|---|---|
| Framework | Next.js 15+ (App Router) | Server Components, API routes |
| Styling | Tailwind CSS 4 + Radix UI | Fast development, accessible components |
| Charts | Recharts | Selector health trends, repair history |
| Auth | Supabase Auth | Email + GitHub OAuth + API keys |
| Database | Supabase (PostgreSQL) | Managed Postgres with RLS |
| Payments | Stripe | Subscriptions + usage metering |
| Email | Resend | Transactional emails |
| Deployment | Cloudflare Workers (OpenNext) | Per Petr's infrastructure |

### Repository Structure

```
pw-doctor/
├── package.json                ← root workspace config
├── tsconfig.json               ← base TypeScript config
├── turbo.json                  ← Turborepo config
├── packages/
│   ├── cli/                    ← npm package: pw-doctor
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts        ← CLI entry point (commander setup)
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── check.ts
│   │   │   │   ├── heal.ts
│   │   │   │   ├── verify.ts
│   │   │   │   ├── report.ts
│   │   │   │   ├── watch.ts
│   │   │   │   └── login.ts
│   │   │   ├── core/
│   │   │   │   ├── selector-extractor.ts   ← AST-based extraction
│   │   │   │   ├── ast-patcher.ts          ← Recast-based patching
│   │   │   │   ├── test-runner.ts          ← Playwright execution wrapper
│   │   │   │   ├── dom-analyzer.ts         ← DOM snapshot processing
│   │   │   │   ├── fragility-scorer.ts     ← Selector fragility scoring
│   │   │   │   └── selector-types.ts       ← Type definitions
│   │   │   ├── repair/
│   │   │   │   ├── repair-pipeline.ts      ← Orchestrates heuristic → AI
│   │   │   │   ├── text-match.ts           ← Strategy 1
│   │   │   │   ├── attribute-match.ts      ← Strategy 2
│   │   │   │   ├── structural-match.ts     ← Strategy 3
│   │   │   │   ├── anchor-match.ts         ← Strategy 4
│   │   │   │   ├── ai-repair.ts            ← AI fallback
│   │   │   │   └── candidate-ranker.ts     ← Ranking + confidence
│   │   │   ├── verify/
│   │   │   │   ├── verifier.ts             ← Re-run tests post-patch
│   │   │   │   └── rollback.ts             ← Git/backup rollback
│   │   │   ├── report/
│   │   │   │   ├── terminal-reporter.ts    ← CLI table output
│   │   │   │   ├── json-reporter.ts        ← JSON artifact
│   │   │   │   └── html-reporter.ts        ← HTML report
│   │   │   ├── config/
│   │   │   │   ├── loader.ts               ← Cosmiconfig integration
│   │   │   │   ├── schema.ts               ← Zod config schema
│   │   │   │   └── defaults.ts             ← Default values
│   │   │   ├── sync/
│   │   │   │   ├── api-client.ts           ← SaaS API client
│   │   │   │   └── auth.ts                 ← Device code auth
│   │   │   └── utils/
│   │   │       ├── dom-redactor.ts         ← PII/secret redaction
│   │   │       ├── dom-stripper.ts         ← SVG/style/script removal
│   │   │       ├── git.ts                  ← Git operations
│   │   │       └── logger.ts               ← Structured logging
│   │   ├── bin/
│   │   │   └── pw-doctor.ts                ← Executable entry
│   │   └── tests/
│   │       ├── selector-extractor.test.ts
│   │       ├── ast-patcher.test.ts
│   │       ├── repair-pipeline.test.ts
│   │       ├── fragility-scorer.test.ts
│   │       └── fixtures/
│   │           ├── sample-tests/           ← Real Playwright test files
│   │           └── sample-doms/            ← DOM snapshots for testing
│   │
│   ├── web/                    ← Next.js dashboard (V2)
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── wrangler.jsonc
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx              ← Landing page
│   │   │   │   ├── pricing/
│   │   │   │   ├── docs/
│   │   │   │   ├── dashboard/
│   │   │   │   │   ├── page.tsx          ← Overview
│   │   │   │   │   ├── projects/
│   │   │   │   │   │   ├── page.tsx      ← Project list
│   │   │   │   │   │   ├── new/
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       ├── page.tsx  ← Project detail
│   │   │   │   │   │       ├── scans/
│   │   │   │   │   │       ├── selectors/
│   │   │   │   │   │       ├── repairs/
│   │   │   │   │   │       └── settings/
│   │   │   │   │   ├── team/
│   │   │   │   │   └── settings/
│   │   │   │   │       ├── page.tsx
│   │   │   │   │       ├── billing/
│   │   │   │   │       └── integrations/
│   │   │   │   └── api/
│   │   │   │       ├── auth/
│   │   │   │       │   ├── device-code/
│   │   │   │       │   └── verify/
│   │   │   │       ├── projects/
│   │   │   │       ├── scans/
│   │   │   │       ├── ai/
│   │   │   │       ├── stripe/
│   │   │   │       ├── github/
│   │   │   │       └── usage/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   └── hooks/
│   │   └── supabase/
│   │       └── migrations/
│   │
│   └── shared/                 ← Shared types and utilities
│       ├── package.json
│       └── src/
│           ├── types.ts        ← Shared TypeScript interfaces
│           ├── schemas.ts      ← Shared Zod schemas
│           └── constants.ts    ← Shared constants
│
├── .github/
│   └── workflows/
│       ├── ci.yml              ← Test + lint + typecheck
│       ├── release-cli.yml     ← Publish CLI to npm
│       └── deploy-web.yml      ← Deploy dashboard
│
└── docs/                       ← Documentation site content
    ├── getting-started.md
    ├── configuration.md
    ├── ci-integration.md
    └── api-reference.md
```

---

## 12. Database Schema (V2 — SaaS Dashboard)

```sql
-- ============================================================
-- PW-Doctor SaaS Database Schema
-- Supabase (PostgreSQL) with Row Level Security
-- ============================================================

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255),
  plan VARCHAR(20) DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  -- Usage limits (per billing period)
  ai_repairs_limit INTEGER DEFAULT 0,     -- 0 = no AI on free
  ai_repairs_used INTEGER DEFAULT 0,
  billing_period_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar_url TEXT,
  github_username VARCHAR(50),
  organization_id UUID REFERENCES organizations(id),
  role VARCHAR(20) DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys (for CLI auth and CI)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,         -- "CI Pipeline", "Local Dev"
  key_prefix VARCHAR(8) NOT NULL,     -- First 8 chars for identification
  key_hash VARCHAR(255) NOT NULL,     -- bcrypt hash of full key
  scopes TEXT[] DEFAULT '{"read","write","scan"}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  repo_url TEXT,
  base_url TEXT,
  config JSONB DEFAULT '{}',
  -- Cached health stats (updated after each scan)
  total_selectors INTEGER DEFAULT 0,
  healthy_selectors INTEGER DEFAULT 0,
  broken_selectors INTEGER DEFAULT 0,
  health_percentage DECIMAL(5,2) DEFAULT 100.00,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- Scans
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES users(id),
  trigger_source VARCHAR(20) NOT NULL
    CHECK (trigger_source IN ('cli', 'ci', 'scheduled', 'watch')),
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  -- Results
  total_selectors INTEGER DEFAULT 0,
  healthy INTEGER DEFAULT 0,
  broken INTEGER DEFAULT 0,
  repaired INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  rolled_back INTEGER DEFAULT 0,
  needs_review INTEGER DEFAULT 0,
  skipped_dynamic INTEGER DEFAULT 0,
  -- Context
  git_commit VARCHAR(40),
  git_branch VARCHAR(100),
  cli_version VARCHAR(20),
  -- Timing
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  -- Full report artifact
  report_json JSONB
);
CREATE INDEX idx_scans_project ON scans(project_id, started_at DESC);

-- Selectors (cumulative registry of all selectors found)
CREATE TABLE selectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Identity (unique per project + file + position)
  file_path VARCHAR(500) NOT NULL,
  line_number INTEGER NOT NULL,
  column_number INTEGER,
  -- Selector details
  selector_value TEXT NOT NULL,
  selector_type VARCHAR(20) NOT NULL
    CHECK (selector_type IN (
      'css', 'text', 'role', 'testid', 'label',
      'placeholder', 'alttext', 'title', 'xpath', 'id', 'dynamic'
    )),
  api_method VARCHAR(30) NOT NULL, -- 'locator', 'getByRole', etc.
  -- Analysis
  intent VARCHAR(200),           -- AI-inferred or user-tagged
  fragility_score INTEGER DEFAULT 50 CHECK (fragility_score BETWEEN 0 AND 100),
  -- Status tracking
  status VARCHAR(20) DEFAULT 'unknown'
    CHECK (status IN ('healthy', 'broken', 'flaky', 'degraded', 'unknown')),
  last_validated_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  total_repairs INTEGER DEFAULT 0,
  -- Metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, file_path, line_number, column_number)
);
CREATE INDEX idx_selectors_project_status ON selectors(project_id, status);
CREATE INDEX idx_selectors_project_file ON selectors(project_id, file_path);
CREATE INDEX idx_selectors_fragility ON selectors(project_id, fragility_score DESC);

-- Repairs
CREATE TABLE repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  selector_id UUID NOT NULL REFERENCES selectors(id) ON DELETE CASCADE,
  -- Change
  old_selector TEXT NOT NULL,
  old_method VARCHAR(30) NOT NULL,
  new_selector TEXT NOT NULL,
  new_method VARCHAR(30) NOT NULL,
  -- How it was fixed
  strategy VARCHAR(30) NOT NULL
    CHECK (strategy IN (
      'text_match', 'attribute_match', 'structural_match',
      'anchor_match', 'ai', 'manual'
    )),
  confidence DECIMAL(5,2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  reasoning TEXT,
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'proposed'
    CHECK (status IN (
      'proposed', 'applied', 'verified', 'rolled_back',
      'pending_review', 'approved', 'rejected'
    )),
  -- AI usage tracking
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_cents INTEGER DEFAULT 0,
  -- Timestamps
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX idx_repairs_scan ON repairs(scan_id);
CREATE INDEX idx_repairs_selector ON repairs(selector_id, proposed_at DESC);
CREATE INDEX idx_repairs_status ON repairs(status) WHERE status = 'pending_review';

-- Selector Health History (time series for trend charts)
CREATE TABLE selector_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  total_selectors INTEGER NOT NULL,
  healthy INTEGER NOT NULL,
  broken INTEGER NOT NULL,
  health_percentage DECIMAL(5,2) NOT NULL,
  mean_fragility DECIMAL(5,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_health_history ON selector_health_history(project_id, recorded_at DESC);

-- API Usage (for billing)
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id),
  operation VARCHAR(50) NOT NULL
    CHECK (operation IN ('scan', 'repair_heuristic', 'repair_ai', 'verify')),
  ai_tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usage_org ON api_usage(organization_id, recorded_at DESC);
CREATE INDEX idx_usage_billing ON api_usage(
  organization_id,
  recorded_at DESC
) WHERE operation = 'repair_ai';

-- Integrations
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('github', 'gitlab', 'slack')),
  config JSONB NOT NULL,         -- Encrypted connection details
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'error')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device Code Auth (for CLI login flow)
CREATE TABLE device_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code VARCHAR(10) NOT NULL UNIQUE,  -- "ABCD-1234"
  device_code VARCHAR(64) NOT NULL UNIQUE, -- Long random string (CLI polls with this)
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'expired')),
  authorized_user_id UUID REFERENCES users(id),
  api_key_id UUID REFERENCES api_keys(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_device_codes_device ON device_codes(device_code)
  WHERE status = 'pending';

-- ============================================================
-- Row Level Security Policies
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE selectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read their own org's data
CREATE POLICY "Users read own org" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users read own org projects" ON projects
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users read own org scans" ON scans
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE u.id = auth.uid()
    )
  );

-- Admins/owners can write
CREATE POLICY "Admins write projects" ON projects
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
```

---

## 13. API Routes (V2 — SaaS)

```
POST   /api/auth/device-code          Create device code for CLI login
POST   /api/auth/device-code/poll     CLI polls for authorization
POST   /api/auth/device-code/authorize User authorizes device code (web)
POST   /api/auth/verify               Verify API key validity
DELETE /api/auth/api-keys/:id         Revoke API key

GET    /api/projects                  List projects for org
POST   /api/projects                  Create project
GET    /api/projects/:id              Get project detail
PATCH  /api/projects/:id              Update project
DELETE /api/projects/:id              Delete project

POST   /api/projects/:id/scans        Upload scan results from CLI
GET    /api/projects/:id/scans        List scans
GET    /api/projects/:id/scans/:sid   Get scan detail
GET    /api/projects/:id/selectors    List selectors with health
GET    /api/projects/:id/repairs      List repairs
PATCH  /api/projects/:id/repairs/:rid Approve/reject pending repair
GET    /api/projects/:id/health       Health history for trend chart

GET    /api/usage                     Usage stats for billing
GET    /api/usage/current-period      Current billing period usage

POST   /api/stripe/webhook            Stripe webhook handler
POST   /api/stripe/checkout           Create checkout session
POST   /api/stripe/portal             Create customer portal session

POST   /api/github/webhook            GitHub App webhook
GET    /api/github/install             GitHub App installation URL

GET    /api/team                       List team members
POST   /api/team/invite               Send team invitation
DELETE /api/team/:userId               Remove team member
PATCH  /api/team/:userId/role          Update member role
```

---

## 14. CI/CD Integration

### GitHub Actions (Provided Action)

```yaml
# .github/workflows/pw-doctor.yml
name: PW-Doctor Selector Health Check

on:
  pull_request:
    branches: [main]

jobs:
  selector-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run PW-Doctor Check
        run: npx pw-doctor check --ci --report json
        env:
          PW_DOCTOR_API_KEY: ${{ secrets.PW_DOCTOR_API_KEY }}

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: pw-doctor-report
          path: .pw-doctor/reports/latest.json
```

### GitHub App (V2 — PR Comments)

When installed, the GitHub App:
1. Listens for `pull_request.opened` and `pull_request.synchronize` events
2. Triggers a scan via the API
3. Posts a PR comment with selector health report:

```markdown
## 🩺 PW-Doctor Selector Health Report

| Metric | Value |
|---|---|
| Selectors checked | 247 |
| Healthy | 244 (98.8%) |
| Broken | 3 |
| Auto-fixable | 2 (confidence ≥ 85%) |

### Broken Selectors

| File | Selector | Confidence | Fix |
|---|---|---|---|
| `login.spec.ts:42` | `.btn-primary` | 94% | `[data-testid="submit"]` |
| `cart.spec.ts:18` | `.cart-item:nth(0)` | 71% | `role=listitem` |
| `nav.spec.ts:55` | `.nav-link.active` | 38% | Manual review needed |

Run `npx pw-doctor heal` to apply fixes locally.
```

### Exit Code Contract

| Code | Meaning | CI behavior |
|---|---|---|
| 0 | All selectors healthy | Pipeline passes |
| 1 | Broken selectors detected | Pipeline fails (configurable) |
| 2 | PW-Doctor error (config, connection, etc.) | Pipeline fails |
| 3 | Fixes applied and verified | Pipeline passes (if `--apply` used) |
| 4 | Fixes applied but some verification failed | Pipeline fails |

---

## 15. Security & Privacy

> **Full security audit:** [docs/plans/2026-03-08-security-audit.md](docs/plans/2026-03-08-security-audit.md)
> 58 controls identified across 7 attack surfaces. Summary below.

### Security Architecture Principles

1. **No shell string interpolation** — All child process calls use `execFile()` with array arguments. `exec()` is banned project-wide via ESLint.
2. **No arbitrary code execution from config** — Config uses static format only (JSON/YAML via cosmiconfig). No TypeScript/JS config evaluation.
3. **Path canonicalization** — All file writes verify the resolved path starts with the project root. Symlinks resolved and re-checked.
4. **AI is opt-in** — AI disabled by default (`ai.enabled: false`). Explicit consent required on first enable.
5. **Default dry-run** — No file modifications without explicit `--apply` flag.
6. **Credentials never in project directory** — Stored in `~/.pw-doctor/` only. Git safety checks on startup.

### Data Redaction (Multi-Layer)

All DOM content and test code is redacted before sending to any AI provider:

**Layer 1: Regex patterns**
```typescript
const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer [TOKEN]' },
  { pattern: /(?:key|token|secret|password|auth)[=:]["']?[\w\-./+=]+/gi, replacement: '[SECRET]' },
  { pattern: /\?.*(?:token|key|auth)=[^&"'\s]+/gi, replacement: '?[REDACTED_PARAMS]' },
  { pattern: /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, replacement: '[PHONE]' },
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CARD]' },
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '[UUID]' },
];
```

**Layer 2: HTML attribute stripping** — Remove `value` on password/hidden inputs, `<meta>` tokens, inline event handlers.

**Layer 3: URL sanitization** — Strip query parameters and hash fragments from all URLs.

**Layer 4: User-configurable** — Additional patterns in `redact.patterns` config.

**Layer 5: Preview mode** — `--preview-ai-payload` flag shows exact content that will be sent, without sending it.

### AI Response Validation (Hard Gate)

Every AI-suggested selector is validated before patching:

1. Response must parse as valid JSON matching Zod schema
2. Selector must be valid Playwright selector syntax (no JS expressions, no backticks, no semicolons, no `require`/`import`, < 500 chars)
3. Method must be a known Playwright method
4. Selector must be run against the captured DOM — must match exactly 1 visible element
5. Element must be compatible with the action (e.g., `click` → element is interactive)

If any check fails, the AI suggestion is discarded. Never patched without all 5 passing.

### AI Audit Trail

Every AI call logged to `.pw-doctor/audit/ai-calls.jsonl`:
- Timestamp, selector being repaired, payload size (bytes/tokens), response, redaction rules applied
- Never logs full DOM payload — only hash and size
- Configurable retention

### Credential Storage

```
Primary (OS keychain via keytar):
  macOS: Keychain Access
  Linux: libsecret / GNOME Keyring
  Windows: Windows Credential Manager

Fallback (only when keytar unavailable):
  ~/.pw-doctor/credentials (chmod 600)
  Encrypted with AES-256-GCM, key derived from machine entropy
  DISABLED when CI=true or running as root

Environment variables (CI only):
  PW_DOCTOR_API_KEY — for SaaS sync
  ANTHROPIC_API_KEY — for AI repairs (BYOK)

NEVER accepted as CLI arguments (visible in process list).
```

Git safety: on startup, check if credentials file is tracked by git. If so, refuse to start with CRITICAL warning.

### API Key Security

- Keys generated as `pwd_` + 32 random bytes (base62)
- Stored as bcrypt hash (cost factor 12) in database
- First 8 chars stored as prefix for identification
- Scoped: read, write, scan (enforced via middleware on every route)
- Expirable and revocable
- Multiple active keys per org (for rotation)
- `pw-doctor login --rotate` creates new key and revokes old atomically
- Rate limited: 100/min general, 10/min scan triggers, 5 auth failures → 15-min lockout

### Env Var Isolation

When spawning Playwright child processes, only whitelisted env vars pass through:
`PATH`, `HOME`, `NODE_PATH`, `CI`, `DISPLAY`, `PLAYWRIGHT_*`, `PW_*` (except `PW_DOCTOR_API_KEY`).
`ANTHROPIC_API_KEY` and all other sensitive vars are stripped.

### Tenant Isolation (SaaS)

Four layers of defense:
1. **RLS policies** on all Supabase tables
2. **Application-level** `WHERE organization_id = $user_org_id` on every query
3. **Error reporting** (Sentry) strips org IDs, emails, selector values via `beforeSend`
4. **Integration tests** that create two orgs and verify cross-tenant access returns 404

### Webhook Security

- Stripe: `stripe.webhooks.constructEvent()` with signature validation
- GitHub: HMAC-SHA256 with `crypto.timingSafeEqual()` comparison
- Both: reject payloads older than 5 minutes, store delivery ID for idempotency

### GDPR Compliance

| Requirement | Implementation |
|---|---|
| Lawful basis (Art. 6) | Explicit consent for AI processing. Checkbox + timestamp stored. |
| Right of access (Art. 15) | `GET /api/account/export` data export endpoint |
| Right to erasure (Art. 17) | `DELETE /api/account` with CASCADE + Stripe cleanup |
| Data minimization (Art. 25) | Upload results summary only by default. Full reports opt-in. |
| Processor agreements (Art. 28) | DPAs with Supabase, Stripe, Anthropic |
| Breach notification (Art. 33) | Incident response: detect → assess → notify within 72 hours |

### Supply Chain Hardening

- npm provenance attestation on publish
- 2FA on npm account
- `npm audit --audit-level=high` in CI (fails build)
- `npm ci` only (never `npm install` in CI)
- Lockfile changes require manual review
- ESLint security rules: ban `exec()`, `eval()`, `dangerouslySetInnerHTML`, `new Function()`
- Pre-commit hook with `gitleaks` for secret scanning

### Security Headers (Dashboard)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### Security Controls Implementation Priority

| Phase | Controls (from audit) | Count |
|---|---|---|
| **Phase 1 (CLI MVP)** — blocks release | Config sandboxing, exec() ban, path canonicalization, AI response validation, selector syntax check, DOM-verify-before-patch, credentials in HOME, git safety | 8 |
| **Phase 1 (within 2 weeks)** | Supply chain, file permissions, env var isolation, multi-layer redaction, error sanitization, payload limits, audit log, ESLint rules | 10 |
| **Phase 4 (SaaS launch)** | Scope enforcement, tenant isolation, webhook validation, RBAC, CSP, rate limiting, session config, security logging, SSRF prevention | 19 |
| **Phase 6 (Enterprise)** | Data retention, account deletion, data residency, key rotation, GitHub App permissions, Supabase Vault, backup security, GDPR docs | 11 |

---

## 16. Monetization

### Pricing Tiers

| Feature | Free | Pro ($29/mo per repo) | Team ($19/mo per seat, min 5) |
|---|---|---|---|
| `pw-doctor check` | Unlimited | Unlimited | Unlimited |
| Heuristic repairs | Unlimited | Unlimited | Unlimited |
| AI repairs (BYOK) | 10/month | 200/month | 500/month per seat |
| Max files per heal | 5 | 20 | Unlimited |
| CI mode | Basic (exit codes) | Full (JSON + API sync) | Full |
| Dashboard | — | Scan history + trends | Full + team management |
| GitHub PR comments | — | Yes | Yes |
| Team members | 1 | 1 | Unlimited |
| API access | — | Yes | Yes |
| Slack alerts | — | — | Yes |
| Support | Community | Email | Priority |

### Why Per-Repo (Pro) + Per-Seat (Team)

- **Solo developers** care about repos, not seats. $29/repo is a no-brainer for a repo with 500+ selectors.
- **Teams** care about seats because multiple people need dashboard access, review queues, and role management.
- This avoids the CODEX_APPENDIX's criticism of seat-based pricing for a workload-driven product while still supporting team scale.

### Usage Controls

- Hard monthly caps per plan (no overages in V1 — upgrade or wait)
- Per-run token budget and max AI calls (configurable in .pw-doctor.config.ts)
- Automatic downgrade to heuristic-only when AI budget exhausted
- Usage dashboard showing consumption trend

---

## 17. Quality Gates

These gates must pass before expanding scope to V2 (dashboard, billing, integrations).

| Gate | Metric | Threshold | Measurement |
|---|---|---|---|
| Detection precision | True positives / (True positives + False positives) | ≥ 0.90 | 10 real repos, 500+ selectors |
| Fix acceptance | Fixes accepted by human / Total fixes proposed | ≥ 0.60 | First 20 pilot users |
| False-fix rate | Verified fixes that actually break tests / Total verified | ≤ 0.03 | Post-verification regression |
| Performance | `check` duration on 500 selectors | ≤ 6 min | Standard CI runner (4 CPU, 8GB RAM) |
| Gross margin | Revenue - AI costs - infra | > 0 | Pilot paying cohort |

**Failing any gate blocks V2 expansion. Fix core repair engine first.**

### Calibration Harness

```typescript
// .pw-doctor/calibration/corpus.json
// A curated set of known breakages and known-good fixes
// Used to measure detection precision and fix quality

interface CalibrationEntry {
  testFile: string;
  breakageType: 'class_rename' | 'dom_restructure' | 'element_removed'
    | 'attribute_change' | 'text_change' | 'dynamic_content';
  brokenSelector: string;
  expectedFix: string;        // The known-correct fix
  acceptableAlternatives: string[]; // Other acceptable fixes
}

// Run: pw-doctor calibrate --corpus ./calibration-corpus.json
// Output: precision, recall, fix-acceptance-rate, false-fix-rate
```

---

## 18. Risk Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Low repair accuracy on dynamic apps | High | Critical | Verification-first, dry-run default, gradual auto-apply rollout |
| AI costs exceed revenue | Medium | High | BYOK only, hard caps, heuristic-first pipeline, per-run token budgets |
| Trust collapse from bad edits | Medium | Critical | Default dry-run, explicit review, atomic rollback, verification gate |
| Weak adoption / setup burden | Medium | High | `pw-doctor init` auto-detection, opinionated defaults, <5 min to first scan |
| Bot detection on live sites | Medium | Medium | Use project's own test infrastructure, not production crawling |
| AST parsing edge cases | High | Medium | Report unsupported patterns explicitly, never silently skip |
| Competitor bundling | Low | Medium | Build repair dataset moat, open-source goodwill, speed advantage |
| Context-dependent selectors | High | Medium | Run actual tests (not independent validation), capture DOM at failure point |

---

## 19. Phased Roadmap

### Phase 1: Core CLI — AST + Test Running (Weeks 1–4)

**Goal:** The CLI can parse Playwright tests, run them, detect failures at locator calls, and report broken selectors.

- [ ] Monorepo setup (Turborepo: cli, shared)
- [ ] CLI skeleton with commander (init, check commands)
- [ ] Config system with cosmiconfig + Zod validation (JSON/YAML only — no TS/JS eval) [C1.1]
- [ ] AST selector extractor (all Playwright locator patterns)
- [ ] Fragility scorer
- [ ] Playwright test runner wrapper (run tests, catch TimeoutError)
- [ ] DOM capture at failure point (page.content() + accessibility snapshot)
- [ ] Terminal reporter (table output with chalk + cli-table3)
- [ ] JSON reporter (versioned schema)
- [ ] `pw-doctor init` — auto-detect project, create config, add .pw-doctor/ to .gitignore
- [ ] `pw-doctor check` — end-to-end working with exit codes
- [ ] ESLint security rules: ban exec(), eval(), dangerouslySetInnerHTML [CC4.1]
- [ ] Path canonicalization utility — all writes verified within project root [C1.3]
- [ ] execFile()-only child process utility — no exec() anywhere [C1.2]
- [ ] Global error sanitizer — strip secrets/DOM from error messages [CC1.1]

**Deliverable:** `pw-doctor check` works on a real Playwright project and reports broken selectors. Security baseline enforced from day one.

### Phase 2: Heuristic Repair + Verification (Weeks 5–8)

**Goal:** The CLI can fix simple selector breakages using heuristics and verify fixes.

- [ ] DOM analyzer (Cheerio-based, extract elements with attributes)
- [ ] Repair pipeline orchestrator
- [ ] Strategy 1: Text content match
- [ ] Strategy 2: data-testid / semantic attribute search
- [ ] Strategy 3: Structural similarity (fuse.js fuzzy matching)
- [ ] Strategy 4: Neighboring anchor
- [ ] Candidate ranker with confidence scoring
- [ ] AST patcher (recast — preserves formatting)
- [ ] Verification engine (re-run affected test)
- [ ] Rollback engine (git checkout via execFile + backup) [C1.2]
- [ ] Backup system (.pw-doctor/backups/, 0o700/0o600 permissions) [C1.5]
- [ ] Run history storage (.pw-doctor/history/, Zod-validated on read) [C1.8]
- [ ] Env var whitelist for Playwright child processes [C1.6]
- [ ] `pw-doctor heal --dry-run` working end-to-end
- [ ] `pw-doctor heal --apply` with safety guardrails (max files, max replacements)
- [ ] `pw-doctor verify` working
- [ ] Interactive mode with @clack/prompts
- [ ] Credential storage in ~/.pw-doctor/ with git safety checks [C6.1, C6.3]

**Deliverable:** `pw-doctor heal` fixes class-name changes and simple structural shifts without AI. Secure file handling throughout.

### Phase 3: AI Fallback + CI Mode (Weeks 9–12)

**Goal:** AI-powered repair for complex breakages. CI-ready.

- [ ] AI repair adapter (Anthropic SDK, BYOK)
- [ ] AI consent gate — first-enable requires explicit opt-in [C7.5]
- [ ] Multi-layer DOM redactor (regex + attribute strip + URL sanitize + user patterns) [C2.1]
- [ ] `--preview-ai-payload` flag — show what will be sent without sending [C2.1]
- [ ] DOM preprocessor (strip SVGs, styles, scripts)
- [ ] Smart DOM truncation (max 32KB after preprocessing) [C2.5]
- [ ] AI prompt template with structured JSON output
- [ ] Strict AI response validation — Zod schema, selector syntax check, no code injection [C2.2, C2.3]
- [ ] Run AI-suggested selector against captured DOM before patching (hard gate) [C2.7]
- [ ] AI error sanitization — strip API keys from error objects [C2.4]
- [ ] AI call audit log (.pw-doctor/audit/ai-calls.jsonl) [C2.6]
- [ ] Token budget tracking per run
- [ ] AI cost estimation
- [ ] CI mode (--ci flag, JSON output, no prompts, masked secrets in output) [C5.1]
- [ ] `pw-doctor report` with HTML output
- [ ] Calibration harness and benchmark runner
- [ ] Quality gate measurement tooling
- [ ] Watch mode (`pw-doctor watch`)
- [ ] npm package preparation (ESM, bin entry, peer deps)
- [ ] Supply chain: npm provenance, lockfile CI check, 2FA [C1.4]
- [ ] Platform-specific credential handling (keytar + encrypted fallback) [C6.2, C6.5]
- [ ] `pw-doctor login --rotate` and `pw-doctor logout` [C6.4]
- [ ] Pre-commit gitleaks hook [CC4.3]

**Deliverable:** Full CLI feature-complete. Publishable to npm. Measurable quality. Full security controls for CLI tier.

### Phase 4: SaaS Foundation (Weeks 13–16)

**Goal:** Dashboard for scan history, auth, API sync.

- [ ] Next.js 15 web app setup with security headers middleware [C4.6]
- [ ] Content Security Policy configuration [C4.4]
- [ ] Supabase project, auth, database migration
- [ ] RLS policies on all tables [C3.4]
- [ ] Application-level org scoping on every query (defense-in-depth) [C3.4]
- [ ] Cross-tenant isolation integration tests [C3.4]
- [ ] Device code auth flow with rate limiting (RFC 8628) [C3.1]
- [ ] API key management (create, revoke, list, multiple per org) [C3.2]
- [ ] API scope enforcement middleware — every route declares required scope [C3.2]
- [ ] Tiered rate limiting (per-IP unauthenticated, per-key authenticated, per-operation) [C3.5]
- [ ] Session config: 1h access tokens, 7d refresh with rotation, secure cookies [C3.8]
- [ ] API routes: projects, scans, selectors, repairs
- [ ] Output encoding: all dynamic content in React via code blocks, never dangerouslySetInnerHTML [C4.3]
- [ ] SSRF prevention: repo_url/base_url are display-only, never fetched server-side [C4.11]
- [ ] CLI → SaaS sync (upload results summary only by default, full reports opt-in) [C7.2]
- [ ] Dashboard: project list, health badges
- [ ] Dashboard: project detail with selector health chart (Recharts)
- [ ] Dashboard: scan detail view
- [ ] Dashboard: repair review queue (approve/reject)
- [ ] Security event logging: auth events, key operations, scan triggers [C4.10]
- [ ] Landing page (Next.js, keep glassmorphism design)

**Deliverable:** Minimal viable dashboard with security controls baked in. CLI can sync to cloud. Users can review fixes in browser.

### Phase 5: Billing + CI Integration (Weeks 17–20)

**Goal:** Paying customers. GitHub integration.

- [ ] Stripe integration (subscriptions, checkout, portal)
- [ ] Stripe webhook signature validation [C3.6]
- [ ] Usage tracking and billing enforcement
- [ ] GitHub Actions template (provided YAML)
- [ ] GitHub App with minimal permissions (PR write, checks write, contents read) [C5.5]
- [ ] GitHub webhook HMAC-SHA256 validation with timing-safe comparison [C3.6]
- [ ] PR scan authorization: only scan PRs from repo collaborators [C5.3]
- [ ] PR comment content escaping — all dynamic values in code blocks [C5.2]
- [ ] Webhook idempotency (delivery ID dedup, timestamp validation) [C5.4]
- [ ] Slack integration (scan results, breakage alerts)
- [ ] Scan trigger throttling: max 3 concurrent per org, 10/hour per project [C4.5]
- [ ] Team invitations and role management with RBAC middleware [C4.1]
- [ ] Health trend charts and historical analytics
- [ ] Pricing page
- [ ] Documentation site

**Deliverable:** PW-Doctor is a monetized product with CI integration. All webhook and CI security controls enforced.

### Phase 6: Growth + Polish (Weeks 21–24)

**Goal:** Product-market fit validation, 50 paying teams.

- [ ] Onboarding optimization (<5 min to first scan)
- [ ] Email: welcome, scan reports, weekly digests
- [ ] Open source: README, CONTRIBUTING.md, LICENSE (MIT for CLI)
- [ ] Product Hunt launch
- [ ] Content marketing: blog posts, tutorials
- [ ] Community: Discord server
- [ ] Proactive suggestions ("Migrate 23 CSS selectors to data-testid")
- [ ] Cross-project analytics (Team tier)
- [ ] Deploy dashboard to Cloudflare Workers (OpenNext)
- [ ] Sentry error monitoring with PII stripping (beforeSend) [C7.7]
- [ ] PostHog product analytics with anonymous IDs [C7.7]
- [ ] Data retention policy: 90d scans, 30d backups, `pw-doctor clean` command [C7.3]
- [ ] Account deletion flow (CASCADE + Stripe cleanup) [C7.4]
- [ ] Data residency documentation [C7.6]
- [ ] Integration config encryption via Supabase Vault [C4.2]
- [ ] GDPR: privacy policy, data export endpoint, DPAs with sub-processors [C7.4, C7.5]
- [ ] Incident response playbook: detect → assess → notify within 72 hours

**Deliverable:** Launched product with paying customers, growth trajectory, and compliance baseline for enterprise sales.

---

## 20. Success Criteria — The User Story

A QA engineer at a 50-person SaaS company:

1. `npm install -g pw-doctor` in their existing Playwright project
2. `pw-doctor init` — scans the project: "Found 247 selectors. 12 are fragile (CSS class-based). Health: 95.7%"
3. `pw-doctor check` — runs tests, finds 3 broken selectors, reports in a clear table
4. `pw-doctor heal` — proposes 3 fixes:
   - `.btn-primary` → `[data-testid="submit"]` (94%, heuristic: text match)
   - `.cart-item:nth(0)` → `role=listitem` (71%, AI: structural change)
   - `.nav-link.active` → needs manual review (38%, AI: ambiguous intent)
5. Applies the two high-confidence fixes interactively
6. `pw-doctor verify` — re-runs affected tests, both pass. Fix confirmed.
7. `git diff` — clean, minimal changes. Only selector strings changed.
8. Commits. PR merges. CI includes `pw-doctor check` — green.
9. Links to dashboard — sees health trend over last 30 days, repair history
10. Sets up GitHub App — every PR now shows selector health report
11. Gets Slack notification when Monday's deploy breaks a selector — suggested fix in the PR comment within minutes

Time from install to first verified fix: **< 15 minutes**.
