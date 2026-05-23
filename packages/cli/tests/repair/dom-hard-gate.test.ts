import { describe, it, expect } from 'vitest';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';
import { verifyAgainstDom } from '../../src/repair/dom-hard-gate.js';

const HTML = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <button data-testid="submit-btn" role="button" aria-label="Submit form" title="Submit" class="primary">Submit</button>
  <input type="text" placeholder="Search..." alt="search field" />
  <div class="duplicate">First</div>
  <div class="duplicate">Second</div>
  <input type="hidden" data-testid="hidden-field" value="secret" />
  <span hidden="hidden" data-testid="hidden-span">Hidden span</span>
  <p aria-hidden="true" data-testid="aria-hidden-el">Aria hidden</p>
  <img alt="logo" src="logo.png" />
</body>
</html>
`;

describe('verifyAgainstDom', () => {
  const analyzer = new DomAnalyzer(HTML);

  // --- Passing cases ---

  it('passes for a unique visible element via locator (CSS)', () => {
    const result = verifyAgainstDom({ selector: '.primary', method: 'locator' }, analyzer);
    expect(result.passes).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes for a unique visible element via getByTestId', () => {
    const result = verifyAgainstDom({ selector: 'submit-btn', method: 'getByTestId' }, analyzer);
    expect(result.passes).toBe(true);
  });

  it('passes for a unique visible element via getByText', () => {
    const result = verifyAgainstDom({ selector: 'Submit', method: 'getByText' }, analyzer);
    // "Submit" text appears on the button — should match exactly 1 visible element
    expect(result.passes).toBe(true);
  });

  it('passes for a unique visible element via getByRole', () => {
    const result = verifyAgainstDom({ selector: 'button', method: 'getByRole' }, analyzer);
    expect(result.passes).toBe(true);
  });

  it('passes for a unique visible element via getByLabel', () => {
    const result = verifyAgainstDom({ selector: 'Submit form', method: 'getByLabel' }, analyzer);
    expect(result.passes).toBe(true);
  });

  it('passes for a unique visible element via getByPlaceholder', () => {
    const result = verifyAgainstDom({ selector: 'Search...', method: 'getByPlaceholder' }, analyzer);
    expect(result.passes).toBe(true);
  });

  it('passes for a unique visible element via getByAltText', () => {
    const result = verifyAgainstDom({ selector: 'logo', method: 'getByAltText' }, analyzer);
    expect(result.passes).toBe(true);
  });

  it('passes for a unique visible element via getByTitle', () => {
    const result = verifyAgainstDom({ selector: 'Submit', method: 'getByTitle' }, analyzer);
    expect(result.passes).toBe(true);
  });

  // --- Failing: no matches ---

  it('fails with "no elements matched" when selector finds nothing', () => {
    const result = verifyAgainstDom({ selector: '.nonexistent', method: 'locator' }, analyzer);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe('no elements matched');
  });

  it('fails with "no elements matched" for getByTestId with no match', () => {
    const result = verifyAgainstDom({ selector: 'no-such-id', method: 'getByTestId' }, analyzer);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe('no elements matched');
  });

  // --- Failing: multiple matches ---

  it('fails with multiple matches for non-unique CSS selector', () => {
    const result = verifyAgainstDom({ selector: '.duplicate', method: 'locator' }, analyzer);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe('matched 2 elements, expected 1');
  });

  // --- Failing: hidden elements ---

  it('fails for a type="hidden" input via getByTestId', () => {
    const result = verifyAgainstDom({ selector: 'hidden-field', method: 'getByTestId' }, analyzer);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe('matched element is not visible');
  });

  it('fails for a hidden-attribute element via getByTestId', () => {
    const result = verifyAgainstDom({ selector: 'hidden-span', method: 'getByTestId' }, analyzer);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe('matched element is not visible');
  });

  it('fails for an aria-hidden element via getByTestId', () => {
    const result = verifyAgainstDom({ selector: 'aria-hidden-el', method: 'getByTestId' }, analyzer);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe('matched element is not visible');
  });

  // --- Edge: unknown method ---

  it('fails with "no elements matched" for unknown method', () => {
    const result = verifyAgainstDom({ selector: 'anything', method: 'unknownMethod' }, analyzer);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe('no elements matched');
  });

  // --- Action compatibility ---

  const ACTION_HTML = `
    <!DOCTYPE html>
    <html><body>
      <button data-testid="real-btn">Click me</button>
      <div data-testid="fake-btn">Click me</div>
      <input type="text" data-testid="textbox" placeholder="enter" />
      <input type="checkbox" data-testid="check" />
      <input type="submit" data-testid="submit-input" value="Go" />
      <select data-testid="dropdown"><option>one</option></select>
      <span role="button" data-testid="aria-btn">role button</span>
    </body></html>
  `;
  const actionAnalyzer = new DomAnalyzer(ACTION_HTML);

  it('passes click action on a <button>', () => {
    const result = verifyAgainstDom(
      { selector: 'real-btn', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'click' },
    );
    expect(result.passes).toBe(true);
  });

  it('rejects click action on a <div>', () => {
    const result = verifyAgainstDom(
      { selector: 'fake-btn', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'click' },
    );
    expect(result.passes).toBe(false);
    expect(result.reason).toContain('no interactive role');
  });

  it('passes click action on a <span role="button">', () => {
    const result = verifyAgainstDom(
      { selector: 'aria-btn', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'click' },
    );
    expect(result.passes).toBe(true);
  });

  it('passes fill action on a text input', () => {
    const result = verifyAgainstDom(
      { selector: 'textbox', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'fill' },
    );
    expect(result.passes).toBe(true);
  });

  it('rejects fill action on a button', () => {
    const result = verifyAgainstDom(
      { selector: 'real-btn', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'fill' },
    );
    expect(result.passes).toBe(false);
    expect(result.reason).toContain('not a form field');
  });

  it('rejects fill action on a submit input', () => {
    const result = verifyAgainstDom(
      { selector: 'submit-input', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'fill' },
    );
    expect(result.passes).toBe(false);
  });

  it('passes check action on a checkbox', () => {
    const result = verifyAgainstDom(
      { selector: 'check', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'check' },
    );
    expect(result.passes).toBe(true);
  });

  it('rejects check action on a text input', () => {
    const result = verifyAgainstDom(
      { selector: 'textbox', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'check' },
    );
    expect(result.passes).toBe(false);
    expect(result.reason).toContain('checkbox');
  });

  it('passes select action on a <select>', () => {
    const result = verifyAgainstDom(
      { selector: 'dropdown', method: 'getByTestId' },
      actionAnalyzer,
      { expectedAction: 'select' },
    );
    expect(result.passes).toBe(true);
  });

  it('falls back to base checks when no expectedAction is provided', () => {
    const result = verifyAgainstDom(
      { selector: 'fake-btn', method: 'getByTestId' },
      actionAnalyzer,
    );
    expect(result.passes).toBe(true);
  });
});
