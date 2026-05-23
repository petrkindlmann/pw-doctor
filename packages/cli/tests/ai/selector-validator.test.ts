import { describe, it, expect } from 'vitest';
import { validateAiSelector } from '../../src/ai/selector-validator.js';

describe('validateAiSelector', () => {
  // Valid selectors
  it('accepts a valid getByTestId selector', () => {
    const result = validateAiSelector('login-btn', 'getByTestId');
    expect(result).toEqual({ valid: true });
  });

  it('accepts a valid locator selector with CSS', () => {
    const result = validateAiSelector('#submit', 'locator');
    expect(result).toEqual({ valid: true });
  });

  it('accepts a valid getByRole selector', () => {
    const result = validateAiSelector('button', 'getByRole');
    expect(result).toEqual({ valid: true });
  });

  it('accepts a valid getByText selector', () => {
    const result = validateAiSelector('Sign In', 'getByText');
    expect(result).toEqual({ valid: true });
  });

  // Rejection rules
  it('rejects an empty selector', () => {
    const result = validateAiSelector('', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('rejects a whitespace-only selector', () => {
    const result = validateAiSelector('   ', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('rejects a selector that is too long (>= 500 chars)', () => {
    const longSelector = 'a'.repeat(500);
    const result = validateAiSelector(longSelector, 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('500');
  });

  it('rejects a selector containing backticks', () => {
    const result = validateAiSelector('`injected`', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('backtick');
  });

  it('rejects a selector containing semicolons', () => {
    const result = validateAiSelector('div; document.cookie', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('semicolon');
  });

  it('rejects a selector containing require()', () => {
    const result = validateAiSelector('require("fs")', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('require');
  });

  it('rejects a selector containing import statement', () => {
    const result = validateAiSelector('import fs from "fs"', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('import');
  });

  it('rejects a selector containing eval()', () => {
    const result = validateAiSelector('eval("alert(1)")', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('eval');
  });

  it('rejects a selector containing Function()', () => {
    const result = validateAiSelector('Function("return this")()', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Function');
  });

  it('rejects a selector containing ${} template literal expression', () => {
    const result = validateAiSelector('div${process.env.SECRET}', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('template');
  });

  it('rejects a selector with ${} even inside escape sequences', () => {
    const result = validateAiSelector('${alert(1)}', 'locator');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('template');
  });

  it('rejects an unknown locator method', () => {
    const result = validateAiSelector('#submit', 'querySelector');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown locator method');
  });

  // Edge cases
  it('accepts a selector at exactly 499 chars', () => {
    const selector = 'a'.repeat(499);
    const result = validateAiSelector(selector, 'locator');
    expect(result.valid).toBe(true);
  });

  it('accepts all known Playwright methods', () => {
    const methods = [
      'locator', 'getByRole', 'getByTestId', 'getByText',
      'getByLabel', 'getByPlaceholder', 'getByAltText', 'getByTitle',
    ];
    for (const method of methods) {
      const result = validateAiSelector('test-selector', method);
      expect(result.valid).toBe(true);
    }
  });
});
