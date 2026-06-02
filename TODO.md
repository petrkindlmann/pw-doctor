# TODO

Known follow-ups. Pulled from recent commits and post-Phase-3 state. Move items to GitHub Issues when they become real work.

## Soon

- [ ] **Publish 0.2.0 to npm.** Tag `v0.2.0` to trigger the release workflow (publishes with provenance, gated by the install-and-run smoke test). Supersedes the broken `0.0.2`.
- [x] ~~**CI workflow.**~~ Node 20/22 matrix build+typecheck+lint+test; release workflow on `v*` tags; `package-smoke` now installs the real tarball and runs `--help`.
- [x] ~~**`npm run lint`.**~~ Real `eslint` + `eslint-plugin-security`, `--max-warnings 0`.
- [ ] **Coverage gate.** Vitest is in (542 tests); no coverage threshold enforced yet.
- [ ] **Live broken-detection in `check`.** Today `check` is static fragility scoring only (`--fail-on-fragile`). Real broken-vs-healthy detection would need a test run / reporter hook.

## From the May 2026 Codex doc review

- [x] ~~**Heal writes `RunHistory`.**~~ `heal` persists run history; `report` surfaces heal-runs.
- [x] ~~**AI fallback ladder.**~~ AI is skipped when a heuristic already clears `autoApplyThreshold`.
- [x] ~~**AI gate completeness.**~~ Validator blocks backticks/`;`/`${}`/`eval`/`require`/`import`/newlines and unknown methods.
- [x] ~~**Tag/role compatibility in DOM hard gate.**~~ Gate checks action compatibility (click→interactive, fill→form field, etc.).
- [ ] **Reporter auto-wiring in `init`.** Today `init` only prints instructions. Consider an opt-in `--write-config` that edits `playwright.config.ts` via AST.
- [x] ~~**`watch` as a top-level command.**~~ Registered; shares options with `heal` via `addHealOptions`.
- [x] ~~**Watch behavior.**~~ Watch callback runs the full repair pipeline in suggest mode.

## Repair quality

- [ ] **Calibration corpus.** `calibrate` exists but ships without a public corpus. Build a small reference corpus (e.g. 50 real-world breakages) and check it in.
- [ ] **Strategy weights.** `min-confidence` is global. Consider per-strategy thresholds informed by calibration.
- [ ] **`structural_match` tuning.** Class-overlap heuristic is brittle on CSS-in-JS apps with hashed classnames — gather failing cases before rewriting.
- [ ] **`anchor_match` reach.** Currently anchors on headings + landmarks + `[data-testid]`. Evaluate adding `form[name]`, `[role="region"][aria-label]`.

## AI

- [ ] **Local-model adapter.** `create-adapter` is provider-keyed. Add an Ollama/`localhost:11434` adapter for offline / on-prem use.
- [ ] **Token-budget telemetry.** Cost estimator records per-call; add per-run rollup + a `--max-cost` ceiling.
- [ ] **Prompt versioning.** `prompt-builder` has no version tag in the audit log. Add a hash so old audit entries are interpretable.
- [ ] **Few-shot examples from the user's own repo.** Right now the prompt is static. Mining anonymized prior successful repairs could boost accuracy.

## DX

- [ ] **`init` for non-monorepo projects with custom `tsconfig` paths** — verify reporter import resolves cleanly.
- [ ] **`heal --interactive`** prompts could group similar fixes (same selector class across N files) into a single approval.
- [ ] **Report command:** HTML output is functional but plain. Add a small style sheet + sortable table.
- [ ] **Watch mode debounce window** is a magic number — surface as config.

## Docs / repo

- [ ] **Examples directory.** Show a realistic Playwright project before/after a heal.
- [x] ~~**CHANGELOG.md.**~~ Seeded — automate via conventional commits when CI lands.
- [x] ~~**SECURITY.md.**~~ Disclosure policy + full control catalogue shipped.
- [ ] **`packages/cli/README.md`** is the npm-facing readme — keep it in sync with root README on each release.
- [x] ~~**`ai.model` default.**~~ `DEFAULT_AI_MODEL` (`claude-sonnet-4-6`) is the single source of truth in `@pw-doctor/shared`.
- [ ] **`redact.patterns` migration.** As of 0.2.0 this config is `string[]` (RegExp source strings), not `RegExp[]`. The old shape was unsatisfiable from JSON; no published config used it, but note it in upgrade guidance.

## Tech debt

- [x] ~~**`@pw-doctor/shared` packaging.**~~ Bundled into `dist/` at build time via esbuild (specifiers rewritten to relative paths); removed from `dependencies`/`bundleDependencies`. The old `bundleDependencies` approach shipped a broken tarball.
- [ ] **Pinned exact versions** for `@anthropic-ai/sdk`, `openai`, `cheerio`, `chokidar`, `domhandler`. Audit whether the pins are deliberate (SDK breakage risk) or accidental.
- [ ] **`dist/` is committed to git history but git-ignored going forward** — confirm npm-publish flow rebuilds from source and doesn't ship a stale `dist`.
