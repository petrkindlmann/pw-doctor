# Architecture

> Verified against the source at the tip of `main` (May 2026), after Codex second-opinion review. Grep before trusting line counts — module shape is stable, line numbers are not.

## 1. Shape

Turborepo monorepo, two packages:

```
packages/
├── cli/      # the pw-doctor binary, published to npm
└── shared/   # types + Zod schemas, bundled into cli via bundleDependencies
```

`cli` depends on `shared` at build time; at publish time `shared` is bundled inside the `cli` tarball (`bundleDependencies`), so users install a single self-contained package.

## 2. Runtime topology

pw-doctor is a single Node process that spawns Playwright as a subprocess and writes to test files. One long-running mode exists (`heal --watch`); everything else is one-shot. `watch.ts` exports a `startWatchMode` helper that `heal` uses — there is no standalone `pw-doctor watch` command.

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
│   ├── init.ts               detect Playwright, write config, **print** reporter/fixture setup
│   ├── check.ts              extract selectors, score fragility, no test run; writes run history
│   ├── heal.ts               full heal pipeline. Most flags + `--watch` live here. Does not write run history (TODO)
│   ├── watch.ts              chokidar helper (exports `startWatchMode`; not a registered command)
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

`commands/heal.ts` is the orchestrator; `repair/repair-pipeline.ts` is the per-failure worker. Sequence per failing selector:

1. **Collect failures.** `test-runner` parses Playwright JSON output and error strings (no AST cross-reference). Each failure has `{ file, line, selector, method, error }`.
2. **Load the DOM snapshot.** Reporter wrote it at `.pw-doctor/captures/<hash(file)>-<hash(testTitle)>.html`. Heal matches on the same hashes.
3. **Redact the DOM** (`dom-redactor`) once. Reused for every strategy.
4. **Generate candidates.** The four heuristic strategies (1..4) run as synchronous calls. A fallback ladder then applies: if any heuristic candidate already clears `autoApplyThreshold`, the AI strategy is skipped; otherwise, when an AI adapter + DOM + consent are present, AI runs and its candidates are validated + DOM-hard-gated before joining the pool.
5. **AI candidate generation** (when adapter + DOM are present):
   - `consent-gate` is checked at the command layer before adapter init.
   - `prompt-builder` assembles the redacted DOM + failure context.
   - `cost-estimator` accounts for per-run token budget.
   - `anthropic-adapter` / `openai-adapter` calls the provider.
   - Each returned candidate passes `ai-response-schema` (Zod fields) → `selector-validator` (string-level rejects: ≥ 500 chars, backticks, semicolons, newlines, `require(`, `import `, `eval(`, `Function(`, unknown method) → `dom-hard-gate` (exactly one visible match).
   - `audit-logger` appends a JSONL entry with hashes, timing, tokens, cost.
6. **Rank.** `candidate-ranker` computes `confidence + METHOD_RESILIENCE[method]` and bucketizes into `auto_apply` (≥ `autoApplyThreshold`) / `suggest` (≥ `suggestThreshold`) / `skip`. Returns sorted by final score.
7. **Apply (auto_apply only, with `--apply`).**
   - `assertWithinRoot(cwd, filePath)` then read current source (cached per-file across patches).
   - `backup.createBackup(cwd, filePath, runId)` copies the file to `.pw-doctor/backups/<runId>/<flattened-relative-path>` at mode `0o600`. *Not* a `.bak` sibling.
   - `ast-patcher.patchSelector` rewrites the locator via `recast`.
   - `fs.writeFileSync(filePath, patched, { mode: 0o600 })` — `safeWriteFile` is reserved for `.pw-doctor/` internal writes; heal uses `assertWithinRoot` then `writeFileSync`.
8. **Verify.** `test-runner` reruns only the affected test. Pass keeps the patch; fail calls `restoreBackup` from the `<runId>` directory.
9. **Exit.** 0/1/3/4 — see [PRD.md §11](PRD.md#11-non-functional-requirements).

**Not yet implemented:** heal does **not** append to `RunHistory`. Only `check` writes history (`commands/check.ts`), so `report` currently surfaces check-runs only. Tracked in [../TODO.md](../TODO.md).

## 6. Reporter integration

DOM capture requires **both** the reporter and the fixture. They cooperate via Playwright's attachment system.

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['default'],
    ['pw-doctor/reporter'],
  ],
});
```

```ts
// any test file that should capture on failure
import { test, expect } from 'pw-doctor/reporter';
```

Direction of data flow:

1. **Fixture** (`pw-doctor-fixture.ts`). Extends `@playwright/test`. After the page test runs, if `testInfo.status === 'failed'`, it calls `page.content()` and `testInfo.attach('pw-doctor-dom', { body, contentType: 'text/html' })`. Capture is best-effort; if the page is closed or crashed, capture is silently skipped.
2. **Reporter** (`pw-doctor-reporter.ts`). Implements Playwright's `Reporter` interface. On `onTestEnd`, if the test failed, it reads the `pw-doctor-dom` attachment, computes `hashString(test.location.file)` and `hashString(test.title)`, and writes the HTML to `.pw-doctor/captures/<fileHash>-<testHash>.html` at mode `0o600`. No manifest file is written — heal recomputes the hashes when matching.

The reporter does **not** call `page.content()` itself — by the time `onTestEnd` fires, the page may already be torn down.

`init` does not edit `playwright.config.ts`. It prints the snippet above and a manual instruction to switch test-file imports to `pw-doctor/reporter`.

## 7. Configuration resolution

`cosmiconfig` `searchPlaces`, in this exact order (`config/loader.ts`):

1. `.pw-doctor.config.json`
2. `.pw-doctor.config.yaml`
3. `.pw-doctor.config.yml`
4. `.pw-doctorrc.json`
5. `.pw-doctorrc.yaml`
6. `.pw-doctorrc.yml`
7. `package.json` (`"pw-doctor"` key)

**Excluded by design:** `.js`, `.ts`, `.cjs`, `.mjs`, and bare-name `.pw-doctorrc` (which cosmiconfig would parse as YAML). No `loaders` overrides — only static formats (C1.1).

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
