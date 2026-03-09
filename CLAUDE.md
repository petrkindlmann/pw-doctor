# PW-Doctor

## What This Is
CLI tool + SaaS that detects broken Playwright selectors by running tests to failure,
captures live DOM at the exact failure point, proposes safe fixes via AST patching.

## Project Status
Pre-implementation. PRD_FINAL.md is the single source of truth.
docs/plans/2026-03-08-security-audit.md has 58 security controls.
archive/ has superseded planning docs — do not use for decisions.

## Key Architecture Decisions
- Heal loop: run actual test → catch failure → capture DOM → repair → verify (NOT scan live sites independently)
- AST patching via recast + @babel/parser (NEVER regex for selector replacement)
- Heuristics first (free, <100ms), AI fallback second (BYOK Anthropic, ~2s)
- Default --dry-run — never auto-apply without explicit --apply flag
- Config: cosmiconfig with JSON/YAML only — no TypeScript/JS eval (security C1.1)
- Credentials stored in ~/.pw-doctor/ (HOME), never in project directory

## Tech Stack
- CLI: commander, @clack/prompts, chalk, ora, cosmiconfig, zod
- AST: recast + @babel/parser (preserves formatting)
- DOM: cheerio + fuse.js (fuzzy matching)
- AI: @anthropic-ai/sdk (BYOK only)
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

## Repo Structure (Planned)
```
packages/cli/src/commands/    — CLI commands (init, check, heal, verify, report, watch, login)
packages/cli/src/core/        — selector-extractor, ast-patcher, test-runner, dom-analyzer
packages/cli/src/repair/      — repair pipeline, 4 heuristic strategies, ai-repair, candidate-ranker
packages/cli/src/verify/      — verifier, rollback
packages/cli/src/report/      — terminal, json, html reporters
packages/cli/src/config/      — cosmiconfig loader, zod schema, defaults
packages/cli/src/utils/       — dom-redactor, dom-stripper, git ops, logger
packages/web/                 — Next.js dashboard (Phase 4+)
packages/shared/              — shared types, schemas, constants
```

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
