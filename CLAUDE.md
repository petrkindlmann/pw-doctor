# CLAUDE.md — pw-doctor

CLI that repairs broken Playwright selectors. Runs the user's failing tests, captures live DOM at the failure point, picks a replacement selector (heuristic → AI), and AST-patches the test file. Default `--dry-run`.

Status: `0.2.0` prepared for release (supersedes the broken `0.0.2` on npm). 54 test files, 542 tests, clean build/typecheck/lint. `@pw-doctor/shared` is esbuild-bundled into the CLI `dist/` at build time (no longer a runtime dep).

## Non-negotiable rules

These exist because of audits and incidents — do not soften them.

1. **No `child_process.exec`.** Use `execFile` with array args only. [C1.2]
2. **No path interpolation into shell strings.** Canonicalize every path; verify it lives inside the project root before any write. [C1.3]
3. **No regex selector replacement.** Use `recast` + `@babel/parser` so formatting and comments survive.
4. **No JS/TS config eval.** `cosmiconfig` is JSON/YAML only. [C1.1]
5. **Secrets are env-only.** Never write `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` to disk, never log them, strip them from child-process env. [C1.6]
6. **AI output is hostile until proven safe.** Every AI selector passes: Zod schema → syntax validator (no backticks, no `;`, no injection) → DOM hard-gate (matches exactly 1 visible element) → then it can patch. [C2.2, C2.3, C2.7]
7. **DOM sent to AI is redacted.** Multi-layer: regex patterns + attribute strip + URL sanitize. Use the existing `dom-redactor`. [C2.1]
8. **CSS-escape attribute values** before embedding in selector strings. **Regex-escape `testNamePattern`** before passing to Playwright `--grep`.
9. **`--dry-run` is the default.** Never auto-apply. `--apply` must be explicit.

## Architecture, at a glance

Heal loop: `run test → catch failure → capture DOM → repair → verify`. Tests drive the process — pw-doctor does not scrape live sites.

Strategies (all applicable strategies run in parallel; ranker picks best):

1. `attribute_match` — `data-testid`, role, `aria-label`
2. `text_match` — unique visible text → `getByText`
3. `structural_match` — fuzzy DOM tree similarity (class overlap, tag, position)
4. `anchor_match` — relative paths from stable anchors (headings, landmarks)
5. `ai` — Anthropic/OpenAI when adapter + DOM + consent, gated as in rule 6

`candidate-ranker` sorts by `confidence + METHOD_RESILIENCE[method]` and bucketizes into `auto_apply | suggest | skip` against `autoApplyThreshold` / `suggestThreshold`. Heuristics are free and < 100 ms. AI is BYOK, ~2 s, opt-in via consent gate on first enable. A fallback-ladder (skip AI when heuristic already wins) is a TODO.

## Repo layout

Turborepo monorepo. Only two packages.

```
packages/cli/src/
  bin/          pw-doctor.ts                          CLI entry
  commands/     init check heal watch report calibrate credentials
  core/         selector-extractor fragility-scorer ast-patcher
                test-runner dom-analyzer dom-redactor selector-types
  repair/       attribute-match text-match structural-match anchor-match
                candidate-ranker repair-pipeline dom-hard-gate backup
  ai/           ai-adapter create-adapter anthropic-adapter openai-adapter
                prompt-builder ai-response-schema selector-validator
                consent-gate audit-logger cost-estimator
  reporter/     pw-doctor-reporter pw-doctor-fixture
  config/       loader defaults schema
  report/       terminal-reporter json-reporter
  interactive/  prompt
  utils/        safe-exec safe-path error-sanitizer logger
                file-finder hash gitleaks-hook
  tests/        43 files, 417 tests
packages/shared/src/  types schemas constants
```

## Tech stack

- **CLI:** commander, chalk, ora, cosmiconfig, zod, @clack/prompts, cli-table3
- **AST:** recast + @babel/parser + @babel/traverse (formatting-preserving)
- **DOM:** cheerio
- **AI:** `@anthropic-ai/sdk` + `openai` behind a provider-agnostic adapter
- **Watch:** chokidar
- **Tests:** vitest
- **Build:** tsc; orchestrated by Turborepo

## Build & test

```bash
npm run build                                  # all packages
cd packages/cli && npx vitest run              # 417 tests
node packages/cli/dist/bin/pw-doctor.js --help
```

Default verification after a change in `packages/cli/`:

```bash
cd packages/cli && npx tsc --noEmit && npx vitest run
```

## Conventions

- TypeScript strict, ESM-first
- Zod for every config and external data contract
- File permissions: `.pw-doctor/` dir `0o700`, files `0o600`
- Exit codes: `0` healthy · `1` broken found · `2` tool error · `3` fixes applied+verified · `4` verification failed
- `calibrate` errors exit `2` (not `0`) so CI catches them

## What lives where (when fixing something)

| You're working on… | Start here |
|---|---|
| New repair strategy | `src/repair/`, then register in `repair-pipeline.ts` |
| AI prompt / parsing | `src/ai/prompt-builder.ts`, `ai-response-schema.ts` |
| File rewriting | `src/core/ast-patcher.ts` (never regex) |
| Capturing failures | `src/reporter/pw-doctor-reporter.ts` |
| Running tests | `src/core/test-runner.ts` (must use `safe-exec`) |
| Redaction | `src/core/dom-redactor.ts` + `src/utils/error-sanitizer.ts` |
| New CLI flag | `src/commands/<cmd>.ts` + `bin/pw-doctor.ts` |

## Related docs

| Topic | File |
|---|---|
| Product framing, scope, non-goals | [docs/PRD.md](docs/PRD.md) |
| Module map + heal pipeline | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Threat model + full control catalogue (C1, C2, C5, C7, CC) | [SECURITY.md](SECURITY.md) |
| Version history | [CHANGELOG.md](CHANGELOG.md) |
| Contributor setup | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Known follow-ups | [TODO.md](TODO.md) |

The original (pre-public) PRD and phase plans were recovered to `.archive/recovered/` (gitignored). Useful for historical context; **the canonical docs are now `docs/` + `SECURITY.md`**.
