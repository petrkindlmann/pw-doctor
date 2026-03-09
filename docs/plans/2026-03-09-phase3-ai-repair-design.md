# Phase 3: AI Repair, Interactive Mode & Publish — Design Doc

> **Status:** IMPLEMENTED — All features delivered + gap fixes + security audit. 417 tests passing.

## Decisions

- **AI providers**: Anthropic + OpenAI from day one via provider-agnostic `AiRepairAdapter` interface
- **DOM capture**: Custom Playwright fixture + reporter plugin. Fixture wraps `page`, captures `page.content()` on failure via `testInfo.attachments`. Reporter reads attachments and writes HTML to `.pw-doctor/captures/`
- **Credentials**: Env vars only (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). `pw-doctor credentials check` verifies they're set
- **Interactive mode**: Per-candidate approve/edit/skip with confidence scores displayed. readline-based prompts
- **Watch mode**: chokidar file watcher on `*.spec.ts`/`*.test.ts` files, re-runs heal on changed file
- **DOM redaction**: Moderate defaults — strip scripts/styles/comments, scrub sensitive patterns (emails, JWTs, API keys), preserve text content and selector-relevant attributes. Configurable via preset + overrides
- **npm publish**: Single `pw-doctor` package with shared bundled in

## Architecture

### DOM Capture Flow
```
Playwright test run (with pw-doctor fixture)
  → test fails
  → fixture captures page.content() via testInfo.attach()
  → reporter onTestEnd reads attachment
  → writes to .pw-doctor/captures/<hash>.html
  → heal command reads captured HTML for repair
```

### AI Repair Flow
```
Captured HTML
  → dom-redactor strips sensitive data
  → AiRepairAdapter.suggestRepair(redactedHtml, failureContext)
  → provider-specific implementation (Anthropic/OpenAI)
  → returns RepairCandidate[]
  → merged with heuristic candidates
  → ranked by candidate-ranker
```

### Interactive Mode Flow
```
For each failure with candidates:
  Show ranked candidates with scores
  → [a]pply best / [n] pick candidate N / [e]dit / [s]kip / [q]uit
  → if edit: open readline for manual selector input
  → apply chosen candidate via AST patcher
```

## Type Changes (packages/shared)

- `ai.provider`: `'anthropic'` → `'anthropic' | 'openai'`
- `redact`: expand with `preset`, `preserveAttributes`, `stripSelectors`, `maxDepth`, `maxSize`
- New: `AiRepairInput`, `AiRepairResponse` interfaces

## Security Controls

- C2.1: DOM redaction before any AI call (moderate defaults)
- C2.2: Token budget enforcement (maxCallsPerRun, tokenBudgetPerRun)
- C2.3: No credentials stored on disk — env vars only
- C2.4: AI responses validated with Zod before use
- C2.5: CI mode strips all sensitive data from output
- C2.6: Redaction configurable (preset + overrides)
- C2.7: API keys never logged (error-sanitizer.ts already handles this)

## New Dependencies

- `@anthropic-ai/sdk` — Anthropic API client
- `openai` — OpenAI API client
- `chokidar` — File watcher for watch mode

## File Plan

### New files:
- `src/reporter/pw-doctor-fixture.ts` — Playwright fixture for DOM capture
- `src/reporter/pw-doctor-reporter.ts` — Reporter that writes captured HTML
- `src/core/dom-redactor.ts` — HTML redaction pipeline
- `src/ai/ai-adapter.ts` — Provider-agnostic interface
- `src/ai/anthropic-adapter.ts` — Anthropic implementation
- `src/ai/openai-adapter.ts` — OpenAI implementation
- `src/ai/prompt-builder.ts` — Builds repair prompts from failure context
- `src/commands/credentials.ts` — `pw-doctor credentials check`
- `src/commands/watch.ts` — Watch mode command (or flag on heal)
- `src/interactive/prompt.ts` — Interactive candidate selection

### Modified files:
- `packages/shared/src/types.ts` — Updated types
- `packages/shared/src/schemas.ts` — Updated schemas
- `packages/shared/src/constants.ts` — New constants
- `src/repair/repair-pipeline.ts` — Integrate AI strategy
- `src/commands/heal.ts` — Wire DOM capture, AI, interactive, CI sanitization
- `src/index.ts` — Register new commands
- `package.json` — New dependencies, publish config
