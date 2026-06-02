# Changelog

All notable changes to pw-doctor are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use [SemVer](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-06-02

Production-readiness audit and the fix for a packaging defect that made every
prior published build non-functional. **If you installed `pw-doctor@0.0.2`,
upgrade — that version (and the unreleased 0.1.0) crashed on every command.**

### Fixed
- **Install blocker (critical):** the published tarball never bundled the
  internal `@pw-doctor/shared` package (a `private` workspace symlink that
  `bundleDependencies` cannot vendor), so every command crashed on install with
  `ERR_MODULE_NOT_FOUND`. `@pw-doctor/shared` is now bundled into `dist/` at
  build time via esbuild and all bare specifiers are rewritten to relative
  paths; the package is fully self-contained. A CI `package-smoke` job now
  installs the real tarball and runs `pw-doctor --help`, gating release.
- **AST patcher could corrupt a file:** a replacement selector containing the
  active quote character (e.g. `[aria-label="Save & Close"]`) was written
  without escaping, producing an invalid string literal. Quotes and backslashes
  are now escaped.
- `--min-confidence 0` is no longer silently swapped for the config default; the
  validated value is used directly.
- Report/history writes in `check` are now path-guarded like every other write.

### Added
- **Dry-run unified diff:** `heal` (without `--apply`) now prints a real
  unified diff of each proposed change, not just `old → new`.
- **Fragility in the ranker:** candidate ranking now subtracts a fragility
  penalty (and buckets `auto_apply`/`suggest`/`skip` on the resulting final
  score), so a fragile high-confidence CSS selector loses to a robust one.
  Ties break deterministically (resilience → strategy → selector).
- **Explainable scoring:** every repair candidate and fragility score now
  carries a human-readable `reasons[]` breakdown.
- **Implicit ARIA roles + accessible names:** `attribute_match` now derives the
  implicit role of native elements (`<button>`, `<a href>`, headings, …) and
  emits `getByRole('role', { name })`; the AST patcher renders the options
  object and the DOM hard-gate matches implicit roles + name.
- **Broader redaction:** added patterns for GitHub/AWS/Google/Slack keys, bearer
  tokens, cookies, `session`/`csrf` pairs, IPv4, SSN, credit-card and phone
  numbers; URL query strings stripped everywhere (not just `href`/`src`); all
  non-safe `<input>` values redacted (not just passwords); inline event-handler
  attributes stripped by default; the `minimal` preset is auto-upgraded to
  `moderate` for AI calls.
- **Column-aware, multi-line AST patching:** patches the exact failing call by
  line+column, handles multi-line locator chains, leaves template-literal
  selectors untouched, and refuses (rather than guessing) when two identical
  selectors share a line.
- `check --fail-on-fragile <n>` (replaces the inert `--fail-on-broken`): exit 1
  if any selector's fragility exceeds the threshold.
- `text_match` screens out generic labels ("OK"/"Submit"/…) and dynamic text
  (numbers/dates/currency); `isVisible` now respects inline `display:none` /
  `visibility:hidden`.
- `engines.node >= 20`, a shipped `LICENSE`, expanded keywords, and source maps
  stripped from publish builds. `noUnusedLocals`/`noUnusedParameters` enabled.
- 100+ new tests: a broken-selector regression corpus, CLI-level `heal` e2e,
  AST edge cases, redaction-category coverage, fragility-penalty deltas, ranker
  boundaries/tie-breaks, and through-the-pipeline malicious-AI rejection.

### Changed
- **`--min-confidence` is a 0–100 scale, default 85** (the README previously
  documented a 0–1 scale, default 0.7 — that value silently malfunctioned).
  Non-integer values are now rejected with an actionable error.
- `redact.patterns` config is now an array of RegExp **source strings**
  (`z.array(z.string())`); the previous `z.instanceof(RegExp)` schema could
  never be satisfied from JSON/YAML. **(breaking for anyone who set it.)**
- The default `redact.stripAttributes` is now the full inline event-handler set
  and a user-supplied list is **merged** with it rather than replacing it.
- `--dry-run` is now an explicit override that forces preview even with
  `--apply` (it previously defaulted to `true` and was inert).
- `assertWithinRoot` canonicalizes paths with `realpath` (resolving symlinks)
  before the containment check, closing a symlink-escape on writes.
- Exit codes use the named `EXIT_CODES` everywhere; `credentials check` with no
  key now exits `2` (tool error) instead of `1`.
- `report` honors `config.report.format`/`outputDir` as defaults; CI output is
  routed through the leak-safe logger.
- README rewritten for accuracy: real example output, sequential-not-parallel
  strategy wording, honest redaction/`check` claims, GitHub as the canonical
  URL (dropped `pw-doctor.dev`), and added Quick start / CI / Troubleshooting /
  clearly-marked Roadmap sections.

## [0.1.0] — 2026-05-23

First public release after the Codex doc audit and the ship-it sweep.

### Added
- `pw-doctor watch` as a top-level command (alias for `heal --watch`); watch callback now runs the full repair pipeline in suggest mode instead of just printing failures
- `heal` persists run history to `.pw-doctor/history/runs/` so `pw-doctor report` surfaces heal-runs
- AI fallback ladder — when any heuristic candidate already clears `repair.autoApplyThreshold`, the AI call is skipped (cuts cost and latency)
- DOM hard gate now checks tag/role compatibility against the test's action (`click`/`fill`/`check`/`select`/`hover`/`press`) when the action can be inferred from the failure message
- Selector validator blocks `${}` template-literal escapes in AI-returned selectors
- `SelectorFailure.action` inferred from Playwright error messages; passed through the pipeline to the DOM gate
- Real `npm run lint` powered by `typescript-eslint` + `eslint-plugin-security`; security non-negotiables encoded as ESLint rules
- GitHub Actions CI (Node 20 + 22 matrix: build + typecheck + lint + test)
- GitHub Actions Release workflow that publishes to npm with provenance on `v*` tags
- `publishConfig.provenance: true` in `packages/cli/package.json`
- `examples/heal-walkthrough/` — runnable end-to-end demonstration
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `SECURITY.md` with full control catalogue
- `CHANGELOG.md` (this file)
- `TODO.md` with prioritized follow-ups
- `.archive/recovered/` — historical PRDs and phase plans recovered from pre-public history (not shipped)

### Changed
- Default AI model bumped from `claude-sonnet-4-20250514` to `claude-sonnet-4-6`; new model line (`opus-4-7`, `sonnet-4-6`, `haiku-4-5`) priced in cost-estimator
- `DEFAULT_AI_MODEL` is now a single source of truth in `@pw-doctor/shared`; `defaults.ts`, schema, and Anthropic adapter all derive from it

### Changed
- Docs corrected after a Codex second-opinion review caught 12 discrepancies between intended-state language and actual code. Notable corrections:
  - Strategy model is "all generate, ranker picks", not "first high-confidence wins"
  - AI runs in parallel with heuristics today (fallback-ladder is a TODO)
  - `init` prints reporter setup instructions; does not edit `playwright.config`
  - Captures live at `.pw-doctor/captures/<fileHash>-<testHash>.html` (no manifest file)
  - Backups live at `.pw-doctor/backups/<runId>/<flattened-path>` (no `.bak` sibling files)
  - `heal` does not persist `RunHistory` today — only `check` does
  - `pw-doctor watch` is not a registered command; only `heal --watch` works
  - Config search list: `.pw-doctor.config.{json,yaml,yml}` → `.pw-doctorrc.{json,yaml,yml}` → `package.json`
- `README.md` and `CLAUDE.md` rewritten for clarity and accuracy against current code
- `CONTRIBUTING.md` polished; GitHub URLs updated (`petr-kin` → `petrkindlmann`)
- `.gitignore` restructured with sections; no longer ignores `CLAUDE.md`; adds `.playwright-mcp/`, `.DS_Store`, `*.log`, `.archive/`

### Removed
- 30+ unrelated PNG screenshots from repo root

## [0.0.2] — 2026-03-10

First public release. Phase 3 complete.

### Added
- CLI: `init`, `check`, `heal`, `watch`, `report`, `calibrate`, `credentials`
- Repair strategies: `attribute_match`, `text_match`, `structural_match`, `anchor_match`, `ai`
- Anthropic + OpenAI adapters (BYOK)
- Playwright reporter capturing DOM at failure points
- AST-only patching via `recast` + `@babel/parser`
- Configuration via `cosmiconfig` (JSON / YAML only — C1.1)
- Run history with `RunHistorySchema` validation
- HTML, JSON, and Markdown report renderers
- Calibration harness (`pw-doctor calibrate --corpus`)
- Pre-commit `gitleaks` hook setup via `init` (CC4.3)
- AI safety gates:
  - Consent gate, off by default, first-run prompt (C7.5)
  - Zod response schema + selector syntax validator (C2.2, C2.3)
  - DOM hard gate — exactly one matching visible element (C2.7)
  - Audit log of every AI call without DOM content (C2.6)
  - Multi-layer redaction of any DOM sent to AI (C2.1)
  - `--preview-ai-payload` flag for inspecting prompts without sending
  - Cost estimator with per-run token budget (C2.5)
- CLI security:
  - `execFile`-only subprocess execution (C1.2)
  - Env-var allowlist when spawning Playwright (C1.6) — strips `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PW_DOCTOR_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`
  - Path canonicalization on every write (C1.3)
  - `.pw-doctor/` directory `0o700`, files `0o600` (C1.5)
  - Error sanitization globally (CC1.1, C2.4)
  - CI-mode output sanitization (C5.1)

### Fixed
- 12 bugs surfaced by exploratory testing (commit `1bce0fd`)
- 9 issues from internal security and code-quality audit (`adad593`)
- Phase 3 review fallout: token budget enforcement, Zod validation gaps, CI output, redaction config (`7f5ae6b`)

### Security
- Phase 1 critical controls landed: C1.1, C1.2, C1.3, C2.2, C2.3, C2.7
- Phase 1 high-priority controls landed: C1.5, C1.6, C2.1, C2.4, C2.5, C2.6, CC1.1, CC4.1

## [0.0.1] — 2026-03-09

Internal pre-release. Not published to npm.

- CLI scaffolding, monorepo setup (Turborepo)
- `init`, `check` commands
- Heuristic repair strategies (attribute, text)
- Selector extractor (Babel AST walker)
- Fragility scorer

[Unreleased]: https://github.com/petrkindlmann/pw-doctor/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/petrkindlmann/pw-doctor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/petrkindlmann/pw-doctor/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/petrkindlmann/pw-doctor/releases/tag/v0.0.2
[0.0.1]: https://github.com/petrkindlmann/pw-doctor/releases/tag/v0.0.1
