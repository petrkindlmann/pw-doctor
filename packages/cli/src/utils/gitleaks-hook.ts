import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GITLEAKS_HOOK_SCRIPT = `#!/bin/sh
# pw-doctor secret scanner (gitleaks)
gitleaks protect --staged --verbose
`;

const BASIC_HOOK_SCRIPT = `#!/bin/sh
# pw-doctor secret scanner (basic)
# Install gitleaks for more comprehensive scanning: https://github.com/gitleaks/gitleaks

PATTERNS='sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9]{20,}|Bearer [A-Za-z0-9\\-._~+/]+=*'

if git diff --cached --name-only | xargs grep -lE "$PATTERNS" 2>/dev/null; then
  echo "ERROR: Possible secrets detected in staged files. Review before committing."
  echo "To bypass: git commit --no-verify"
  exit 1
fi
`;

export interface GitleaksHookResult {
  installed: boolean;
  message: string;
}

function defaultCheckGitleaks(): boolean {
  try {
    execFileSync('which', ['gitleaks'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function setupGitleaksHook(
  cwd: string,
  checkGitleaks?: () => boolean,
): GitleaksHookResult {
  const hooksDir = path.join(cwd, '.git', 'hooks');

  // 1. Check if this is a git repo
  if (!fs.existsSync(hooksDir)) {
    return { installed: false, message: 'Not a git repository' };
  }

  // 2. Check if pre-commit hook already exists
  const hookPath = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(hookPath)) {
    return { installed: false, message: 'Pre-commit hook already exists. Skipping.' };
  }

  // 3. Check if gitleaks is available
  const hasGitleaks = (checkGitleaks ?? defaultCheckGitleaks)();

  // 4. Write the appropriate hook script
  const script = hasGitleaks ? GITLEAKS_HOOK_SCRIPT : BASIC_HOOK_SCRIPT;
  fs.writeFileSync(hookPath, script, { mode: 0o755 });

  if (hasGitleaks) {
    return { installed: true, message: 'Installed pre-commit hook (gitleaks)' };
  }
  return { installed: true, message: 'Installed pre-commit hook (basic secret scanner)' };
}
