// packages/cli/src/reporter/pw-doctor-fixture.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    // After test completes, if failed, capture DOM
    if (testInfo.status === 'failed') {
      try {
        const html = await page.content();
        await testInfo.attach('pw-doctor-dom', {
          body: html,
          contentType: 'text/html',
        });
      } catch {
        // Page may be closed or crashed — skip capture
      }
    }
  },
});

export { expect } from '@playwright/test';
