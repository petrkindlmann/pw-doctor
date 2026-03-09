// packages/cli/tests/core/selector-extractor.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { extractSelectors } from '../../src/core/selector-extractor.js';

const FIXTURES = path.join(import.meta.dirname, '../fixtures/sample-tests');

describe('extractSelectors', () => {
  it('extracts all selectors from basic test file', () => {
    const filePath = path.join(FIXTURES, 'basic.spec.ts');
    const selectors = extractSelectors(filePath);

    expect(selectors.length).toBe(9);

    // CSS class selector
    const usernameInput = selectors.find((s) =>
      s.selectorValue === '.username-input',
    );
    expect(usernameInput).toBeDefined();
    expect(usernameInput!.selectorType).toBe('css');
    expect(usernameInput!.apiMethod).toBe('locator');

    // ID selector
    const password = selectors.find((s) => s.selectorValue === '#password');
    expect(password).toBeDefined();
    expect(password!.selectorType).toBe('id');

    // getByRole
    const signInBtn = selectors.find((s) => s.apiMethod === 'getByRole');
    expect(signInBtn).toBeDefined();
    expect(signInBtn!.selectorValue).toBe('button');
    expect(signInBtn!.selectorType).toBe('role');

    // getByTestId
    const dashHeader = selectors.find((s) => s.apiMethod === 'getByTestId');
    expect(dashHeader).toBeDefined();
    expect(dashHeader!.selectorValue).toBe('dashboard-header');
    expect(dashHeader!.selectorType).toBe('testid');

    // getByText
    const welcome = selectors.find((s) => s.apiMethod === 'getByText');
    expect(welcome).toBeDefined();
    expect(welcome!.selectorType).toBe('text');

    // getByLabel
    const search = selectors.find((s) => s.apiMethod === 'getByLabel');
    expect(search).toBeDefined();
    expect(search!.selectorType).toBe('label');

    // getByPlaceholder
    const placeholder = selectors.find((s) => s.apiMethod === 'getByPlaceholder');
    expect(placeholder).toBeDefined();
    expect(placeholder!.selectorType).toBe('placeholder');

    // getByAltText
    const avatar = selectors.find((s) => s.apiMethod === 'getByAltText');
    expect(avatar).toBeDefined();
    expect(avatar!.selectorType).toBe('alttext');

    // getByTitle
    const settings = selectors.find((s) => s.apiMethod === 'getByTitle');
    expect(settings).toBeDefined();
    expect(settings!.selectorType).toBe('title');
  });

  it('extracts chained locators', () => {
    const filePath = path.join(FIXTURES, 'chained.spec.ts');
    const selectors = extractSelectors(filePath);

    // Should find locator calls in chains
    expect(selectors.some((s) => s.selectorValue === '.nav-menu')).toBe(true);
    expect(selectors.some((s) => s.selectorValue === '.menu-item')).toBe(true);
    expect(selectors.some((s) => s.selectorValue === '.btn-submit')).toBe(true);
  });

  it('marks dynamic selectors as isDynamic', () => {
    const filePath = path.join(FIXTURES, 'dynamic.spec.ts');
    const selectors = extractSelectors(filePath);

    const dynamicSelector = selectors.find((s) => s.isDynamic);
    expect(dynamicSelector).toBeDefined();

    const staticSelector = selectors.find(
      (s) => s.selectorValue === '.static-selector',
    );
    expect(staticSelector).toBeDefined();
    expect(staticSelector!.isDynamic).toBe(false);
  });

  it('includes line and column numbers', () => {
    const filePath = path.join(FIXTURES, 'basic.spec.ts');
    const selectors = extractSelectors(filePath);

    for (const sel of selectors) {
      expect(sel.line).toBeGreaterThan(0);
      expect(sel.column).toBeGreaterThanOrEqual(0);
      expect(sel.filePath).toBe(filePath);
    }
  });

  it('includes context code around each selector', () => {
    const filePath = path.join(FIXTURES, 'basic.spec.ts');
    const selectors = extractSelectors(filePath);

    for (const sel of selectors) {
      expect(sel.contextCode).toBeTruthy();
      expect(sel.contextCode.length).toBeGreaterThan(0);
    }
  });
});
