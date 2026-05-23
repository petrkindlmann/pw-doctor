# Heal walkthrough

A minimal example showing what happens when a UI changes break a test, and how `pw-doctor heal` proposes a fix.

## The setup

`tests/login.spec.ts` was written when the submit button looked like this:

```html
<button class="btn-primary">Sign in</button>
```

A designer refactored the page and the button is now:

```html
<button data-testid="login-submit" aria-label="Sign in">Sign in</button>
```

The CSS class `.btn-primary` is gone. The test breaks.

```ts
// tests/login.spec.ts (before heal)
import { test, expect } from 'pw-doctor/reporter';

test('login submit', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.locator('.btn-primary').click(); // ← broken
  await expect(page).toHaveURL(/dashboard/);
});
```

## Run heal

```bash
# 1. Run the test — it fails. The pw-doctor reporter captures DOM at the failure point.
npx playwright test

# 2. See what pw-doctor would do, without writing anything (default dry-run).
npx pw-doctor heal
```

Output:

```
✗ tests/login.spec.ts:5
  page.locator('.btn-primary')
  Element not found

  ✓ page.getByTestId('login-submit')
    attribute_match · confidence 0.94

Summary: 0 verified · 0 rolled back · 1 unfixable (dry-run)
Run with --apply to write fixes.
```

## Apply

```bash
npx pw-doctor heal --apply
```

The `.locator('.btn-primary')` is rewritten to `.getByTestId('login-submit')`. Playwright re-runs the test; it passes; the fix is kept.

```ts
// tests/login.spec.ts (after heal)
import { test, expect } from 'pw-doctor/reporter';

test('login submit', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByTestId('login-submit').click(); // ← fixed by attribute_match
  await expect(page).toHaveURL(/dashboard/);
});
```

`git diff` shows only the locator string changed.

## What heal didn't do

- It didn't rewrite the `goto`, the assertion, or any unrelated tests.
- It didn't call the AI — `attribute_match` was confident enough on its own.
- It didn't keep a fix it couldn't verify; if Playwright still failed after the patch, `.pw-doctor/backups/<runId>/` would have been restored.

## When you want AI in the loop

Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` and enable AI in the config:

```jsonc
// .pw-doctor.config.json
{
  "ai": { "enabled": true }
}
```

The first time AI is enabled, pw-doctor prints a consent notice and waits for explicit `y`. After that, AI only runs when heuristics fall below `repair.autoApplyThreshold` — by default 85.
