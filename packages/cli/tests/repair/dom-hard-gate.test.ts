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
});
