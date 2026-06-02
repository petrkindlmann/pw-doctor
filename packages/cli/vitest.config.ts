import { defineConfig } from 'vitest/config';

const heavyFiles = [
  // Imports the real @playwright/test runtime, which registers global state that
  // can keep a worker alive — isolated into the `test:e2e` run.
  'tests/reporter/pw-doctor-fixture.test.ts',
  // Spawn the built CLI binary via execFileSync — isolated so a child-process
  // quirk on a CI runner cannot stall the core suite.
  'tests/e2e/heal-cli.test.ts',
  'tests/e2e/check.test.ts',
];

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The heavy/subprocess files run in a separate `test:e2e` pass (see scripts)
    // so a leaked handle or child-process quirk on a CI runner can never stall
    // the ~530-test core suite. RUN_E2E=1 includes them (the e2e pass sets it).
    exclude: ['tests/fixtures/**', ...(process.env.RUN_E2E ? [] : heavyFiles)],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    // Forks isolate each file in its own process that is torn down after the
    // file, so a leaked handle is reaped rather than blocking the run — the
    // worker-threads pool stalled on constrained Linux CI runners.
    pool: 'forks',
  },
});
