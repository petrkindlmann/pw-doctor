// Run vitest and force a clean process exit once results are in.
//
// Why: on constrained Linux CI runners every test passes but the vitest process
// occasionally does not exit — a child process spawned by the safe-exec /
// test-runner suites (real `execFile`) leaves a referenced stdio handle that
// keeps the event loop alive. That stalled the release job for the full step
// timeout. Running vitest via its API lets us read the real pass/fail result
// and then `process.exit()` with the correct code, so a lingering handle can
// never hang the run while a genuine failure is still surfaced honestly.
import { startVitest } from 'vitest/node';

const cliFilters = process.argv.slice(2);

const vitest = await startVitest('test', cliFilters, {
  watch: false,
  run: true,
});

// startVitest returns undefined if it couldn't start; treat that as failure.
const ok = vitest ? (await vitest.close(), vitest.state.getCountOfFailedTests() === 0) : false;

// Vitest also exposes process exit code; prefer an explicit check so we never
// publish on a silent failure.
const failed = vitest ? vitest.state.getCountOfFailedTests() : 1;
if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
}

process.exit(ok ? 0 : 1);
