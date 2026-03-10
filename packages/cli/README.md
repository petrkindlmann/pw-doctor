# pw-doctor

CLI tool that automatically repairs broken Playwright test selectors.

Runs your tests, captures the DOM when they fail, finds the right replacement selector, and patches your test files.

**[pw-doctor.dev](https://pw-doctor.dev)** &middot; **[npm](https://www.npmjs.com/package/pw-doctor)**

## Install

```bash
npm install -D pw-doctor
```

## Quick start

**1. Add the reporter to your Playwright config:**

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [
    ['pw-doctor/reporter'],
    ['html'],
  ],
});
```

**2. Run your tests (failures get captured automatically):**

```bash
npx playwright test
```

**3. Heal broken selectors:**

```bash
npx pw-doctor heal
```

```
  ✗ login.spec.ts:14
    page.locator('#submit-btn')
    Element not found

    ✓ page.getByRole('button', { name: 'Sign in' })
      attribute_match · confidence 0.94

Applied 1 fix. Run tests to verify.
```

## How it works

1. **Capture** — The reporter saves a DOM snapshot whenever a test fails
2. **Analyze** — `pw-doctor heal` runs five repair strategies against the captured DOM
3. **Patch** — The best selector is applied to your test file via AST (preserves formatting)
4. **Verify** — Run your tests again to confirm the fix works

## Repair strategies

Each strategy runs in order. The first high-confidence match wins.

| Strategy | What it does |
|---|---|
| `attribute_match` | Finds selectors from `data-testid`, `aria-label`, ARIA roles |
| `text_match` | Matches elements by visible text content |
| `structural_match` | Fuzzy matching via class name overlap and DOM position |
| `anchor_match` | Relative selectors from stable landmarks (headings, `<nav>`, `[data-testid]`) |
| `ai` | Sends redacted DOM to Claude or GPT when heuristics aren't enough |

AI repair is opt-in (requires explicit consent), validates every suggestion against the DOM, and logs all calls for audit.

## Commands

| Command | Description |
|---|---|
| `pw-doctor init` | Set up reporter, config, gitignore, gitleaks hook |
| `pw-doctor heal` | Repair broken selectors (default: `--dry-run`) |
| `pw-doctor check` | Scan selectors and score fragility |
| `pw-doctor watch` | Auto-repair on file change |
| `pw-doctor report` | Generate HTML/JSON/Markdown repair history |
| `pw-doctor calibrate` | Benchmark strategies against a test corpus |
| `pw-doctor credentials check` | Verify AI API keys |

## Heal flags

```
--apply              Apply fixes (default is dry-run)
--interactive        Approve each fix individually
--no-ai              Skip AI repair strategy
--min-confidence N   Minimum confidence threshold (0-1)
--max-files N        Limit files to process
--watch              Re-run on file changes
--ci                 CI mode (non-interactive, stricter)
--preview-ai-payload Show what would be sent to AI without calling it
```

## AI providers

pw-doctor supports Anthropic (Claude) and OpenAI (GPT) as AI repair backends. Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

AI is never called without your explicit consent. Every AI suggestion passes:
1. Selector syntax validation (no injection)
2. DOM hard-gate (must match exactly 1 visible element)
3. Audit logging (tokens, cost, timing — never DOM content)

## Security

- Default `--dry-run` — never auto-applies without `--apply`
- DOM sent to AI is redacted (credentials stripped, URLs sanitized)
- No `eval()`, no shell interpolation, no disk-stored secrets
- All file writes verified within project root
- Pre-commit gitleaks hook setup via `init`

## License

MIT
