# Security

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Email: `petr.kindlmann@cncenter.cz` with subject `[pw-doctor security]`. Include:

- Affected version (run `pw-doctor --version`)
- Reproduction steps or proof of concept
- Impact assessment (what an attacker can do)
- Suggested fix, if any

Acknowledgement within 72 hours. Coordinated disclosure preferred — we'll agree on a public-disclosure date once a fix is ready.

Out of scope:

- Bugs in your own Playwright tests
- Issues that require already-compromised local machines (we are not a sandbox)
- Theoretical attacks without practical impact

## Supported versions

| Version | Supported |
|---|---|
| `0.x` (current) | ✅ Latest minor only |
| pre-`0.x` | ❌ |

## Trust model

pw-doctor **runs your Playwright tests as a subprocess and writes to your test files**. This is functionally equivalent to running `npx playwright test` plus an editor that modifies code. Treat it the same way:

- Only run on codebases you trust
- Only run with API keys you own (BYOK)
- Default `--dry-run` mode shows what would change; require explicit `--apply` to write

The threat model below covers what we defend against and what we don't.

## Threat model

**In scope:**

| Threat | Defense |
|---|---|
| Malicious AI output (prompt injection that returns dangerous selector) | C2.2 schema + C2.3 syntax validator + C2.7 DOM hard gate |
| Path traversal during patching | C1.3 path canonicalization |
| Shell injection in test runner | C1.2 `execFile` only |
| Secret leakage via DOM sent to AI | C2.1 multi-layer redaction |
| Secret leakage to child processes | C1.6 env var allowlist |
| Accidental secret commit | CC4.3 pre-commit gitleaks |
| Insecure config evaluation | C1.1 static JSON/YAML only |
| Insecure file permissions | C1.5 `0o700` / `0o600` |
| Verbose error leaks | C2.4 + C5.1 sanitization |
| Verifiability of AI usage | C2.6 audit log |
| User unaware AI is on | C7.5 first-run consent gate |

**Out of scope (the user owns these):**

- Compromise of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` once it leaves the user's env (we never store it on disk)
- Malicious test code being executed by Playwright (running tests = running code)
- Anthropic / OpenAI's own data handling (governed by the user's own provider agreement)
- Compromise of the developer machine / OS keychain
- Supply-chain attacks against `npm` dependencies (mitigated, not eliminated, by C1.4)

## Control catalogue

Control IDs reference the original [security audit](.archive/recovered/docs/plans/2026-03-08-security-audit.md). Surfaces 3–7 in that document covered an aspirational SaaS deployment; what ships today is the CLI only, so the catalogue below is the subset that applies to the CLI surface.

### Surface 1 — CLI execution environment

| ID | Control | Where enforced |
|---|---|---|
| **C1.1** | Static config only (JSON/YAML). No JS/TS config evaluation. | `src/config/loader.ts` |
| **C1.2** | No `child_process.exec`. `execFile` with array args only. | `src/utils/safe-exec.ts` |
| **C1.3** | Canonicalize every path; refuse writes outside project root. Refuse symlink escapes. | `src/utils/safe-path.ts` |
| **C1.5** | `.pw-doctor/` directory created `0o700`; files `0o600`. | `src/utils/safe-path.ts` |
| **C1.6** | Env-var allowlist when spawning Playwright. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PW_DOCTOR_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN` are stripped. | `src/utils/safe-exec.ts` (`SENSITIVE_ENV_VARS`) |
| **C1.7** | Trust-boundary statement: "pw-doctor runs your tests. Trust your own codebase." | This file, README |

### Surface 2 — AI data pipeline

| ID | Control | Where enforced |
|---|---|---|
| **C2.1** | Multi-layer redaction before any AI payload leaves the host. Regex patterns, attribute strip (`value` on `<input type=password\|hidden>`, sensitive meta tags), URL sanitization, user patterns, and `--preview-ai-payload` for inspection without sending. | `src/core/dom-redactor.ts` + `src/ai/prompt-builder.ts` |
| **C2.2** | AI responses parsed with Zod. Selector must: parse as a Playwright locator, contain no JS expressions (`${}`, backticks, semicolons, `require`, `import`), be ≤ 500 chars. | `src/ai/ai-response-schema.ts` + `src/ai/selector-validator.ts` |
| **C2.3** | Selector syntax validated before patching. | `src/ai/selector-validator.ts` |
| **C2.4** | Errors from AI SDKs are sanitized — `authorization`, `x-api-key`, request bodies stripped before logging. | `src/utils/error-sanitizer.ts` |
| **C2.5** | Per-request payload cap and per-run token budget (`ai.maxTokens`, `ai.tokenBudgetPerRun`, `ai.maxCallsPerRun` in config). | `src/ai/ai-adapter.ts` + `src/config/schema.ts` |
| **C2.6** | Every AI call appended to `.pw-doctor/audit/ai-calls.jsonl`: timestamp, selector ID, payload hash + size, response, tokens, cost. **DOM content is never logged.** | `src/ai/audit-logger.ts` |
| **C2.7** | DOM hard gate — AI selector must match **exactly one visible element** in the captured DOM before any patch is applied. Hard-fail otherwise. | `src/repair/dom-hard-gate.ts` |

### Surface 5 — CI/CD integration (subset that ships)

| ID | Control | Where enforced |
|---|---|---|
| **C5.1** | `--ci` mode suppresses verbose errors, masks `pwd_*` / `sk-*` / `Bearer *` patterns, truncates selector values in stdout. Full details only in JSON artifacts. | `src/utils/error-sanitizer.ts` + `src/report/json-reporter.ts` |

### Surface 7 — Consent & privacy (CLI portion)

| ID | Control | Where enforced |
|---|---|---|
| **C7.1** | Local data is redacted with the same rules as AI payloads. History files store redacted selector context, not raw DOM. | `src/ai/audit-logger.ts` |
| **C7.5** | AI is **off by default**. First-time enable shows a consent notice (what is sent, to whom, link to provider policy) and records consent timestamp. | `src/ai/consent-gate.ts` |

### Cross-cutting

| ID | Control | Where enforced |
|---|---|---|
| **CC1.1** | All caught errors go through `sanitizeError` before display or logging. | `src/utils/error-sanitizer.ts` |
| **CC4.1** | `eslint-plugin-security` is a devDep (lint script still stubbed — see TODO). | `packages/cli/package.json` |
| **CC4.3** | `init` installs a pre-commit `gitleaks` hook on user opt-in. | `src/utils/gitleaks-hook.ts` |

### Out of catalogue (CLI-relevant, not formally numbered yet)

- **CSS-escape** every attribute value before embedding it in a CSS selector string.
- **Regex-escape** every `testNamePattern` before passing to Playwright `--grep`.
- **AST-only patching** via `recast` + `@babel/parser` — regex selector replacement is banned because it cannot preserve template literals or string-concatenated selectors safely.
- **Backup before patch** — every file mutation writes a `.bak` recoverable via `src/repair/backup.ts`.

## Known limitations

- **Supply chain.** We pin `@anthropic-ai/sdk`, `openai`, `cheerio`, `chokidar`, and `domhandler` to exact versions; the rest float on caret. `npm audit --audit-level=high` is not yet enforced in CI (CI workflow not yet set up — see TODO).
- **No SBOM.** Will be added before 1.0.
- **No npm provenance.** Will be added at 0.1.0 publish.
- **Default model is stale.** Config currently defaults to `claude-sonnet-4-20250514`; the latest as of May 2026 is `claude-sonnet-4-6`. Override via `ai.model` in config.

## Security-relevant filesystem

Two state directories. The split is intentional — per-machine consent stays in `$HOME`; per-project data stays in the project so it can be inspected and pruned by the user.

```
$HOME/.pw-doctor/               0o700   per-user, per-machine
└── ai-consent.json             0o600   AI consent record (C7.5)

<project-root>/.pw-doctor/      0o700   per-project, gitignored
├── audit/
│   └── ai-calls.jsonl          0o600   AI call log: hashes only, never DOM
├── backups/                    0o700   Pre-patch backups for rollback
├── captures/                   0o700   DOM snapshots from failing tests
└── history/                    0o700   Run history (redacted)
```

`pw-doctor init` adds `.pw-doctor/` to your project's `.gitignore` automatically.
