import { describe, it, expect } from 'vitest';
import { tryAnchorMatch } from '../../src/repair/anchor-match.js';
import { DomAnalyzer } from '../../src/core/dom-analyzer.js';

function makeAnalyzer(html: string) {
  return new DomAnalyzer(`<html><body>${html}</body></html>`);
}

describe('tryAnchorMatch', () => {
  it('finds target via heading anchor + sibling', () => {
    const analyzer = makeAnalyzer(`
      <div>
        <h2>Order Summary</h2>
        <div class="order-total">$99.99</div>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.price-display',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('anchor_match');
    expect(candidate!.method).toBe('locator');
    expect(candidate!.elementMatch.text).toContain('$99.99');
  });

  it('finds target via data-testid anchor + descendant', () => {
    const analyzer = makeAnalyzer(`
      <div data-testid="checkout-form">
        <div class="form-fields">
          <button class="checkout-btn">Complete Order</button>
        </div>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.submit-button',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('anchor_match');
    expect(candidate!.method).toBe('locator');
    expect(candidate!.elementMatch.tag).toBe('button');
  });

  it('finds target via landmark anchor (nav) + child', () => {
    const analyzer = makeAnalyzer(`
      <nav>
        <a href="/home">Home</a>
        <a href="/about">About</a>
      </nav>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.nav-link',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('anchor_match');
    expect(candidate!.elementMatch.tag).toBe('a');
  });

  it('finds target via main landmark anchor', () => {
    const analyzer = makeAnalyzer(`
      <main>
        <div class="content">
          <button class="action">Click Here</button>
        </div>
      </main>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.submit-btn',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('anchor_match');
    expect(candidate!.elementMatch.tag).toBe('button');
  });

  it('finds target via role anchor', () => {
    const analyzer = makeAnalyzer(`
      <div role="dialog">
        <button class="close-btn">Close</button>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.modal-close-btn',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('anchor_match');
    expect(candidate!.elementMatch.tag).toBe('button');
  });

  it('finds target via aria-label anchor', () => {
    const analyzer = makeAnalyzer(`
      <div aria-label="Shopping Cart">
        <span class="item-count">3 items</span>
        <button class="cart-btn">View Cart</button>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.cart-submit-btn',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('anchor_match');
    expect(candidate!.elementMatch.tag).toBe('button');
  });

  it('returns null when no anchors exist in DOM', () => {
    const analyzer = makeAnalyzer(`
      <div class="plain">
        <div class="inner">No anchors here</div>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.missing-element',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for getByRole method', () => {
    const analyzer = makeAnalyzer(`
      <h1>Title</h1>
      <button class="submit">Submit</button>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: 'button',
      failedMethod: 'getByRole',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for getByText method', () => {
    const analyzer = makeAnalyzer(`
      <h1>Title</h1>
      <span>Hello</span>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: 'Hello',
      failedMethod: 'getByText',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for getByTestId method', () => {
    const analyzer = makeAnalyzer(`
      <h1>Title</h1>
      <div data-testid="my-div">Content</div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: 'my-div',
      failedMethod: 'getByTestId',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for getByLabel method', () => {
    const analyzer = makeAnalyzer(`
      <h1>Title</h1>
      <input aria-label="Name" />
    `);
    const candidate = tryAnchorMatch({
      failedSelector: 'Name',
      failedMethod: 'getByLabel',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for empty selector', () => {
    const analyzer = makeAnalyzer(`
      <h1>Title</h1>
      <div>Content</div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('returns null for XPath selector', () => {
    const analyzer = makeAnalyzer(`
      <h1>Title</h1>
      <div>Content</div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '//div[@class="test"]',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).toBeNull();
  });

  it('scores data-testid anchor higher than heading anchor', () => {
    const analyzer = makeAnalyzer(`
      <div>
        <h2>Section Title</h2>
        <div data-testid="section-content">
          <button class="action-btn">Click Me</button>
        </div>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.old-button',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    // data-testid anchors should score higher (15 vs 10 for heading)
    expect(candidate!.confidence).toBeGreaterThanOrEqual(45);
  });

  it('confidence is between 0 and 100', () => {
    const analyzer = makeAnalyzer(`
      <div data-testid="container">
        <button id="unique-btn" class="btn primary">Submit</button>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.old-submit',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.confidence).toBeGreaterThanOrEqual(0);
    expect(candidate!.confidence).toBeLessThanOrEqual(100);
  });

  it('generated selector is a valid CSS string that finds elements', () => {
    const analyzer = makeAnalyzer(`
      <section>
        <h3>User Profile</h3>
        <div class="profile-info">
          <span class="user-label">John Doe</span>
        </div>
      </section>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: 'span.profile-label',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    // Verify the generated selector actually matches something in the DOM
    const matches = analyzer.findByCss(candidate!.selector);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('uses tag hint from selector name (.submit-btn suggests button)', () => {
    const analyzer = makeAnalyzer(`
      <div>
        <h2>Checkout</h2>
        <button class="new-submit">Place Order</button>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.submit-btn',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.elementMatch.tag).toBe('button');
  });

  it('handles multiple anchors and picks best candidate', () => {
    const analyzer = makeAnalyzer(`
      <div>
        <h1>Page Title</h1>
        <nav>
          <a href="/link1">Link 1</a>
        </nav>
        <section>
          <h2>Products</h2>
          <div data-testid="product-list">
            <button class="buy-btn">Buy Now</button>
          </div>
        </section>
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.purchase-btn',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.strategy).toBe('anchor_match');
    // Should find the button via one of the anchors
    expect(candidate!.elementMatch.text).toContain('Buy Now');
  });

  it('provides meaningful reasoning mentioning the anchor type', () => {
    const analyzer = makeAnalyzer(`
      <div>
        <h2>Payment Details</h2>
        <input type="text" class="card-number" placeholder="Card Number" />
      </div>
    `);
    const candidate = tryAnchorMatch({
      failedSelector: '.credit-card-input',
      failedMethod: 'locator',
      analyzer,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.reasoning).toContain('anchor');
  });
});
