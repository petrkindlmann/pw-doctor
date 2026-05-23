// Example test that will break when the UI is refactored.
// Run with: npx playwright test
// Then: npx pw-doctor heal

import { test, expect } from 'pw-doctor/reporter';

test('login submit', async ({ page }) => {
  await page.goto('https://example.com/login');
  // The submit button used to be .btn-primary. After the redesign,
  // it has data-testid="login-submit" and the .btn-primary class is gone.
  await page.locator('.btn-primary').click();
  await expect(page).toHaveURL(/dashboard/);
});
