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
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error ? (child.exitCode ?? 1) : 0,
        });
      },
    );

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}
