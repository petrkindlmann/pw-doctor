// packages/cli/tests/fixtures/sample-tests/dynamic.spec.ts
import { test, expect } from '@playwright/test';

test('dynamic selectors', async ({ page }) => {
  const itemId = 'abc123';
  await page.locator(`[data-id="${itemId}"]`).click();
  await page.locator('.static-selector').click();
});
