import { safeExec, type ExecResult } from '../utils/safe-exec.js';

export interface TestResult {
  testName: string;
  file: string;
  passed: boolean;
  duration?: number;
  error?: string;
  errorStack?: string;
}

export interface SelectorFailure {
  file: string;
  line: number;
  column: number;
  selector: string;
  method: string;
  testName: string;
  error: string;
}

export async function runPlaywrightTests(
  projectRoot: string,
  options?: {
    testFile?: string;
    testNamePattern?: string;
    timeout?: number;
    retries?: number;
  },
): Promise<ExecResult> {
  const args = ['playwright', 'test', '--reporter=json', '--retries=0'];

  if (options?.testFile) {
    args.push(options.testFile);
  }
  if (options?.testNamePattern) {
    // Escape regex special chars to prevent ReDoS in Playwright's --grep
    const escaped = options.testNamePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    args.push('--grep', escaped);
  }
  if (options?.timeout) {
    args.push('--timeout', String(options.timeout));
  }
  if (options?.retries !== undefined) {
    args[args.indexOf('--retries=0')] = `--retries=${options.retries}`;
  }

  return safeExec('npx', args, {
    cwd: projectRoot,
    timeout: 120000,
  });
}

export function parsePlaywrightJsonOutput(jsonOutput: string): TestResult[] {
  const results: TestResult[] = [];

  let data: { suites: PlaywrightSuite[] };
  try {
    data = JSON.parse(jsonOutput);
  } catch {
    return results;
  }

  function walkSuites(suites: PlaywrightSuite[]) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const test of spec.tests ?? []) {
            const lastResult = test.results?.[test.results.length - 1];
            const passed = test.status === 'expected' && lastResult?.status === 'passed';
            const error = lastResult?.errors?.[0];

            results.push({
              testName: spec.title,
              file: spec.file ?? suite.file ?? '',
              passed,
              duration: lastResult?.duration,
              error: error?.message,
              errorStack: error?.stack,
            });
          }
        }
      }
      if (suite.suites) {
        walkSuites(suite.suites);
      }
    }
  }

  walkSuites(data.suites ?? []);
  return results;
}

export function extractFailedSelectors(results: TestResult[]): SelectorFailure[] {
  const failures: SelectorFailure[] = [];

  for (const result of results) {
    if (result.passed || !result.error) continue;

    // Extract selector from Playwright timeout error messages
    // Patterns:
    //   "locator.click: Timeout ... waiting for locator('.btn')"
    //   "page.getByTestId('submit'): Timeout ..."
    const selectorMatch =
      result.error.match(/waiting for locator\('([^']+)'\)/) ??
      result.error.match(/waiting for locator\("([^"]+)"\)/) ??
      result.error.match(/page\.(getBy\w+)\('([^']+)'\).*Timeout/) ??
      result.error.match(/locator\.(\w+):.*waiting for locator\('([^']+)'\)/);

    if (!selectorMatch) continue;

    let selector: string;
    let method: string;

    if (selectorMatch[0].includes('getBy')) {
      method = selectorMatch[1];
      selector = selectorMatch[2];
    } else {
      method = 'locator';
      selector = selectorMatch[1];
    }

    // Extract file and line from stack trace
    let file = result.file;
    let line = 0;
    let column = 0;

    if (result.errorStack) {
      const stackMatch = result.errorStack.match(/at .*?([^\s/]+\.(?:spec|test)\.ts):(\d+):(\d+)/);
      if (stackMatch) {
        file = result.file || stackMatch[1];
        line = parseInt(stackMatch[2], 10);
        column = parseInt(stackMatch[3], 10);
      }
    }

    failures.push({
      file,
      line,
      column,
      selector,
      method,
      testName: result.testName,
      error: result.error,
    });
  }

  return failures;
}

// Internal Playwright JSON types (subset)
interface PlaywrightSuite {
  title: string;
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightSpec {
  title: string;
  file?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightTest {
  status: string;
  results?: PlaywrightTestResult[];
}

interface PlaywrightTestResult {
  status: string;
  duration?: number;
  errors?: Array<{ message?: string; stack?: string }>;
}
