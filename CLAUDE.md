# PW-Doctor

## What This Is
CLI tool + SaaS that detects broken Playwright selectors by running tests to failure,
captures live DOM at the exact failure point, proposes safe fixes via AST patching.

## Project Status
Phase 3 COMPLETE. 234 tests passing, clean build, full AI repair pipeline operational.
- `pw-doctor init` — auto-detects project, creates config, suggests reporter setup, detects AI keys
- `pw-doctor check` — extracts selectors via AST, scores fragility, reports
- `pw-doctor heal` — runs tests, captures DOM, redacts, AI+heuristic repair, AST patch, verify
  - Flags: --dry-run (default), --apply, --interactive, --watch, --ci, --no-ai, --min-confidence, --max-files
- `pw-doctor credentials check` — verifies ANTHROPIC_API_KEY / OPENAI_API_KEY env vars
- AI providers: Anthropic (claude-sonnet-4-20250514) + OpenAI (gpt-4o) via adapter interface
- DOM capture: Playwright fixture + reporter writes .pw-doctor/captures/ on test failure
- DOM redaction: moderate/strict/minimal presets, scrubs emails/JWTs/API keys/UUIDs
- Token budget enforcement: maxCallsPerRun (20), tokenBudgetPerRun (50000)
- Plans: docs/plans/2026-03-09-phase3-*.md

## Key Architecture Decisions
- Heal loop: run actual test → catch failure → capture DOM → repair → verify (NOT scan live sites independently)
- AST patching via recast + @babel/parser (NEVER regex for selector replacement)
- Heuristics first (free, <100ms), AI fallback second (BYOK Anthropic/OpenAI, ~2s)
- Default --dry-run — never auto-apply without explicit --apply flag
- Config: cosmiconfig with JSON/YAML only — no TypeScript/JS eval (security C1.1)
- Credentials: env vars only (ANTHROPIC_API_KEY, OPENAI_API_KEY) — no disk storage
- AI responses validated with Zod (ai-response-schema.ts) before use

## Tech Stack
- CLI: commander, @clack/prompts, chalk, ora, cosmiconfig, zod
- AST: recast + @babel/parser (preserves formatting)
- DOM: cheerio (parsing + redaction)
- AI: @anthropic-ai/sdk + openai (BYOK, provider-agnostic adapter)
- Watch: chokidar (file watcher for --watch mode)
- Web (V2): Next.js 15, Tailwind 4, Radix UI, Supabase, Stripe
- Deploy: Cloudflare Workers via OpenNext (see global CLAUDE.md for deploy commands)
- Monorepo: Turborepo (packages: cli, web, shared)

## Security Rules (Non-Negotiable)
- NEVER use child_process.exec() — only execFile() with array args [C1.2]
- NEVER interpolate file paths into shell strings
- All file writes: canonicalize path, verify within project root [C1.3]
- AI responses: validate with Zod, check selector syntax, run against DOM before patching [C2.2, C2.3, C2.7]
- DOM sent to AI: multi-layer redaction (regex + attribute strip + URL sanitize) [C2.1]
- Strip ANTHROPIC_API_KEY from child process env vars [C1.6]
- ESLint: ban exec(), eval(), dangerouslySetInnerHTML, new Function() [CC4.1]

## Repo Structure
```
packages/cli/src/bin/         — CLI entry point (pw-doctor.ts)
packages/cli/src/commands/    — init.ts, check.ts, heal.ts, credentials.ts, watch.ts
packages/cli/src/core/        — selector-extractor.ts, fragility-scorer.ts, ast-patcher.ts, test-runner.ts, dom-analyzer.ts, dom-redactor.ts
packages/cli/src/repair/      — text-match.ts, attribute-match.ts, candidate-ranker.ts, backup.ts, repair-pipeline.ts
packages/cli/src/ai/          — ai-adapter.ts, anthropic-adapter.ts, openai-adapter.ts, create-adapter.ts, prompt-builder.ts, ai-response-schema.ts
packages/cli/src/reporter/    — pw-doctor-fixture.ts, pw-doctor-reporter.ts, index.ts
packages/cli/src/interactive/ — prompt.ts
packages/cli/src/config/      — loader.ts, defaults.ts, schema.ts
packages/cli/src/report/      — terminal-reporter.ts, json-reporter.ts
packages/cli/src/utils/       — safe-exec.ts, safe-path.ts, error-sanitizer.ts, logger.ts, file-finder.ts, hash.ts
packages/cli/tests/           — unit tests (utils/, config/, core/, repair/, report/) + e2e/
packages/shared/src/          — types.ts, schemas.ts, constants.ts
```

## Build & Test Commands
- `npm run build` — builds all packages via Turborepo
- `cd packages/cli && npx vitest run` — runs all 234 tests
- `node packages/cli/dist/bin/pw-doctor.js --help` — run CLI

## Conventions
- TypeScript strict mode, ESM-first
- Zod for all config validation and data contracts
- Schema versioning on all JSON artifacts (schemaVersion field)
- Exit codes: 0=healthy, 1=broken found, 2=tool error, 3=fixes applied+verified, 4=fixes failed verification
- File permissions: .pw-doctor/ dir 0o700, files 0o600
- All JSON history files validated with Zod on read

## Implementation Phases
- Phase 1 (Weeks 1-4): CLI + AST extraction + check command + security baseline
- Phase 2 (Weeks 5-8): Heuristic repair + verification + rollback
- Phase 3 (Weeks 9-12): AI fallback + CI mode + npm publish
- Phase 4 (Weeks 13-16): SaaS dashboard + auth + API
- Phase 5 (Weeks 17-20): Billing + GitHub App + CI integration
- Phase 6 (Weeks 21-24): Growth + compliance + enterprise readiness

## Quality Gates (Must Pass Before V2)
- Detection precision ≥ 0.90
- Fix acceptance ≥ 0.60
- False-fix rate ≤ 0.03
- check on 500 selectors ≤ 6 min
- Gross margin positive
