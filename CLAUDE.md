# PW-Doctor

## What This Is
CLI tool that detects broken Playwright selectors by running tests to failure,
captures live DOM at the exact failure point, proposes safe fixes via AST patching.

## Project Status
Phase 3 COMPLETE. 417 tests passing, clean build, full AI repair pipeline operational.

### Commands
- `pw-doctor init` — auto-detects project, creates config, suggests reporter setup, detects AI keys, sets up gitleaks hook
- `pw-doctor check` — extracts selectors via AST, scores fragility, reports
- `pw-doctor heal` — runs tests, captures DOM, redacts, AI+heuristic repair, AST patch, verify
  - Flags: --dry-run (default), --apply, --interactive, --watch, --ci, --no-ai, --min-confidence, --max-files, --preview-ai-payload
- `pw-doctor report` — generates HTML/JSON/markdown reports from run history
- `pw-doctor calibrate --corpus <path>` — runs calibration harness against test corpus
- `pw-doctor credentials check` — verifies ANTHROPIC_API_KEY / OPENAI_API_KEY env vars

### Repair Strategies (in order)
1. `attribute_match` — data-testid, role, aria-label (highest confidence)
2. `text_match` — unique text content → getByText
3. `structural_match` — fuzzy DOM tree similarity (class overlap, tag, position)
4. `anchor_match` — relative selectors from stable anchors (headings, landmarks)
5. `ai` — Anthropic/OpenAI fallback with DOM hard gate + selector validation

### Security Controls
- AI consent gate — first-enable requires explicit opt-in [C7.5]
- AI selector syntax validation — no JS injection, no backticks/semicolons [C2.2]
- DOM hard gate — AI selectors must match exactly 1 visible element in captured DOM [C2.7]
- AI audit log — every call logged to .pw-doctor/audit/ai-calls.jsonl [C2.6]
- AI cost estimation — per-model pricing tracked in RepairRecord
- Full CLI output sanitization — REDACT_SENSITIVE_PATTERNS applied everywhere
- Pre-commit gitleaks hook setup via init [CC4.3]
- --preview-ai-payload flag — inspect AI input without sending [C2.1]

## Key Architecture Decisions
- Heal loop: run actual test → catch failure → capture DOM → repair → verify (NOT scan live sites)
- AST patching via recast + @babel/parser (NEVER regex for selector replacement)
- Heuristics first (free, <100ms), AI fallback second (BYOK Anthropic/OpenAI, ~2s)
- Default --dry-run — never auto-apply without explicit --apply flag
- Config: cosmiconfig with JSON/YAML only — no TypeScript/JS eval (security C1.1)
- Credentials: env vars only (ANTHROPIC_API_KEY, OPENAI_API_KEY) — no disk storage
- AI responses validated with Zod → selector syntax check → DOM hard gate before use

## Tech Stack
- CLI: commander, chalk, ora, cosmiconfig, zod
- AST: recast + @babel/parser (preserves formatting)
- DOM: cheerio (parsing + redaction)
- AI: @anthropic-ai/sdk + openai (BYOK, provider-agnostic adapter)
- Watch: chokidar (file watcher for --watch mode)
- Monorepo: Turborepo (packages: cli, shared)

## Security Rules (Non-Negotiable)
- NEVER use child_process.exec() — only execFile() with array args [C1.2]
- NEVER interpolate file paths into shell strings
- All file writes: canonicalize path, verify within project root [C1.3]
- AI responses: validate with Zod, check selector syntax, run against DOM before patching [C2.2, C2.3, C2.7]
- DOM sent to AI: multi-layer redaction (regex + attribute strip + URL sanitize) [C2.1]
- Strip ANTHROPIC_API_KEY from child process env vars [C1.6]
- CSS-escape all attribute values before embedding in CSS selector strings
- Regex-escape testNamePattern before passing to Playwright --grep

## Repo Structure
```
packages/cli/src/bin/         — CLI entry point (pw-doctor.ts)
packages/cli/src/commands/    — init, check, heal, credentials, watch, report, calibrate
packages/cli/src/core/        — selector-extractor, fragility-scorer, ast-patcher, test-runner, dom-analyzer, dom-redactor
packages/cli/src/repair/      — text-match, attribute-match, structural-match, anchor-match, candidate-ranker, backup, repair-pipeline, dom-hard-gate
packages/cli/src/ai/          — ai-adapter, anthropic-adapter, openai-adapter, create-adapter, prompt-builder, ai-response-schema, selector-validator, consent-gate, audit-logger, cost-estimator
packages/cli/src/reporter/    — pw-doctor-fixture, pw-doctor-reporter, index
packages/cli/src/interactive/ — prompt
packages/cli/src/config/      — loader, defaults, schema
packages/cli/src/report/      — terminal-reporter, json-reporter
packages/cli/src/utils/       — safe-exec, safe-path, error-sanitizer, logger, file-finder, hash, gitleaks-hook
packages/cli/tests/           — 43 test files, 417 tests
packages/shared/src/          — types, schemas, constants
```

## Build & Test Commands
- `npm run build` — builds all packages via Turborepo
- `cd packages/cli && npx vitest run` — runs all 417 tests
- `node packages/cli/dist/bin/pw-doctor.js --help` — run CLI

## Conventions
- TypeScript strict mode, ESM-first
- Zod for all config validation and data contracts
- Exit codes: 0=healthy, 1=broken found, 2=tool error, 3=fixes applied+verified, 4=fixes failed verification
- File permissions: .pw-doctor/ dir 0o700, files 0o600
- Calibrate errors exit with code 2 (not 0) so CI detects failures
