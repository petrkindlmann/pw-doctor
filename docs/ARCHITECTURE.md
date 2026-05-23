# Architecture

> Verified against the source at commit ee66b0a (May 2026). Grep before trusting line counts.

## 1. Shape

Turborepo monorepo, two packages:

```
packages/
├── cli/      # the pw-doctor binary, published to npm
└── shared/   # types + Zod schemas, bundled into cli via bundleDependencies
```

`cli` depends on `shared` at build time; at publish time `shared` is bundled inside the `cli` tarball (`bundleDependencies`), so users install a single self-contained package.

## 2. Runtime topology

pw-doctor is a single Node process that spawns Playwright as a subprocess and writes to test files. Two long-running modes exist (`watch`, `heal --watch`); everything else is one-shot.

```
┌──────────────────────────────────────────────────────────────────┐
│  User's terminal                                                 │
│    │                                                             │
│    ▼                                                             │
│  pw-doctor heal                                                  │
│    │                                                             │
│    ├──▶ Playwright (subprocess, execFile, env-allowlisted)       │
│    │      │                                                      │
│    │      ▼                                                      │
│    │   Test runs ─▶ pw-doctor reporter captures DOM on failure   │
│    │                       │                                     │
│    │                       ▼                                     │
│    │              .pw-doctor/captures/<runId>/<testId>.html      │
│    │                                                             │
│    ├──▶ Heal pipeline                                            │
│    │      │                                                      │
│    │      ▼                                                      │
│    │   strategies 1..4 (in-process, no I/O)                      │
│    │      │                                                      │
│    │      ├─ all below threshold? ──▶ AI provider (HTTPS)        │
│    │      │                              │                       │
│    │      │                              ▼                       │
│    │      │                       audit log (.pw-doctor/audit/)  │
│    │      ▼                                                      │
│    │   AST patch (recast)                                        │
│    │      │                                                      │
│    │      ▼                                                      │
│    │   write test file (safe-path, backup)                       │
│    │      │                                                      │
│    │      ▼                                                      │
│    └──▶ Playwright (subprocess) ─▶ verify ─▶ keep | rollback     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 3. Module map

```
packages/cli/src/
├── bin/pw-doctor.ts          commander entry. Wires every command.
│
├── commands/                 one file per CLI subcommand
│   ├── init.ts               detect Playwright, write config, register reporter, gitleaks opt-in
│   ├── check.ts              extract selectors, score fragility, no test run
│   ├── heal.ts               full heal pipeline. Most flags live here
│   ├── watch.ts              chokidar wrapper around `heal`
│   ├── report.ts             render history → HTML/JSON/Markdown
│   ├── calibrate.ts          benchmark strategies against a corpus
│   └── credentials.ts        check ANTHROPIC_API_KEY / OPENAI_API_KEY
│
├── core/                     pipeline-agnostic primitives
│   ├── selector-extractor.ts  Babel AST walker: finds page.* / locator(...) call sites
│   ├── selector-types.ts      shape definitions for ExtractedSelector
│   ├── fragility-scorer.ts    0–100 fragility score (CSS class, nth, deep nesting…)
│   ├── ast-patcher.ts         recast: in-place replacement of locator strings
│   ├── test-runner.ts         spawns Playwright via safe-exec; parses results
│   ├── dom-analyzer.ts        cheerio-based queries (1-element check, visibility)
│   └── dom-redactor.ts        multi-layer redaction (C2.1)
│
├── repair/                   strategies + pipeline orchestration
│   ├── attribute-match.ts     data-testid / role / aria-label
│   ├── text-match.ts          unique text → getByText
│   ├── structural-match.ts    class overlap + position
│   ├── anchor-match.ts        relative paths from stable landmarks
│   ├── candidate-ranker.ts    score + pick best candidate across strategies
│   ├── dom-hard-gate.ts       enforces "exactly 1 visible element" (C2.7)
│   ├── repair-pipeline.ts     glues strategies → AI → gate → AST patch
│   └── backup.ts              .bak before any write
│
├── ai/                       AI as one strategy among five
│   ├── ai-adapter.ts          provider-agnostic interface
│   ├── create-adapter.ts      factory: pick anthropic | openai by config
│   ├── anthropic-adapter.ts   Claude implementation
│   ├── openai-adapter.ts      GPT implementation
│   ├── prompt-builder.ts      builds the redacted prompt; deterministic
│   ├── ai-response-schema.ts  Zod schema (C2.2)
│   ├── selector-validator.ts  syntax check (C2.3)
│   ├── consent-gate.ts        first-run AI consent (C7.5)
│   ├── audit-logger.ts        .pw-doctor/audit/ai-calls.jsonl (C2.6)
│   └── cost-estimator.ts      per-provider price model
│
├── reporter/                 the bit users install in playwright.config
│   ├── index.ts               package entry: `import 'pw-doctor/reporter'`
│   ├── pw-doctor-reporter.ts  catches failures, snapshots DOM
│   └── pw-doctor-fixture.ts   Playwright fixture used during capture
│
├── interactive/              CLI prompts (clack)
│   └── prompt.ts              approve/edit/skip per-candidate
│
├── config/
│   ├── loader.ts              cosmiconfig (JSON/YAML only — C1.1)
│   ├── defaults.ts            default config values
│   └── schema.ts              re-exports ConfigSchema from @pw-doctor/shared
│
├── report/                   output renderers
│   ├── terminal-reporter.ts   table view via cli-table3
│   └── json-reporter.ts       structured JSON for CI
│
├── utils/
│   ├── safe-exec.ts           execFile with env allowlist (C1.2, C1.6)
│   ├── safe-path.ts           canonicalize + assert within root (C1.3, C1.5)
│   ├── error-sanitizer.ts     strip secrets from errors (C2.4, C5.1)
│   ├── logger.ts              chalk + ora wrapper
│   ├── file-finder.ts         tsconfig/playwright.config discovery
│   ├── hash.ts                content + payload hashing
│   └── gitleaks-hook.ts       installs pre-commit hook (CC4.3)
│
├── index.ts                  package main export (programmatic use)
└── tests/                    43 vitest files, 417 cases
```

```
packages/shared/src/
├── index.ts                  re-exports
├── schemas.ts                Zod schemas: Config, RunHistory, RepairRecord
├── types.ts                  derived TS types
└── constants.ts              default model IDs, exit codes, paths
```

## 4. Core data contracts

All boundary data is Zod-validated. Three matter:

- **`ConfigSchema`** (`packages/shared/src/schemas.ts`) — parses `.pw-doctorrc.{json,yaml}`. Defines `testDir`, `repair.*`, `ai.*`, `redact.*`. Loaded by `config/loader.ts`.
- **`RunHistorySchema`** — one record per `heal` run. Written to `.pw-doctor/history/<runId>.json`. Drives the `report` command.
- **`AiResponseSchema`** (`src/ai/ai-response-schema.ts`) — what we accept back from Claude / GPT. Anything that fails parsing is discarded.

## 5. Heal pipeline, step by step

`src/repair/repair-pipeline.ts` is the orchestrator. Sequence per failing selector:

1. **Locate the call site.** `selector-extractor` parses the test file with `@babel/parser`, finds the call, captures file + line + locator string.
2. **Load the DOM snapshot** the reporter wrote. Path is `.pw-doctor/captures/<runId>/<testId>.html`.
3. **Redact the DOM** (`dom-redactor`) once. The redacted DOM is used for both the heuristic strategies and the AI prompt.
4. **Run strategies 1..4** in priority order. Each returns zero or more `RepairCandidate { selector, confidence, reasoning, strategy }`.
5. **Rank** candidates (`candidate-ranker`). If the top candidate ≥ `min-confidence`, skip to step 7.
6. **AI fallback** (if `ai.enabled` and consent given):
   - `consent-gate` checks first-run state.
   - `prompt-builder` assembles the redacted DOM + failure context.
   - `cost-estimator` checks per-run token budget.
   - `anthropic-adapter` / `openai-adapter` calls the provider.
   - Response goes through `ai-response-schema` → `selector-validator` → `dom-hard-gate`.
   - `audit-logger` appends a JSONL entry with hashes and timing.
7. **Plan the patch.** `ast-patcher` builds the new AST nodes; `backup` writes `<file>.bak`.
8. **Write** via `safe-path.safeWriteFile` — canonicalized, mode `0o600`, refuses out-of-root paths.
9. **Verify.** `test-runner` re-runs only the affected test. Pass = keep; fail = rollback from `.bak`.
10. **Record.** Append a `RepairRecord` to the run history. Exit with the right code (0/1/3/4 — see [PRD.md](PRD.md)).

## 6. Reporter integration

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['pw-doctor/reporter'],
    ['html'],
  ],
});
```

`pw-doctor-reporter.ts` implements Playwright's `Reporter` interface. On any failing test it:

1. Asks the fixture for the page's HTML (`page.content()`).
2. Writes it to `.pw-doctor/captures/<runId>/<testId>.html` with `safe-path`.
3. Records a manifest entry (test id, file, line, failed locator if known) for `heal` to consume.

The reporter never blocks the test run on snapshot failures — capture is best-effort.

## 7. Configuration resolution

`cosmiconfig` searches, in order:

1. `pw-doctor` key in `package.json`
2. `.pw-doctorrc` (JSON or YAML)
3. `.pw-doctorrc.json` / `.yaml` / `.yml`
4. `pw-doctor.config.json` / `.yaml`

**Excluded by design:** `.js`, `.ts`, `.cjs`, `.mjs` configs. Static formats only (C1.1).

## 8. Security boundary map

The "untrusted" line in pw-doctor:

```
TRUSTED                     |  UNTRUSTED
─────────────────────────── | ───────────────────────────────
pw-doctor source            |  user test files (read OK,
config files (Zod-validated)|  write only via safe-path + AST)
                            |  
                            |  AI responses (schema + syntax +
                            |  DOM gate before patch)
                            |  
                            |  DOM captures (redacted before
                            |  any egress; never logged raw)
                            |  
                            |  child env (allowlisted via
                            |  safe-exec)
```

Full control catalogue: [SECURITY.md](../SECURITY.md).

## 9. Testing

Vitest. 43 files / 417 cases at the time of writing.

```
packages/cli/tests/
├── *.test.ts                 # one per source module under test
└── fixtures/                 # canned DOMs, captured failures, sample configs
```

Default workflow:

```bash
cd packages/cli
npx tsc --noEmit
npx vitest run
```

Integration tests live alongside unit tests, distinguished by filename suffix (`*.integration.test.ts`). They exercise the full pipeline against fixtures.

## 10. Build & publish

- **Build:** `tsc` in `packages/cli/`. Turborepo orchestrates across packages.
- **Bundle:** `@pw-doctor/shared` is listed in `bundleDependencies`. `npm pack` includes it inside the tarball.
- **Publish:** `npm publish --provenance` (target — not yet enforced).
- **Files shipped:** `dist/` + `README.md` only (`files` field in `package.json`).

## 11. What we deliberately don't do

- **No service workers, no browser bundle.** This is a CLI. We do not patch the page at runtime.
- **No regex selector replacement.** Always AST.
- **No background daemon.** `watch` is foreground; nothing persists between invocations except the `.pw-doctor/` state directory.
- **No SaaS client baked in.** The CLI does not phone home. A future dashboard would be opt-in and synchronous to a `report` subcommand.
- **No autonomous merge.** pw-doctor produces a diff; humans (or their CI) merge it.

## 12. Where this map will drift first

The most likely sources of drift:

1. **Strategy directory** — new strategies get added to `src/repair/`. Update the table in [PRD.md §8](PRD.md#8-repair-strategies) and the module map above.
2. **Reporter API** — Playwright reporter contract evolves (custom annotations, attachments). Keep the integration snippet in §6 fresh.
3. **AI adapter list** — local-model adapter is in TODO. When it lands, register it in `create-adapter.ts` and document the trust model (locally-running models do not leave the host but still pass the same syntax+DOM gates).
