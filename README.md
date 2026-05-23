# pw-doctor

Self-healing Playwright selectors. When a test fails because the DOM changed, pw-doctor finds the right selector and patches the test file.

[pw-doctor.dev](https://pw-doctor.dev) · [npm](https://www.npmjs.com/package/pw-doctor)

```
✗ login.spec.ts:14
  page.locator('#submit-btn')
  Element not found

  ✓ page.getByRole('button', { name: 'Sign in' })
    attribute_match · confidence 0.94

Applied 1 fix. Run tests to verify.
```

## Install

```bash
npm install -D pw-doctor
npx pw-doctor init
```

`init` wires the reporter into your Playwright config, writes `.pw-doctorrc.json`, gitignores runtime state, and (optionally) installs a pre-commit `gitleaks` hook.

## How it works

1. **Capture.** The reporter snapshots the DOM at the exact moment a test fails.
2. **Repair.** `pw-doctor heal` runs five strategies against that DOM, ranked by confidence.
3. **Patch.** The winning selector is written to your test file via AST — formatting and comments preserved.
4. **Verify.** Tests re-run; failed patches roll back automatically.

No live-site scraping. No heuristics on green tests. It only acts on real failures.

## Commands

| Command | Purpose |
|---|---|
| `pw-doctor init` | One-time setup: reporter, config, gitignore, gitleaks hook |
| `pw-doctor check` | Score existing selectors for fragility (no test run) |
| `pw-doctor heal` | Repair broken selectors (default: dry-run) |
| `pw-doctor watch` | Heal continuously as files change |
| `pw-doctor report` | Render HTML / JSON / Markdown run history |
| `pw-doctor calibrate --corpus <path>` | Benchmark strategies against a corpus |
| `pw-doctor credentials check` | Verify `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |

### Heal flags

```
--apply              Write fixes (omit for dry-run)
--interactive        Approve each fix
--no-ai              Heuristics only
--min-confidence N   Threshold 0..1 (default 0.7)
--max-files N        Cap files touched
--watch              Re-run on change
--ci                 Non-interactive, stricter
--preview-ai-payload Show the AI request without sending
```

## Repair strategies

Each strategy runs in order. First high-confidence match wins.

| # | Strategy | Signal |
|---|---|---|
| 1 | `attribute_match` | `data-testid`, ARIA role, `aria-label` |
| 2 | `text_match` | Unique visible text → `getByText` |
| 3 | `structural_match` | Class overlap + tag + DOM position |
| 4 | `anchor_match` | Relative path from stable landmarks (headings, `<nav>`, `[data-testid]`) |
| 5 | `ai` | Claude or GPT, gated by validation + DOM check |

## AI repair (optional, opt-in)

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or
export OPENAI_API_KEY=sk-...
```

Every AI suggestion passes three gates before it can patch a file:

1. **Syntax validation** — no backticks, no JS injection, must look like a Playwright locator
2. **DOM hard-gate** — selector must match exactly one visible element in the captured DOM
3. **Audit log** — tokens, cost, timing recorded to `.pw-doctor/audit/ai-calls.jsonl` (DOM content is never logged)

AI is disabled until you accept the consent gate on first run.

## Security

- `--dry-run` by default; never writes without `--apply`
- DOM sent to AI is redacted (credentials, URLs, free text stripped)
- No `eval()`, no shell strings — `execFile` with array args only
- All writes path-canonicalized inside the project root
- Config files: JSON / YAML only (no JS/TS eval)
- Secrets via env vars only (never written to disk)
- Optional pre-commit `gitleaks` hook installed by `init`

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Healthy |
| `1` | Broken selectors found |
| `2` | Tool error |
| `3` | Fixes applied and verified |
| `4` | Fixes applied but failed verification (rolled back) |

## Project

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, tests, conventions
- [TODO.md](TODO.md) — known follow-ups
- Issues: <https://github.com/petrkindlmann/pw-doctor/issues>

## License

MIT
