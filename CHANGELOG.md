# Changelog

All notable changes to pw-doctor are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use [SemVer](https://semver.org/).

## [Unreleased]

### Added
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `SECURITY.md` with full control catalogue
- `CHANGELOG.md` (this file)
- `TODO.md` with prioritized follow-ups
- `.archive/recovered/` — historical PRDs and phase plans recovered from pre-public history (not shipped)

### Changed
- `README.md` and `CLAUDE.md` rewritten for clarity and accuracy against current code
- `CONTRIBUTING.md` polished; GitHub URLs updated (`petr-kin` → `petrkindlmann`)
- `.gitignore` restructured with sections; no longer ignores `CLAUDE.md`; adds `.playwright-mcp/`, `.DS_Store`, `*.log`

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

[Unreleased]: https://github.com/petrkindlmann/pw-doctor/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/petrkindlmann/pw-doctor/releases/tag/v0.0.2
[0.0.1]: https://github.com/petrkindlmann/pw-doctor/releases/tag/v0.0.1
