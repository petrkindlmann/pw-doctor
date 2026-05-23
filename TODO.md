# TODO

Known follow-ups. Pulled from recent commits and post-Phase-3 state. Move items to GitHub Issues when they become real work.

## Soon

- [ ] **Publish 0.1.0 to npm.** Version is still `0.0.2`; tag a real release once docs land.
- [ ] **CI workflow.** No GitHub Actions yet — add typecheck + vitest matrix (Node 20, 22) and a release-please / changesets pipeline.
- [ ] **`npm run lint` is `echo ok`.** Wire up `eslint` (already a devDep, and `eslint-plugin-security` is installed).
- [ ] **Coverage gate.** Vitest is in; no coverage threshold enforced.
- [ ] **Confirm Phase 3 follow-ups.** The "Fix 12 bugs found by exploratory testing" commit closed a wave — diff it against any open notes to make sure nothing leaked.

## From the May 2026 Codex doc review

- [ ] **Heal writes `RunHistory`.** Currently only `check` writes; `report` therefore surfaces check-runs only. Adding heal-side persistence will let `report` show repair history.
- [ ] **AI fallback ladder.** Today AI runs in parallel with heuristics whenever an adapter + DOM exist. Short-circuit before the AI call when a heuristic already clears `autoApplyThreshold` to cut cost.
- [ ] **AI gate completeness.** Selector validator does not block `${}` template-literal escapes and does not parse the selector as a Playwright locator expression. Add both.
- [ ] **Tag/role compatibility in DOM hard gate.** Current gate only checks "exactly 1 visible". Confirm the matched element's tag/role is compatible with the original action (e.g. `click` → interactive element).
- [ ] **Reporter auto-wiring in `init`.** Today `init` only prints instructions. Consider an opt-in `--write-config` that edits `playwright.config.ts` via AST.
- [ ] **`watch` as a top-level command.** Either register `pw-doctor watch` with the same semantics as `heal --watch`, or remove it from the design.
- [ ] **Watch behavior.** `heal --watch` callback currently re-runs tests and prints failures only — it does not heal. Either route through the full pipeline or document and rename the flag.

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
- [ ] **`ai.model` default.** Config points at `claude-sonnet-4-20250514`; bump to `claude-sonnet-4-6` and consider exposing a single source-of-truth constant in `@pw-doctor/shared`.

## Tech debt

- [ ] **`@pw-doctor/shared` is bundled into `cli`** (`bundleDependencies`). Re-evaluate once a second consumer exists; until then the indirection has no upside.
- [ ] **Pinned exact versions** for `@anthropic-ai/sdk`, `openai`, `cheerio`, `chokidar`, `domhandler`. Audit whether the pins are deliberate (SDK breakage risk) or accidental.
- [ ] **`dist/` is committed to git history but git-ignored going forward** — confirm npm-publish flow rebuilds from source and doesn't ship a stale `dist`.
