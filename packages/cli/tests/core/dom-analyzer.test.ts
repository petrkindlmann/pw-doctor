import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';

const FIXTURE_PATH = path.join(
  import.meta.dirname,
  '../fixtures/sample-doms/login-page.html',
);
const HTML = fs.readFileSync(FIXTURE_PATH, 'utf-8');

describe('DomAnalyzer', () => {
  it('finds elements by text content', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByText('Sign In');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].tag).toBe('button');
  });

  it('finds elements by data-testid', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('data-testid', 'login-submit');
    expect(matches).toHaveLength(1);
    expect(matches[0].text.trim()).toContain('Sign In');
  });

  it('finds elements by role', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('role', 'button');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('finds elements by aria-label', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('aria-label', 'Sign in with Google');
    expect(matches).toHaveLength(1);
    expect(matches[0].tag).toBe('button');
  });

  it('extracts element metadata', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByAttribute('data-testid', 'email-input');
    expect(matches).toHaveLength(1);
    const el = matches[0];
    expect(el.attributes['type']).toBe('email');
    expect(el.attributes['placeholder']).toBe('Enter email');
    expect(el.isUnique).toBe(true);
  });

  it('finds elements by CSS selector', () => {
    const analyzer = new DomAnalyzer(HTML);
    const matches = analyzer.findByCss('.btn-primary');
    expect(matches).toHaveLength(1);
    expect(matches[0].text.trim()).toContain('Sign In');
  });

  it('detects uniqueness correctly', () => {
    const analyzer = new DomAnalyzer(HTML);
    const buttons = analyzer.findByTag('button');
    expect(buttons.length).toBeGreaterThan(1);
  });
});
