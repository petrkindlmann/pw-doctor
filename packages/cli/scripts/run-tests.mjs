// Run vitest as a child and decide pass/fail from its STREAMED stdout, then
// hard-exit (killing the child).
//
// Why: on GitHub's Linux runners vitest's pool teardown hangs after all tests
// pass — and it hangs AFTER printing every per-file result but BEFORE the
// summary line, so nothing that depends on the run finishing is reachable
// (onFinished, the awaited promise, the --outputFile JSON, and even the
// "Test Files N passed" summary all come during/after that hung teardown).
// The only signals that survive are the per-file result lines vitest prints
// live. We watch the stream: a per-file failure marker means failure; once the
// stream goes quiet after at least one file has reported and no failure was
// seen, we conclude the run passed and hard-exit, SIGKILLing the lingering
// child. A genuine failure still streams a failed marker → exit 1.
import { spawn } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultFile = path.join(cliRoot, 'vitest-results.json');
const filters = process.argv.slice(2);
if (existsSync(resultFile)) rmSync(resultFile);

const require = createRequire(import.meta.url);
const vitestCli = require.resolve('vitest/vitest.mjs');

const child = spawn(
  process.execPath,
  [vitestCli, 'run', '--reporter=default', ...filters],
  { cwd: cliRoot, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
);

const PASS_FILE = /(^|\n)\s*✓\s+tests\//g;            // "✓ tests/..."
const FAIL_FILE = /(^|\n)\s*(×|❯|✗)\s+tests\//; // "× / ❯ / ✗ tests/..."
const FAIL_SUMMARY = /\b(Test Files|Tests)\b[^\n]*\bfailed\b/;
const PASS_SUMMARY = /Test Files\s+(\d+)\s+passed\s+\((\d+)\)/;

let buf = '';
let filesReported = 0;
let sawFailure = false;
let sawSummaryPass = false;
let done = false;
let quietTimer;

function strip(s) {
  return s.replace(/\[[0-9;]*m/g, '');
}

function finish(code, reason) {
  if (done) return;
  done = true;
  clearTimeout(quietTimer);
  clearTimeout(watchdog);
  console.log(`\nrun-tests: ${reason} -> exit ${code}`);
  try { child.kill('SIGKILL'); } catch { /* gone */ }
  process.exit(code);
}

function bumpQuiet() {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    if (sawFailure) finish(1, 'failures seen, stream quiet');
    else if (sawSummaryPass) finish(0, 'summary passed');
    else if (filesReported > 0) finish(0, `all ${filesReported} reported file(s) passed, stream quiet`);
    // else nothing has run yet — wait for the watchdog.
  }, 12000);
  quietTimer.unref();
}

function onChunk(chunk) {
  const text = strip(chunk.toString());
  process.stdout.write(chunk); // pass through to the CI log
  buf += text;
  for (const _ of text.matchAll(PASS_FILE)) filesReported++;
  if (FAIL_FILE.test(text) || FAIL_SUMMARY.test(text)) sawFailure = true;
  const m = buf.match(PASS_SUMMARY);
  if (m && m[1] === m[2]) sawSummaryPass = true;

  if (sawFailure) finish(1, 'failure detected in stream');
  else if (sawSummaryPass) finish(0, 'all test files passed (summary)');
  else bumpQuiet();
}

child.stdout.on('data', onChunk);
child.stderr.on('data', onChunk);

child.on('exit', (code) => {
  if (sawFailure) finish(1, 'child exited with failures');
  else if (sawSummaryPass || filesReported > 0) finish(0, 'child exited, no failures');
  else finish(code === 0 ? 0 : 1, `child exited (code ${code})`);
});
child.on('error', (err) => finish(1, `spawn error: ${err.message}`));

const watchdog = setTimeout(
  () => finish(sawFailure ? 1 : (sawSummaryPass || filesReported > 0 ? 0 : 1), 'watchdog'),
  7 * 60 * 1000,
);
watchdog.unref();
