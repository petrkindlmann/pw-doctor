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

- CLI commands: `init`, `check`, `heal`, `watch`, `report`, `calibrate`, `credentials`
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
| `pw-doctor init` | Reporter wiring, config file, `.gitignore` entries, optional gitleaks hook |
| `pw-doctor check` | Score fragility of existing selectors (no test run) |
| `pw-doctor heal` | Repair from captured failures. Default `--dry-run` |
| `pw-doctor watch` | Continuous heal on file change |
| `pw-doctor report` | Render HTML / JSON / Markdown from `.pw-doctor/history/` |
| `pw-doctor calibrate --corpus <path>` | Benchmark strategy performance against a corpus |
| `pw-doctor credentials check` | Verify `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |

Full flag and exit-code reference: [README.md](../README.md).

## 8. Repair strategies

Run in priority order; first high-confidence match wins.

| # | Strategy | When it wins | Confidence ceiling |
|---|---|---|---|
| 1 | `attribute_match` | `data-testid` / ARIA role / `aria-label` present near the original target | 0.95 |
| 2 | `text_match` | Unique visible text → `getByText` | 0.90 |
| 3 | `structural_match` | Same tag + class overlap + DOM position match | 0.80 |
| 4 | `anchor_match` | Relative path from a stable landmark (heading, `<nav>`, `[data-testid]`) | 0.85 |
| 5 | `ai` | All heuristics below `min-confidence`. Requires consent + key. | 0.95 (gated by DOM check) |

Confidence ceilings are upper bounds; per-fix confidence is lower when the signal is weaker. Threshold is configurable: `--min-confidence`.

## 9. Quality gates for AI

Every AI suggestion passes three gates before it can patch a file. Any failure discards the suggestion silently (logged for audit, never logged with DOM content).

1. **Schema gate.** Zod parses the response; selector ≤ 500 chars; no `${}`, backticks, semicolons, `require`, `import`.
2. **Syntax gate.** Selector must parse as a valid Playwright locator expression.
3. **DOM hard gate.** Selector run against the captured DOM must match exactly **one** visible element whose tag/role is compatible with the original action.

## 10. Data flow

```
playwright test ─▶ pw-doctor reporter ─▶ DOM snapshot to .pw-doctor/
                                                │
                                                ▼
                                  pw-doctor heal
                                  ├─ load snapshot
                                  ├─ extract failing selector (AST)
                                  ├─ score fragility
                                  ├─ try strategies 1..4
                                  ├─ if below threshold:
                                  │   ├─ check AI consent (C7.5)
                                  │   ├─ redact DOM (C2.1)
                                  │   ├─ call provider (BYOK)
                                  │   ├─ schema + syntax + DOM gate (C2.2/3/7)
                                  │   └─ audit log (C2.6)
                                  ├─ rank candidates
                                  ├─ AST patch test file (backup first)
                                  └─ re-run test → verify | rollback
```

## 11. Non-functional requirements

| Requirement | Target | How measured |
|---|---|---|
| Cold-start `--help` | < 200 ms | manual |
| Heuristic repair | < 100 ms per selector | calibrate harness |
| AI repair (Sonnet 4.6) | < 5 s p95 per selector | calibrate harness |
| Per-run AI cost | configurable cap; default 50k tokens / run | audit log |
| Memory | < 256 MB working set on a 1k-test suite | manual |
| Crash safety | A crash mid-patch must leave a `.bak` recoverable file | tests |

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
