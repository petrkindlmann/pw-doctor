// packages/cli/tests/fixtures/sample-tests/chained.spec.ts
import { test, expect } from '@playwright/test';

test('chained selectors', async ({ page }) => {
  await page.locator('.nav-menu').locator('.menu-item').first().click();
  await page.getByRole('list').getByRole('listitem').nth(2).click();
  await page.locator('.form').filter({ hasText: 'Email' }).locator('input').fill('test@test.com');
  await page.frameLocator('#embed').locator('.btn-submit').click();
});
