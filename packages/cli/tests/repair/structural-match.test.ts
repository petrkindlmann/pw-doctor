import { describe, it, expect } from 'vitest';
import { tryStructuralMatch } from '../../src/repair/structural-match.js';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';

function makeAnalyzer(html: string) {
  return new DomAnalyzer(`<html><body>${html}</body></html>`);
}

describe('tryStructuralMatch', () => {
  it('finds element with similar classes', () => {
    const analyzer = makeAnalyzer(`
      <button class="btn btn-submit">Submit</button>
      <button class="btn btn-cancel">Cancel</button>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '.btn-submit',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('structural_match');
    expect(candidate!.elementMatch.text).toBe('Submit');
  });

  it('finds element with same tag and similar attributes when no class match', () => {
    const analyzer = makeAnalyzer(`
      <input type="text" name="username" />
      <input type="password" name="pwd" />
    `);
    const candidate = tryStructuralMatch({
      failedSelector: 'input.old-class',
      failedMethod: 'locator',
      analyzer,
    });
    // Should fall back to tag-based search since .old-class won't match
    expect(candidate).not.toBeNull();
    expect(candidate!.elementMatch.tag).toBe('input');
  });

  it('prefers getByTestId when element has data-testid', () => {
    const analyzer = makeAnalyzer(`
      <button class="btn-primary" data-testid="submit-btn">Submit</button>
      <button class="btn-secondary">Cancel</button>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '.btn-primary',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.method).toBe('getByTestId');
    expect(candidate!.selector).toBe('submit-btn');
  });

  it('returns null when no matching elements exist', () => {
    const analyzer = makeAnalyzer(`
      <div>Empty page</div>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '.nonexistent-class',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for non-CSS selector methods (getByRole)', () => {
    const analyzer = makeAnalyzer(`
      <button class="btn-primary">Click</button>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: 'button',
      failedMethod: 'getByRole',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for getByText method', () => {
    const analyzer = makeAnalyzer(`
      <span>Hello</span>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: 'Hello',
      failedMethod: 'getByText',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for getByTestId method', () => {
    const analyzer = makeAnalyzer(`
      <div data-testid="my-div">Content</div>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: 'my-div',
      failedMethod: 'getByTestId',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('scores visible unique element with matching classes higher', () => {
    const analyzer = makeAnalyzer(`
      <button id="hidden-btn" class="action-btn" aria-hidden="true" data-testid="action">Hidden</button>
      <button id="visible-btn" class="action-btn primary" data-testid="primary-action">Visible</button>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '.action-btn.primary',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    // Should pick the visible one with both classes matching (higher class overlap + visible)
    expect(candidate!.elementMatch.text).toBe('Visible');
    expect(candidate!.confidence).toBeGreaterThan(50);
  });

  it('generates CSS selector when no data-testid is present', () => {
    const analyzer = makeAnalyzer(`
      <div class="card highlighted">Card content</div>
      <div class="card">Other card</div>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '.highlighted',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.method).toBe('locator');
    // Should generate a CSS selector with the element's classes
    expect(candidate!.selector).toContain('card');
    expect(candidate!.selector).toContain('highlighted');
  });

  it('returns valid selector string (not empty)', () => {
    const analyzer = makeAnalyzer(`
      <button class="submit" data-testid="submit">Go</button>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '.submit',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.selector).toBeTruthy();
    expect(candidate!.selector.length).toBeGreaterThan(0);
  });

  it('handles tag-based selector like div.container', () => {
    const analyzer = makeAnalyzer(`
      <div class="container main">Main content</div>
      <div class="sidebar">Side</div>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: 'div.container',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.elementMatch.tag).toBe('div');
    expect(candidate!.elementMatch.text).toContain('Main content');
  });

  it('handles ID-based selector like #submit', () => {
    const analyzer = makeAnalyzer(`
      <button id="submit">Submit</button>
      <button id="cancel">Cancel</button>
    `);
    // The original selector had an ID; findSimilarByClasses won't find anything,
    // but no tag is specified either, so it falls through
    const candidate = tryStructuralMatch({
      failedSelector: '#submit-old',
      failedMethod: 'locator',
      analyzer,
    });
    // No classes and no tag, so should return null
    expect(candidate).toBeNull();
  });

  it('falls back to tag search when class search yields no results', () => {
    const analyzer = makeAnalyzer(`
      <span class="label-new">New label</span>
      <span class="label-old">Old label</span>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: 'span.nonexistent',
      failedMethod: 'locator',
      analyzer,
    });
    // .nonexistent won't match any classes, but tag=span will find elements
    expect(candidate).not.toBeNull();
    expect(candidate!.elementMatch.tag).toBe('span');
  });

  it('returns null for XPath selectors', () => {
    const analyzer = makeAnalyzer(`
      <div>Content</div>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '//div[@class="test"]',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for empty selector', () => {
    const analyzer = makeAnalyzer(`
      <div>Content</div>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('confidence is clamped between 0 and 100', () => {
    const analyzer = makeAnalyzer(`
      <button class="a b c d e" data-testid="mega-btn">Click</button>
    `);
    const candidate = tryStructuralMatch({
      failedSelector: '.a.b.c.d.e',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.confidence).toBeGreaterThanOrEqual(0);
    expect(candidate!.confidence).toBeLessThanOrEqual(100);
  });
});
