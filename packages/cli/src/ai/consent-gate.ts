import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const CONSENT_DIR_NAME = '.pw-doctor';
const CONSENT_FILE_NAME = 'ai-consent.json';

function getConsentDir(consentDir?: string): string {
  return consentDir ?? path.join(os.homedir(), CONSENT_DIR_NAME);
}

function getConsentFilePath(consentDir?: string): string {
  return path.join(getConsentDir(consentDir), CONSENT_FILE_NAME);
}

export function checkAiConsent(consentDir?: string): boolean {
  const filePath = getConsentFilePath(consentDir);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return data.consented === true;
  } catch {
    return false;
  }
}

export function recordAiConsent(consentDir?: string): void {
  const dir = getConsentDir(consentDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const filePath = path.join(dir, CONSENT_FILE_NAME);
  const data = {
    consented: true,
    timestamp: new Date().toISOString(),
    version: '1.0',
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', {
    mode: 0o600,
  });
}

export function promptForAiConsent(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output });

    const question =
      'PW-Doctor AI repair sends redacted DOM content to an external AI provider ' +
      '(Anthropic or OpenAI). Sensitive data is scrubbed before sending. ' +
      'Do you consent to enabling AI-powered repairs? (y/N) ';

    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}
