# PW-Doctor - Comprehensive Architecture & Product Specification V2

## Document History & Purpose
This document serves as the absolute single source of truth for the PW-Doctor platform. In response to the need for deep, execution-ready architectural guidance, this PRD V2 drastically expands upon earlier scopes. It provides complete data models, explicit AST transformation strategies for Playwright tests, deterministic heal-loop schemas, and security constraints.

This specification is designed to be handed directly to a Senior Engineering team to dictate the next 6 months of development, eliminating ambiguity around test modification and AI fallback integration.

---

## 1. Executive Summary & Architectural Breakage Analysis

### 1.1 The Flaw in V1 Architectures (The "Blind LLM" Trap)
Most "AI Test Healers" fail because they send the broken test code to an LLM and blindly paste the result back into the codebase. 
- **The Context Gap:** The LLM does not know *why* `page.locator('.submit-btn')` failed. It cannot see the live DOM of the web application. It just guesses: "Maybe try `.submit-button`?" which fails 80% of the time.
- **The Mutilation Problem:** Standard script tools use regex to replace selectors, frequently breaking TypeScript syntax or destroying test chaining (`await page.locator('.btn').click()`). 
- **Trust Collapse:** If a tool silently modifies 15 tests, and 4 of those modifications cause subtle false-positives, the QA team will ban the tool from their CI pipeline forever.

### 1.2 The V2 Fix: "Deterministic DOM Extraction + AST Patching"
V2 pivots PW-Doctor to a **Safe, Deterministic Feedback Loop**.
- **The "Heal" Loop:** When a test fails, PW-Doctor re-runs the test in Playwright exactly up to the failure point. It then *pauses*, extracts the live DOM tree of the current page state, and uses pure heuristics (fuzzy string matching, neighboring text) to find the new selector FIRST. AI is only used as a fallback.
- **AST Test Patching:** To inject the fix, it uses Babel/TypeScript AST parsers. It finds the exact AST node for the locator string, safely replaces it, and guarantees the file syntax remains perfectly intact.
- **Atomic Verification:** The tool never commits a change without instantly re-running the test. If it fails, the change is atomically rolled back via Git.

---

## 2. Target User & B2B Wedge Strategy

### 2.1 Primary ICP (Ideal Customer Profile)
- **Persona:** Lead SDET (Software Development Engineer in Test) or QA Automation Lead at a mid-market SaaS company (50-200 engineers).
- **Environment:** They have 500+ Playwright E2E tests running in GitHub Actions.
- **Pain Point:** Product engineers constantly change UI class names or layout structures. E2E tests break in CI. The PR is blocked. The QA engineer spends 4 hours a week just updating `nth-child(2)` to `nth-child(3)` or fixing broken data-testids.

### 2.2 The B2B Wedge (Why they pay)
This tool replaces manual drudgery. If PW-Doctor can automatically generate a verified Git Patch that fixes 5 broken selectors in CI within 3 minutes, it unblocks engineering velocity. They will easily pay $100/mo per repo for this velocity increase.

---

## 3. High-Level System Architecture

### 3.1 Stack Selection
- **CLI Engine:** Node.js (TypeScript) using `commander.js`. Tightly integrated with the local `@playwright/test` execution context.
- **Code Parser:** `@babel/parser` and `recast` (for non-destructive AST string replacement that preserves original code formatting).
- **Heuristic Engine:** `fuse.js` (fuzzy searching the DOM) + custom DOM traversal algorithms.
- **AI Agent (Fallback):** OpenAI API (or Anthropic API via LiteLLM abstraction).

### 3.2 Component Interaction Diagram

```text
[ Broken Test: auth.spec.ts ]
          |
[ 'pw-doctor heal' execution ]
          |
    +-----+-------------------------------------------------------+
    | 1. Run Playwright, catch exception at locator('.old-btn')   |
    | 2. Extract live DOM snapshot (HTML dump).                   |
    | 3. [Heuristic Engine] -> Searches DOM for fuzzy match.      |
    |                 (If fails) -> passes DOM to [AI Engine].    |
    | 4. Find new selector e.g., '[data-testid="login-btn"]'.     |
    | 5. [AST Patcher] -> Overwrites test file locally.           |
    | 6. [Verification] -> Re-runs test.                          |
    |    - Passes? Store success state.                           |
    |    - Fails? Revert git file.                                |
    +-----+-------------------------------------------------------+
          |
[ Outputs 'pw-doctor-patch.patch' & Validation Report ]
```

---

## 4. Deep-Dive: The Repair Engine Contract

### 4.1 The DOM Extractor
If `await page.locator('.submit-btn').click()` times out, PW-Doctor hooks into the Playwright test runner.
```typescript
// Core concept of the doctor hook
try {
  await originalTest();
} catch (e) {
  if (e instanceof playright.errors.TimeoutError) {
    // 1. Snapshot the DOM
    const targetHtml = await page.content();
    // 2. Extract the failing selector string from the AST of the test file
    const failedSelector = extractFailedSelectorFromAST(currentTestPath, e.lineNumber);
    // 3. Queue for Repair
    repairQueue.push({ failedSelector, targetHtml, currentTestPath });
  }
}
```

### 4.2 The Heuristic Priority Pipeline
AI is expensive and slow. Heuristics run first.
1. **Text Match Search:** Did the button text "Submit" stay the same, but the class changed? Find the element containing "Submit" and extract its optimal unique selector.
2. **ID Target Search:** Were `data-testid` attributes added nearby?
3. **AI Fallback:** If logic fails, send the DOM snapshot (stripped of `<svg>` and deep `<style>` tags to save tokens) to GPT-4o with the prompt: *"The selector `x` failed. Find the new optimal selector for the primary action button on this screen."*

### 4.3 Safe AST Patching (Recast)
Using generic regex like `testCode.replace('.submit-btn', '#submit')` will break if another test happens to have the exact same string.
We use AST parsing to find the specific `CallExpression` at the specific line number that triggered the failure, and mutate only that node.

---

## 5. Security & BYOK (Bring Your Own Key)

### 5.1 The Privacy Mandate
Enterprises will not upload their proprietary web app DOM structures to a random startup's backend.
- **Local Execution:** PW-Doctor runs 100% locally on the developer's laptop or in their secure GitHub Actions runner.
- **BYOK AI:** We do not proxy LLM requests through our servers for the MVP. The user must provide `OPENAI_API_KEY` in their `.env`. This guarantees zero data privacy liability for our company.

---

## 6. Output Artifacts & Reporting

### 6.1 `pw-doctor-report.json`
Every run generates a deterministic JSON output.
```json
{
  "run_id": "pwd_098u23",
  "total_failed_tests_detected": 3,
  "successful_heals": 2,
  "failed_heals": 1,
  "heals": [
    {
      "file": "tests/login.spec.ts",
      "line": 42,
      "old_selector": ".btn-primary",
      "new_selector": "[data-testid='login-submit']",
      "strategy_used": "heuristic_text_match",
      "verification_status": "PASS",
      "time_saved_ms": 4500
    }
  ]
}
```

### 6.2 The Reviewable Git Patch
At the end of the run, the tool leaves the files modified in the Git working tree, allowing the QA engineer to run `git diff` and confidently review the exact selector changes before committing.

---

## 7. Monetization & CLI Licensing

### 7.1 "Freemium" via Features
- **Free Tier:** Can run `pw-doctor check` to map out failing selectors, and can use the deterministic `heuristic` engine for basic repairs.
- **Pro Tier ($99/mo per repo):** Requires logging in (`pw-doctor login`) which binds an API token. Unlocks the AI Fallback Pipeline, the Advanced AST Patching limits (modifying > 5 files at once), and enables the CI/CD integration mode (so it can run autonomously in GitHub Actions and output PR comments).

### 7.2 Licensing Enforcement
In CI mode, the CLI checks the `PW_DOCTOR_LICENSE_KEY` environment variable against our Next.js/Supabase backend to authorize the execution of the Pro features.

---

## 8. Phased Execution Roadmap

### Phase 1: AST Extraction & Playwright Hooking (Weeks 1-4)
- Build the Node.js CLI boilerplate.
- Implement the AST parser capable of finding and replacing locators accurately.
- Build the Playwright custom reporter/hook to intercept timeouts and capture the DOM.
- **Output:** The CLI can identify exactly what broke and grab the HTML at that exact microsecond.

### Phase 2: The Heuristic Repair Engine (Weeks 5-8)
- Build the fuzzy DOM searcher.
- Implement selector generation logic (generating the shortest, most robust CSS/XPath selector for a given HTML node).
- Build the automated "Verify" re-run loop.
- **Output:** The CLI can automatically fix simple class-name changes.

### Phase 3: AI Fallback & Safety (Weeks 9-12)
- Implement the BYOK OpenAI adapter.
- Build the DOM-stripper (to reduce token usage before sending to LLMs).
- Implement the atomic git revert mechanism for failed verifications.
- **Output:** The CLI can fix complex structural DOM changes via AI and safely roll them back if they fail.

### Phase 4: CI/CD Integration & Monetization (Weeks 13-16)
- Build the Supabase licensing server.
- Wire up Stripe.
- Create the GitHub Actions composite action that automatically runs PW-Doctor, commits the fix to a new branch, and opens a PR.
- **Go-Live:** Target 10 pilot QA teams.
