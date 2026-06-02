import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tryTextMatch } from '../../src/repair/text-match.js';
import { tryAttributeMatch } from '../../src/repair/attribute-match.js';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';

const HTML = fs.readFileSync(
  path.join(import.meta.dirname, '../fixtures/sample-doms/login-page.html'),
  'utf-8',
);

describe('tryTextMatch', () => {
  it('finds element by text when CSS class selector breaks', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryTextMatch({
      failedSelector: '.submit-btn',
      failedMethod: 'locator',
      contextCode: "await page.locator('.submit-btn').click();",
      analyzer,
    });
    // The button with text "Sign In" should be found via getByText since .submit-btn is on that element
    expect(candidate).not.toBeNull();
    if (candidate) {
      expect(candidate.method).toBe('getByText');
      expect(candidate.selector).toBe('Sign In');
      expect(candidate.strategy).toBe('text_match');
    }
  });

  it('returns null when no text match found', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryTextMatch({
      failedSelector: '.nonexistent',
      failedMethod: 'locator',
      contextCode: "await page.locator('.nonexistent').click();",
      analyzer,
    });
    expect(candidate).toBeNull();
  });
});

describe('tryAttributeMatch', () => {
  it('finds data-testid alternative for broken CSS selector', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryAttributeMatch({
      failedSelector: '.btn-primary',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    if (candidate) {
      expect(candidate.selector).toBe('login-submit');
      expect(candidate.method).toBe('getByTestId');
      expect(candidate.confidence).toBeGreaterThan(50);
      expect(candidate.strategy).toBe('attribute_match');
    }
  });

  it('prefers getByRole with accessible name for an aria-labelled button', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryAttributeMatch({
      failedSelector: '.btn-google',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    if (candidate) {
      // <button aria-label="Sign in with Google"> → role button + name.
      // getByRole(role, { name }) is the most robust locator Playwright offers.
      expect(candidate.method).toBe('getByRole');
      expect(candidate.selector).toBe('button');
      expect(candidate.nameOption).toBe('Sign in with Google');
    }
  });

  it('derives an implicit role for a native <a href> with no explicit attributes', () => {
    const analyzer = new DomAnalyzer(HTML);
    const candidate = tryAttributeMatch({
      failedSelector: '.forgot-link',
      failedMethod: 'locator',
      analyzer,
    });
    // The <a href> has implicit role "link"; its visible text is the
    // accessible name. This is a robust semantic alternative, not a miss.
    expect(candidate).not.toBeNull();
    if (candidate) {
      expect(candidate.method).toBe('getByRole');
      expect(candidate.selector).toBe('link');
      expect(candidate.nameOption).toBe('Forgot password?');
    }
  });

  it('returns null when there is genuinely no semantic anchor', () => {
    // A bare <span> with only a presentational class, no role/text/label.
    const analyzer = new DomAnalyzer('<div><span class="spacer-x"></span></div>');
    const candidate = tryAttributeMatch({
      failedSelector: '.spacer-x',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).toBeNull();
  });
});
