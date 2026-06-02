# PRD — pw-doctor

> Version 2.0 · May 2026 · supersedes the deleted `PRD_FINAL.md` (March 2026)
>
> The original PRD assumed a SaaS-first product with the CLI as Phase 1. Reality after building: the CLI is the product; SaaS is deferred to "if and when there's pull." This document reflects that.

## 1. One-line pitch

A CLI that repairs broken Playwright selectors at the exact moment they break — runs your failing tests, captures live DOM at the failure point, finds the right replacement, and patches the test file via AST.

## 2. Problem

Playwright suites degrade as UIs change. Selectors break, CI goes red, an engineer spends an afternoon on grunt work.

**Why existing options fail:**

| Option | Why it falls short |
|---|---|
| Manual repair | 4+ hours/week on a large suite; blocks PRs |
| Regex find-and-replace | Brittle on template literals, string concat, dynamic selectors |
| `data-testid` discipline | Helps, but doesn't catch structural shifts or third-party UI |
| Generic AI (paste into a chat) | No DOM context — guesses blind, ~80% failure rate |
| Codegen / record-and-replay (`playwright codegen`) | Solves writing tests, not maintaining them |
| Other self-healing tools (Healenium, etc.) | Mostly Selenium-era, runtime-only patches, no PR diff |

**The gap:** no tool that (a) runs the real test, (b) captures the real DOM at the real failure, (c) proposes a verified fix, and (d) writes a clean, reviewable patch.

## 3. Users

**Primary:** Engineers and QA on teams with ≥ 50 Playwright tests that fail weekly because of UI changes. Typical signal: a Slack channel where someone says "selectors broke again."

**Secondary:**
- QA automation leads who own cross-project test infra
- DevOps engineers who want test health visible in CI

**Not for:** projects with < 20 tests (manual fix is faster), projects that don't use Playwright (out of scope), projects that already have airtight `data-testid` coverage and zero flake (we add overhead, not value).

## 4. Success metrics

- **Time-to-first-verified-fix < 15 minutes** from `npm install` for a typical user.
- **≥ 50% reduction in manual selector-fix time** within 30 days of adoption.
- **≥ 80% heuristic hit rate** on representative breakages — heuristics are free; AI is the expensive fallback. (Validated by `pw-doctor calibrate` against a real corpus — see TODO.)
- **0 silent file mutations.** Every patch must be visible in `git diff` and reversible.
- **0 AI calls without user consent.** Tracked via audit log.

## 5. Principles

1. **Real failures only.** No scraping live sites, no speculative refactors. Heal what actually broke.
2. **Heuristics first, AI as fallback.** Heuristics are free, deterministic, < 100 ms. AI is BYOK, slow, expensive — only when heuristics can't reach a confident answer.
3. **Default `--dry-run`.** Show the diff, never write without `--apply`.
4. **Reviewable diffs.** AST-patched, formatting preserved, one logical change per fix.
5. **Hostile-input mindset.** AI output is untrusted until validated (schema → syntax → DOM hard gate).
6. **No selector-value telemetry leaving the host.** Audit logs hash, never store, the DOM.

## 6. Scope

### 6.1 In scope (v0.x)

- CLI commands: `init`, `check`, `heal` (with `--watch`), `report`, `calibrate`, `credentials`
- Playwright reporter that captures DOM on test failure
- Repair strategies: `attribute_match`, `text_match`, `structural_match`, `anchor_match`, `ai`
- AI providers: Anthropic Claude, OpenAI GPT (BYOK)
- AST patching with `recast` + `@babel/parser`
- Pre-commit gitleaks hook (opt-in via `init`)
- HTML / JSON / Markdown run reports
- CI-friendly exit codes and JSON output

### 6.2 Deferred (v0.x → v1.0 if demand exists)

- Local-model adapter (Ollama / on-prem)
- Dashboard / SaaS sync
- GitHub App for PR comments
- Slack alerts
- Team management, billing

### 6.3 Non-goals

- Becoming a test runner. Playwright is the runner; we orchestrate it.
- Writing new tests for users. There are better tools (`playwright codegen`).
- Selenium support. Different ecosystem, different selectors, different DOM model.
- Healing flaky tests. We heal *broken* selectors, not *timing-sensitive* assertions. (Heuristics can spot fragility — that's `check`, not `heal`.)
- Selector linting in general. We don't replace `eslint-plugin-playwright`.
- AI-generated whole-test rewrites. The repair scope is the locator string; the rest of the test is untouched.

## 7. Commands

| Command | Purpose |
|---|---|
| `pw-doctor init` | Creates config + `.pw-doctor/` dirs, scans selectors, **prints** Playwright reporter/fixture setup instructions (does not edit `playwright.config`) |
| `pw-doctor check` | Score fragility of existing selectors (no test run); appends to run history |
| `pw-doctor heal` | Repair from captured failures. Default `--dry-run`. Use `--watch` to re-run on file change |
| `pw-doctor report` | Render HTML / JSON / Markdown from `.pw-doctor/history/` (currently surfaces `check`-runs only — `heal` history not yet persisted) |
| `pw-doctor calibrate --corpus <path>` | Benchmark strategy performance against a corpus |
| `pw-doctor credentials check` | Verify `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |

Full flag and exit-code reference: [README.md](../README.md).

## 8. Repair strategies

All applicable strategies generate candidates; the ranker picks the best by `confidence + method resilience − fragility penalty`. The four heuristic strategies are fast synchronous calls; the AI strategy is the only async one and is skipped when a heuristic already clears the threshold.

| # | Strategy | Generates a candidate when | Typical confidence |
|---|---|---|---|
| 1 | `attribute_match` | `data-testid` / ARIA role / `aria-label` is present near the target | up to 0.95 |
| 2 | `text_match` | A unique visible text node maps to the failing element | up to 0.90 |
| 3 | `structural_match` | Same tag + class overlap + DOM position can be re-established | up to 0.80 |
| 4 | `anchor_match` | A stable landmark (heading, `<nav>`, `[data-testid]`) is close enough | up to 0.85 |
| 5 | `ai` | Adapter configured + DOM available + consent granted | up to 0.95 (gated by DOM check) |

Ranking computes a final score `confidence + METHOD_RESILIENCE[method] − round(fragility × 0.25)` and bucketizes into `auto_apply | suggest | skip` against `autoApplyThreshold` and `suggestThreshold` (the bucket gates on the final score, not raw confidence). Ties break deterministically: resilience → strategy priority → selector. A fallback ladder **is** in effect — when any heuristic candidate already clears `autoApplyThreshold`, the AI call is skipped to save cost and latency.

Thresholds are configurable: `--min-confidence` plus `repair.autoApplyThreshold` / `repair.suggestThreshold` in config.

## 9. Quality gates for AI

Every AI suggestion passes these gates before it can patch a file. Any failure discards the suggestion (logged for audit, never logged with DOM content).

**Implemented today:**

1. **Schema gate.** `AiResponseSchema` (Zod) validates the response shape: `candidates[]` of `{ selector, method, confidence: 0–100, reasoning }`. Field types only — selector-string content is checked in the next gate.
2. **Selector validator.** Rejects empty selectors, selectors ≥ 500 chars, backticks, semicolons, newlines, `require(`, `import `, `eval(`, `Function(`, and unknown locator methods.
3. **DOM hard gate.** Selector run against the captured DOM must match exactly **one visible element**.

**Not yet implemented (TODO):**

- Block `${}` template-literal escapes in selector strings
- Parse the selector as a Playwright locator expression (today the validator does string-level checks but no AST parse)
- Verify the matched element's tag/role is compatible with the original action (`click` → interactive, etc.)

## 10. Data flow

```
playwright test ─▶ pw-doctor fixture (testInfo.attach 'pw-doctor-dom')
                          │
                          ▼
                  pw-doctor reporter
                          │
                          ▼
              .pw-doctor/captures/<fileHash>-<testHash>.html

pw-doctor heal
  ├─ collect failures from Playwright JSON output / error strings
  ├─ for each failure:
  │   ├─ load matching DOM capture (by hash)
  │   ├─ redact DOM once (C2.1)
  │   ├─ generate candidates IN PARALLEL:
  │   │     ├─ strategies 1..4 (heuristic)
  │   │     └─ ai (if adapter + consent + DOM)
  │   │           ├─ schema gate (C2.2)
  │   │           ├─ selector validator (string-level checks)
  │   │           ├─ DOM hard gate (C2.7)
  │   │           └─ audit log (C2.6)
  │   ├─ rank: confidence + method resilience
  │   ├─ if best ≥ autoApplyThreshold:
  │   │     ├─ backup → .pw-doctor/backups/<runId>/<flat-path>
  │   │     ├─ AST-patch the file via recast
  │   │     └─ re-run that test → keep | restore from backup
  │   └─ else: emit "suggest" or skip
  └─ exit with 0/1/3/4
```

The AST + fragility scoring used by `check` is **not** part of the heal pipeline — heal works from runtime failure data, not static scanning.

## 11. Non-functional requirements

| Requirement | Target | How measured |
|---|---|---|
| Cold-start `--help` | < 200 ms | manual |
| Heuristic repair | < 100 ms per selector | calibrate harness |
| AI repair (Sonnet 4.6) | < 5 s p95 per selector | calibrate harness |
| Per-run AI cost | configurable cap; default 50k tokens / run | audit log |
| Memory | < 256 MB working set on a 1k-test suite | manual |
| Crash safety | Each file is copied to `.pw-doctor/backups/<runId>/<flattened-path>` before patching | `backup.ts` tests |

## 12. May 2026 ecosystem assumptions

- **Playwright ≥ 1.40** with locator-first API (`getByRole`, `getByText`, `getByLabel`, …). pw-doctor generates these by default; CSS-selector output reserved for cases where role-based locators can't disambiguate.
- **Anthropic SDK** — Sonnet 4.6 / Opus 4.7 / Haiku 4.5 are the current model line. Default config still points at `claude-sonnet-4-20250514` (pre-4.6) — flagged for update.
- **OpenAI SDK** — GPT-5.x line is current. Adapter speaks the OpenAI Chat Completions JSON contract; no SDK-specific assumptions beyond that.
- **Node ≥ 20** (22 LTS).
- **No browser/runtime telemetry.** The Playwright trace-viewer ecosystem covers debug; we do not duplicate it.

## 13. Risks & open questions

| Risk | Mitigation |
|---|---|
| AI provider deprecates the model in `ai.model` default | Default model fed from `@pw-doctor/shared` constant; bump in CHANGELOG releases. |
| Playwright changes locator API surface | Selector validator + DOM hard gate are version-agnostic; calibrate-corpus catches regressions. |
| Heuristics overfit to existing corpus | `calibrate` against open-source Playwright projects; track per-strategy hit rate over time. |
| Users disable redaction and leak secrets | Default redaction is "moderate"; consent gate explains the trade. `--preview-ai-payload` flag is the escape hatch. |
| BYOK costs surprise users | Cost estimator runs before each AI call; per-run token budget enforced; CHANGELOG documents pricing assumptions. |

## 14. Out-of-band references

- [ARCHITECTURE.md](ARCHITECTURE.md) — implementation map
- [../SECURITY.md](../SECURITY.md) — controls catalogue & threat model
- [../TODO.md](../TODO.md) — known follow-ups
- [../CHANGELOG.md](../CHANGELOG.md) — version history
- Recovered originals: `.archive/recovered/` (not in published package)
