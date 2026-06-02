import { execFile } from 'node:child_process';

const SENSITIVE_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'PW_DOCTOR_API_KEY',
  'OPENAI_API_KEY',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
];

const ALLOWED_ENV_PREFIX = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'NODE',
  'NPM',
  'CI',
  'DISPLAY',
  'LANG',
  'LC_',
  'PLAYWRIGHT_',
  'PW_TEST_',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
];

function buildSafeEnv(): Record<string, string> {
  const safeEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SENSITIVE_ENV_VARS.includes(key)) continue;
    const isAllowed = ALLOWED_ENV_PREFIX.some(
      (prefix) => key === prefix || key.startsWith(prefix),
    );
    if (isAllowed) {
      safeEnv[key] = value;
    }
  }
  return safeEnv;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function safeExec(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    let settled = false;
    const child = execFile(
      command,
      args,
      {
        cwd: options?.cwd,
        timeout: options?.timeout,
        env: buildSafeEnv(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      },
      (error, stdout, stderr) => {
        if (settled) return;
        settled = true;
        cleanup(child);
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error ? (child.exitCode ?? 1) : 0,
        });
      },
    );

    // Don't let the child's handles keep the parent's event loop alive. On some
    // Linux runners a finished child's stdio pipes linger long enough to stall
    // process exit (which hung CI); unref + explicit stdio teardown prevents it.
    child.unref();

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup(child);
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

/** Destroy a finished child's stdio streams so no handle keeps the loop alive. */
function cleanup(child: ReturnType<typeof execFile>): void {
  try {
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.stdin?.destroy();
  } catch {
    // best-effort
  }
}
