// Run vitest as a short-lived child, read its JSON result file, and force exit.
//
// Why: on GitHub's Linux runners every test passes, but vitest's worker pool
// hangs during teardown (the run never "finishes", so neither onFinished nor
// the awaited startVitest promise ever fires). Rather than fight the pool, we
// spawn `vitest run` with the JSON reporter writing to a file. Vitest flushes
// that file the moment the run completes — before the teardown hang — so we can
// read the authoritative pass/fail from it and hard-exit, killing the lingering
// child if needed. A real failure is still surfaced (non-zero numFailedTests
// or a missing/!success report → exit 1).
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultFile = path.join(cliRoot, 'vitest-results.json');
const filters = process.argv.slice(2);

if (existsSync(resultFile)) rmSync(resultFile);

// Resolve vitest's CLI entry robustly (it may be hoisted to the monorepo root,
// so a fixed node_modules/.bin path is unreliable). Run it with `node`.
const require = createRequire(import.meta.url);
const vitestCli = require.resolve('vitest/vitest.mjs');
const child = spawn(
  process.execPath,
  [vitestCli, 'run', '--reporter=default', '--reporter=json', `--outputFile=${resultFile}`, ...filters],
  { cwd: cliRoot, stdio: ['ignore', 'inherit', 'inherit'], env: process.env },
);

function evaluateAndExit(reason) {
  let failed = 1;
  try {
    if (existsSync(resultFile)) {
      const report = JSON.parse(readFileSync(resultFile, 'utf8'));
      // vitest json report: { success, numFailedTests, numTotalTests, ... }
      failed = report.success === true && (report.numFailedTests ?? 0) === 0
        ? 0
        : (report.numFailedTests ?? 1) || (report.success ? 0 : 1);
    } else {
      console.error(`\nrun-tests: no result file (${reason}).`);
    }
  } catch (err) {
    console.error('\nrun-tests: failed to parse results:', err.message);
    failed = 1;
  }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
  if (failed > 0) console.error(`\n${failed} test(s) failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

// Normal path: vitest finished writing the JSON and exited.
child.on('exit', () => evaluateAndExit('child exited'));
child.on('error', (err) => {
  console.error('run-tests: failed to spawn vitest:', err.message);
  process.exit(1);
});

// Teardown-hang path: child wrote the JSON but won't exit. Poll for the file;
// once it exists and is parseable, evaluate and exit (killing the child).
const poll = setInterval(() => {
  if (!existsSync(resultFile)) return;
  try {
    JSON.parse(readFileSync(resultFile, 'utf8')); // ensure fully written
    clearInterval(poll);
    evaluateAndExit('result file ready (child still lingering)');
  } catch {
    // not fully flushed yet
  }
}, 1000);
poll.unref();

// Absolute backstop.
const watchdog = setTimeout(() => evaluateAndExit('watchdog'), 7 * 60 * 1000);
watchdog.unref();
