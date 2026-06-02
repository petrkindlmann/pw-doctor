// Run vitest and force a clean process exit once results are in.
//
// Why: on constrained Linux CI runners every test passes but the vitest process
// does not exit — a child process spawned by the safe-exec / test-runner suites
// (real `execFile`) leaves a referenced stdio handle that keeps the event loop
// alive. `vitest.close()` waits for that teardown and never returns, so even an
// API runner that awaited close() hung. Here we read the real failed-test count
// as soon as the run finishes and hard-exit, never awaiting teardown. A
// watchdog guarantees exit even if `startVitest` itself never resolves.
import { startVitest } from 'vitest/node';

const cliFilters = process.argv.slice(2);

// Hard watchdog: if anything below wedges, exit non-zero rather than hang the
// CI step to its timeout. Generous so a slow-but-real run still completes.
const watchdog = setTimeout(() => {
  console.error('\nrun-tests watchdog: forcing exit (vitest did not settle).');
  process.exit(1);
}, 5 * 60 * 1000);
watchdog.unref();

let failed = 1;
try {
  const vitest = await startVitest('test', cliFilters, { watch: false, run: true });
  if (vitest) {
    failed = vitest.state.getCountOfFailedTests();
    // Do NOT await close() — on CI it blocks on a lingering child-process
    // handle. Fire-and-forget; we already have the authoritative result.
    void Promise.resolve(vitest.close()).catch(() => {});
  }
} catch (err) {
  console.error('run-tests: vitest failed to start:', err);
  failed = 1;
}

if (failed > 0) console.error(`\n${failed} test(s) failed.`);
// Hard exit with the real code; bypasses any lingering open handle.
process.exit(failed > 0 ? 1 : 0);
