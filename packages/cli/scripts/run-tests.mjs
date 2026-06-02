// Run vitest as a child and decide pass/fail from its STREAMED stdout, then
// hard-exit (killing the child).
//
// Why: on GitHub's Linux runners vitest's pool teardown hangs after all tests
// pass, so nothing that depends on the run *finishing* ever fires — not
// onFinished, not the awaited promise, not the JSON --outputFile (it is written
// during that same teardown). The only signal that survives is the per-file
// result vitest prints to stdout *as each file completes*, before teardown.
// We watch that stream: a `❯`/`×`/"FAILED"/"failed" line means failure; once
// the summary line ("Test Files  N passed") prints — or the stream goes quiet
// after activity — we conclude and exit with the real code, SIGKILLing the
// lingering child.
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

let buf = '';
let sawFailure = false;
let sawSummaryPass = false;
let done = false;

function strip(s) {
  // remove ANSI color codes
  return s.replace(/\[[0-9;]*m/g, '');
}

function finish(code, reason) {
  if (done) return;
  done = true;
  clearTimeout(quietTimer);
  clearTimeout(watchdog);
  console.log(`\nrun-tests: ${reason} → exit ${code}`);
  try { child.kill('SIGKILL'); } catch { /* gone */ }
  process.exit(code);
}

// If the stream goes quiet for a while after the last all-passed summary, exit.
let quietTimer;
function bumpQuiet() {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    if (sawSummaryPass && !sawFailure) finish(0, 'summary passed, stream quiet');
    else if (sawFailure) finish(1, 'failures seen, stream quiet');
    // else keep waiting (tests may still be running)
  }, 8000);
  quietTimer.unref();
}

function onChunk(chunk) {
  const text = strip(chunk.toString());
  process.stdout.write(chunk); // pass through for the CI log
  buf += text;
  // Per-file failures and the final summary stream before teardown.
  if (/(^|\s)(×|❯)\s|FAIL\b|✗/.test(text) || /\bTest Files\b.*\bfailed\b/.test(text) || /\bTests\b.*\bfailed\b/.test(text)) {
    sawFailure = true;
  }
  const m = buf.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
  if (m && m[1] === m[2]) sawSummaryPass = true;
  if (sawSummaryPass && !sawFailure) finish(0, 'all test files passed');
  bumpQuiet();
}

child.stdout.on('data', onChunk);
child.stderr.on('data', onChunk);

child.on('exit', (code) => {
  if (sawFailure) finish(1, 'child exited with failures');
  else if (sawSummaryPass) finish(0, 'child exited, summary passed');
  else finish(code === 0 ? 0 : 1, `child exited (code ${code})`);
});
child.on('error', (err) => finish(1, `spawn error: ${err.message}`));

// Absolute backstop.
const watchdog = setTimeout(() => finish(sawFailure ? 1 : (sawSummaryPass ? 0 : 1), 'watchdog'), 7 * 60 * 1000);
watchdog.unref();
