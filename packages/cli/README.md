# pw-doctor

Self-healing Playwright selectors. When a test fails because the DOM changed, pw-doctor finds a robust replacement selector and patches the test file — preview by default, never silently.

[GitHub](https://github.com/petrkindlmann/pw-doctor) · [npm](https://www.npmjs.com/package/pw-doctor)

```text
Proposed fixes (1/1):

  login.spec.ts:14
    #submit-btn → getByRole('button', { name: 'Sign in' })
    Confidence: 90% | Score: 91 | Strategy: attribute_match
    ARIA role "button" base 15 · has accessible name · getByRole resilience +4
    --- a/login.spec.ts
    +++ b/login.spec.ts
    @@ -14,1 +14,1 @@
    -  await page.locator('#submit-btn').click();
    +  await page.getByRole('button', { name: 'Sign in' }).click();

Dry run — no changes applied. Use --apply to apply fixes.
```

> Output is illustrative of the real format. Confidence is a 0–100 integer, not a 0–1 decimal.

## Install

```bash
npm install -D pw-doctor
npx pw-doctor init
```

`init` writes `.pw-doctor.config.json`, creates the `.pw-doctor/` state dir, gitignores it, and **prints** the Playwright reporter/fixture setup snippet for you to copy into `playwright.config.ts` (it does not edit your config). It can optionally install a pre-commit `gitleaks` hook.

## Quick start

```bash
# 1. Set up config + print the reporter snippet
npx pw-doctor init

# 2. Add the printed reporter to playwright.config.ts, then run your tests.
#    The reporter captures the DOM at each failure into .pw-doctor/captures/.

# 3. Preview repairs (dry-run is the default — nothing is written)
npx pw-doctor heal

# 4. Apply repairs that clear the threshold; each is re-run and rolled back if it still fails
npx pw-doctor heal --apply
```

## How it works

1. **Capture.** The Playwright reporter snapshots the DOM at the exact moment a test fails. pw-doctor never scrapes a live site — it only works from captures produced by your own failing tests.
2. **Repair.** `pw-doctor heal` re-runs the failing tests, then runs four deterministic heuristic strategies (and optionally one AI strategy) against the captured DOM. A ranker scores every candidate.
3. **Patch.** The winning selector is written to your test file via AST (recast + Babel) — formatting and comments are preserved. Only the exact failing call is changed.
4. **Verify.** With `--apply`, each patched test is re-run; a patch that doesn't fix the failure is **rolled back automatically** from a backup.

## Commands

| Command | Purpose |
|---|---|
| `pw-doctor init` | One-time setup: config, state dir, gitignore, reporter snippet, optional gitleaks hook |
| `pw-doctor check` | Score existing selectors for **fragility** (static; no test run). Does not detect "broken" — see below. |
| `pw-doctor heal` | Repair broken selectors. **Preview by default**; `--apply` to write. |
| `pw-doctor watch` | Re-run heal in **suggest-only** mode as test files change (alias for `heal --watch`) |
| `pw-doctor report` | Render run history as HTML / JSON / Markdown |
| `pw-doctor calibrate --corpus <path>` | Benchmark repair strategies against a labelled corpus |
| `pw-doctor credentials check` | Verify `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are present and well-formed |

### `heal` flags

```text
--apply               Write fixes that clear the threshold (omit for dry-run preview)
--dry-run             Force preview even if --apply is given
--min-confidence <n>  Minimum final score (0–100) to auto-apply (default 85)
--max-files <n>       Cap the number of files touched
--interactive         Approve / edit / skip each fix (requires a TTY)
--no-ai               Heuristics only, even if an AI provider is configured
--watch               Re-run on file change (suggest-only; --apply is ignored in watch)
--ci                  Non-interactive; emit a JSON summary on stdout
--preview-ai-payload  Print the exact (redacted) AI request without sending it
```

`--min-confidence` is the gate on the candidate's **final score** (confidence + method-resilience − fragility penalty), on a 0–100 scale. A fragile high-confidence CSS selector can score below a lower-confidence but robust `getByRole`, and will not auto-apply.

### `check` flags

`check` is **static fragility scoring only** — it reads your test files, scores each selector's fragility (0–100, higher = more fragile), and prints a worst-first table. It does **not** run your tests and does **not** report selectors as "broken".

```text
--ci                   Emit a JSON report on stdout
--fail-on-fragile <n>  Exit 1 if any selector's fragility score exceeds n (else exit 0)
```

## Repair strategies

All applicable strategies generate candidates; the ranker picks the best by **final score** = `confidence + method resilience − fragility penalty`, with deterministic tie-breaks (resilience → strategy priority → selector).

| # | Strategy | Signal |
|---|---|---|
| 1 | `attribute_match` | `data-testid` → `getByTestId`; explicit **or implicit** ARIA role (+ accessible name) → `getByRole`; `aria-label` → `getByLabel` |
| 2 | `text_match` | Unique visible text → `getByText` (generic labels like "OK"/"Submit" and dynamic text like numbers/dates are screened out) |
| 3 | `structural_match` | Class overlap + tag + DOM position |
| 4 | `anchor_match` | Relative path from stable landmarks (headings, `<nav>`, `[data-testid]`) |
| 5 | `ai` | Claude or GPT, **off by default**, gated by validation + DOM hard-gate (below) |

The four heuristic strategies are deterministic and free. AI is bring-your-own-key, opt-in, and skipped entirely when a heuristic already clears the threshold.

### What "robust" means here

The ranker prefers, in order: `getByTestId` → `getByRole` (with accessible name) → `getByLabel` → `getByText` (only when the text is specific) → `locator(...)` with a stable attribute. It penalizes fragile selectors: `nth-child`/`nth-of-type`, long descendant or class chains, hashed/generated classes (CSS-in-JS, CSS-modules, Tailwind arbitrary values), and layout-only utility classes. Every candidate carries a human-readable breakdown of how its score was reached.

## AI repair (optional, opt-in)

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or
export OPENAI_API_KEY=sk-...
```

AI is **disabled until you accept a one-time consent prompt** (stored at `~/.pw-doctor/ai-consent.json`). In a non-interactive/CI environment without recorded consent, AI stays off and pw-doctor falls back to heuristics. Every AI suggestion passes three gates before it can patch a file:

1. **Syntax validation** — no backticks, semicolons, `eval`/`require`/`import`/template expressions/newlines; must be a known Playwright locator method; ≤ 500 chars.
2. **DOM hard-gate** — the selector must match **exactly one visible element** in the captured DOM, and that element must be compatible with the action the test was performing (e.g. a `click` target must be interactive).
3. **Audit log** — provider, model, token counts, cost, timing, and a **SHA-256 hash** of the payload are recorded to `.pw-doctor/audit/ai-calls.jsonl`. The DOM itself is never logged.

Use `--preview-ai-payload` to see exactly what would be sent (after redaction) without making a call.

## Security

- **Preview by default.** `heal` never writes without `--apply`.
- **DOM sent to AI is redacted.** Multi-layer: `<script>`/`<style>`/comments removed; inline event-handler attributes stripped; `href`/`src`/`action` reduced to bare domains and URL query strings stripped everywhere else; non-safe `<input>` `value`s (password, hidden, text) redacted; and a pattern pass that scrubs emails, JWTs, API keys (OpenAI/Anthropic/Stripe/GitHub/AWS/Google/Slack), bearer tokens, cookies, `session`/`csrf` pairs, IPv4, SSN, credit-card and phone numbers. The default `moderate` preset scrubs these patterns; the `strict` preset additionally replaces all free text with `[TEXT]`. The `minimal` preset is **not** AI-safe and is auto-upgraded to `moderate` for AI calls.
- **No `eval`, no shell strings.** Child processes use `execFile` with array args; `testNamePattern` is regex-escaped before `--grep`.
- **Writes stay inside the project root.** Every write path is canonicalized with `realpath` (resolving symlinks) and verified to live inside the root.
- **Config is JSON / YAML only** (cosmiconfig, no JS/TS eval).
- **Secrets are env-only** — never written to disk, never logged, and stripped from child-process environments.
- Optional pre-commit `gitleaks` hook installed by `init`.

See the [SECURITY.md](https://github.com/petrkindlmann/pw-doctor/blob/main/SECURITY.md) for the full threat model and control catalogue.

## CI usage

```yaml
# Fail the build if any selector is too fragile (tune the threshold).
- run: npx pw-doctor check --fail-on-fragile 80

# After your Playwright tests run (with the reporter configured), surface
# proposed repairs as JSON without writing anything.
- run: npx pw-doctor heal --ci
```

`heal --ci` emits a JSON summary on stdout (`status`, `failures`, `fixable`, `verified`, `rolledBack`, `repairs[]`, AI token/cost totals) and never prompts. AI requires consent recorded by a prior interactive run, so CI runs are heuristics-only unless you provision that consent file.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Healthy (no broken selectors / no fragile selectors over threshold) |
| `1` | Broken selectors found (or `check --fail-on-fragile` threshold exceeded) |
| `2` | Tool error (bad config, not a Playwright project, invalid flag) |
| `3` | Fixes applied and verified |
| `4` | Fixes applied but failed verification (rolled back) |

## Troubleshooting

- **"No Playwright config or captures found"** — run from your project root, and make sure the reporter from `init` is wired into `playwright.config.ts` so failures get captured.
- **`heal` finds a failure but proposes no fix** — the heuristics recover an element only when the broken selector still shares a class/tag/id hint with the current DOM. A fully-renamed selector with no other signal is an AI-only case; configure a provider and accept the consent prompt.
- **`--min-confidence 0.7` is rejected** — the scale is 0–100, not 0–1. Use `--min-confidence 70`.
- **AI never runs in CI** — consent is one-time and interactive; run `pw-doctor heal` once locally to record it, or pass `--no-ai` to silence the notice.
- **"multiple identical selectors on this line — cannot patch automatically"** — pw-doctor refuses to guess which of two identical selectors on one line to change; split them onto separate lines.

## Roadmap

> Not yet implemented — listed so expectations are honest.

- Live broken-vs-healthy validation in `check` (today it scores fragility only).
- `getByRole` candidates that need a 2nd-argument options object beyond `{ name }`.
- A hosted corpus for `calibrate`.

## Docs

- [PRD](https://github.com/petrkindlmann/pw-doctor/blob/main/docs/PRD.md) — product framing, scope, non-goals
- [ARCHITECTURE](https://github.com/petrkindlmann/pw-doctor/blob/main/docs/ARCHITECTURE.md) — module map and heal pipeline
- [SECURITY](https://github.com/petrkindlmann/pw-doctor/blob/main/SECURITY.md) — threat model, control catalogue, disclosure policy
- [CHANGELOG](https://github.com/petrkindlmann/pw-doctor/blob/main/CHANGELOG.md) — version history
- [CONTRIBUTING](https://github.com/petrkindlmann/pw-doctor/blob/main/CONTRIBUTING.md) — setup, tests, conventions
- Issues: <https://github.com/petrkindlmann/pw-doctor/issues>

## License

MIT
