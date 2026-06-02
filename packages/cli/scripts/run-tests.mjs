// Run vitest and force a clean process exit the moment all tests finish.
//
// Why: on constrained Linux CI runners every test passes, but a lingering
// child-process stdio handle (from the real-`execFile` suites) keeps the event
// loop alive — and crucially, `await startVitest(...)` and `vitest.close()`
// never resolve there, so any code *after* them never runs. The reliable hook
// is vitest's `onFinished` reporter callback, which fires as soon as the run
// completes (before the hang). We read the authoritative result there and
// hard-exit. A watchdog is a last-resort backstop only.
import { startVitest } from 'vitest/node';

const cliFilters = process.argv.slice(2);

function finish(failedCount) {
  if (failedCount > 0) console.error(`\n${failedCount} test(s) failed.`);
  else console.log('\nAll tests passed — exiting.');
  process.exit(failedCount > 0 ? 1 : 0);
}

// Backstop: if onFinished never fires, fail rather than hang to the step limit.
const watchdog = setTimeout(() => {
  console.error('\nrun-tests watchdog: onFinished never fired — forcing exit 1.');
  process.exit(1);
}, 6 * 60 * 1000);
watchdog.unref();

await startVitest('test', cliFilters, { watch: false, run: true }, undefined, {
  reporters: [
    'default',
    {
      // Fires when the whole run completes, before any teardown hang.
      onFinished(files = [], errors = []) {
        const failed =
          (errors?.length ?? 0) +
          files.filter((f) => f.result?.state === 'fail').length +
          // count individual failed tests too, in case a file is marked pass
          files.reduce((n, f) => n + countFailed(f), 0);
        finish(failed);
      },
    },
  ],
});

function countFailed(task) {
  if (!task) return 0;
  if (task.type === 'test') return task.result?.state === 'fail' ? 1 : 0;
  const children = task.tasks ?? [];
  return children.reduce((n, t) => n + countFailed(t), 0);
}
