// packages/cli/src/reporter/pw-doctor-reporter.ts
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';
import { PW_DOCTOR_CAPTURES_DIR } from '@pw-doctor/shared';
import { hashString } from '../utils/hash.js';

class PwDoctorReporter implements Reporter {
  private outputDir: string;

  constructor(options?: { outputDir?: string }) {
    this.outputDir = options?.outputDir ?? PW_DOCTOR_CAPTURES_DIR;
  }

  onBegin(): void {
    // Clear previous captures
    if (fs.existsSync(this.outputDir)) {
      fs.rmSync(this.outputDir, { recursive: true });
    }
    fs.mkdirSync(this.outputDir, { recursive: true, mode: 0o700 });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed') return;

    const attachment = result.attachments.find(
      (a) => a.name === 'pw-doctor-dom' && a.contentType === 'text/html',
    );
    if (!attachment?.body) return;

    const fileHash = hashString(test.location.file);
    const testHash = hashString(test.title);
    const filename = `${fileHash}-${testHash}.html`;
    const outputPath = path.join(this.outputDir, filename);

    fs.writeFileSync(outputPath, attachment.body, { mode: 0o600 });
  }
}

export default PwDoctorReporter;
