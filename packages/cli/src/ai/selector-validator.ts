import { PLAYWRIGHT_LOCATOR_METHODS } from '@pw-doctor/shared';

export interface SelectorValidationResult {
  valid: boolean;
  reason?: string;
}

const KNOWN_METHODS: ReadonlySet<string> = new Set(PLAYWRIGHT_LOCATOR_METHODS);

const MAX_SELECTOR_LENGTH = 500;

export function validateAiSelector(selector: string, method: string): SelectorValidationResult {
  if (!selector || selector.trim().length === 0) {
    return { valid: false, reason: 'Selector must not be empty' };
  }

  if (selector.length >= MAX_SELECTOR_LENGTH) {
    return { valid: false, reason: `Selector must be < ${MAX_SELECTOR_LENGTH} chars` };
  }

  if (selector.includes('`')) {
    return { valid: false, reason: 'Selector must not contain backticks' };
  }

  if (selector.includes('${')) {
    return { valid: false, reason: 'Selector must not contain template literal expressions' };
  }

  if (selector.includes(';')) {
    return { valid: false, reason: 'Selector must not contain semicolons' };
  }

  if (/require\s*\(/.test(selector)) {
    return { valid: false, reason: 'Selector must not contain require() calls' };
  }

  if (/import\s/.test(selector)) {
    return { valid: false, reason: 'Selector must not contain import statements' };
  }

  if (/eval\s*\(/.test(selector)) {
    return { valid: false, reason: 'Selector must not contain eval() calls' };
  }

  if (/Function\s*\(/.test(selector)) {
    return { valid: false, reason: 'Selector must not contain Function() calls' };
  }

  if (/[\r\n]/.test(selector)) {
    return { valid: false, reason: 'Selector must not contain newlines' };
  }

  if (!KNOWN_METHODS.has(method)) {
    return { valid: false, reason: `Unknown locator method: ${method}` };
  }

  return { valid: true };
}
