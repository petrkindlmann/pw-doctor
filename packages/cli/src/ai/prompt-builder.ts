import type { AiRepairInput } from '@pw-doctor/shared';

export interface BuiltPrompt {
  systemPrompt: string;
  userMessage: string;
}

const SYSTEM_PROMPT = `You are a Playwright test selector repair expert. Your job is to analyze a failed Playwright selector and the surrounding DOM HTML, then suggest alternative selectors that are more resilient to UI changes.

Rules:
- Suggest 1-3 alternative selectors, ranked by confidence (0-100).
- Prefer Playwright's built-in locator methods in this order: getByTestId > getByRole > getByText > getByLabel > getByPlaceholder > locator.
- Prefer semantic selectors (role, label, testid) over structural CSS selectors.
- Never suggest CSS selectors that contain class names which look auto-generated or dynamic (e.g. classes with hashes, random strings, or CSS-module patterns like "Button_root__a1b2c").
- Each candidate must include the selector string, the Playwright method to use, a confidence score, and a short reasoning.

You MUST respond with valid JSON matching this exact schema and nothing else:

{
  "candidates": [
    {
      "selector": "<the selector string>",
      "method": "<Playwright method: getByTestId | getByRole | getByText | getByLabel | getByPlaceholder | locator>",
      "confidence": <number 0-100>,
      "reasoning": "<short explanation>"
    }
  ]
}

Do not include any text outside the JSON object.`;

export function buildRepairPrompt(input: AiRepairInput): BuiltPrompt {
  const lines: string[] = [
    `The following Playwright selector failed:`,
    ``,
    `  Method: ${input.failedMethod}`,
    `  Selector: ${input.failedSelector}`,
    `  Error: ${input.errorMessage}`,
    ``,
    `File: ${input.filePath}:${String(input.line)}`,
    ``,
    `Code context:`,
    '```',
    input.contextCode,
    '```',
    ``,
    `Relevant DOM HTML:`,
    '```html',
    input.redactedHtml,
    '```',
    ``,
    `Suggest 1-3 alternative selectors as JSON.`,
  ];

  return {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: lines.join('\n'),
  };
}
