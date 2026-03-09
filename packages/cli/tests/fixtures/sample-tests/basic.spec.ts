// packages/cli/tests/fixtures/sample-tests/basic.spec.ts
// This is a FIXTURE — not a real test. Used to test AST extraction.
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('/login');
  await page.locator('.username-input').fill('user@test.com');
  await page.locator('#password').fill('secret');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByTestId('dashboard-header').waitFor();
  await page.getByText('Welcome back').isVisible();
  await page.getByLabel('Search').fill('test');
  await page.getByPlaceholder('Type to search...').click();
  await page.getByAltText('User avatar').click();
  await page.getByTitle('Settings').click();
});
