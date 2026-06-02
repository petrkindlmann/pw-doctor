import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/fixtures/**'],
    // Backstop so no single test (e.g. a subprocess spawn) can hang the whole
    // CI job. Subprocess e2e files set their own higher per-describe timeout;
    // any spawned child also caps its own wall time via the execFileSync
    // `timeout` option (which can interrupt a blocking sync call, unlike this).
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    // These tests spawn child processes (execFileSync) and import heavy modules
    // (@playwright/test). The worker-threads pool hung at startup/teardown on
    // constrained Linux CI runners (vitest produced no output and stalled).
    // A single forked process avoids the parallel-IPC deadlock and terminates
    // cleanly; the suite runs in ~15s so we don't need parallelism.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
  },
});
