import { describe, it, expect } from 'vitest';
import { redactHtml } from '../../src/core/dom-redactor.js';

describe('redactHtml', () => {
  describe('moderate preset (default)', () => {
    it('strips script tags', () => {
      const html = '<html><body><div>Hello</div><script>alert("xss")</script></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('alert');
      expect(result.stats.elementsRemoved).toBeGreaterThanOrEqual(1);
    });

    it('strips style tags', () => {
      const html = '<html><body><style>.foo { color: red; }</style><div>Hello</div></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('<style');
      expect(result.html).not.toContain('color: red');
    });

    it('strips noscript tags', () => {
      const html = '<html><body><noscript>Enable JS</noscript><div>Hello</div></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('<noscript');
      expect(result.html).not.toContain('Enable JS');
    });

    it('removes HTML comments', () => {
      const html = '<html><body><!-- secret comment --><div>Hello</div></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('secret comment');
      expect(result.html).toContain('Hello');
    });

    it('preserves data-testid, role, aria-label, class, id', () => {
      const html = `<html><body>
        <div data-testid="login-form" role="form" aria-label="Login" class="form-container" id="loginForm">
          <input placeholder="Email" />
        </div>
      </body></html>`;
      const result = redactHtml(html);
      expect(result.html).toContain('data-testid="login-form"');
      expect(result.html).toContain('role="form"');
      expect(result.html).toContain('aria-label="Login"');
      expect(result.html).toContain('class="form-container"');
      expect(result.html).toContain('id="loginForm"');
      expect(result.html).toContain('placeholder="Email"');
    });

    it('strips inline event handler attributes', () => {
      const html = '<html><body><button onclick="doStuff()" onload="init()">Click</button></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('onclick');
      expect(result.html).not.toContain('onload');
      expect(result.html).toContain('Click');
      expect(result.stats.attributesStripped).toBeGreaterThanOrEqual(2);
    });

    it('strips style attributes', () => {
      const html = '<html><body><div style="color: red;">Hello</div></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('style=');
      expect(result.html).not.toContain('color: red');
    });

    it('scrubs email patterns', () => {
      const html = '<html><body><span>Contact us at user@example.com</span></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('user@example.com');
      expect(result.html).toContain('[REDACTED]');
      expect(result.stats.patternsRedacted).toBeGreaterThanOrEqual(1);
    });

    it('scrubs JWT patterns', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const html = `<html><body><div data-token="${jwt}">Content</div></body></html>`;
      const result = redactHtml(html);
      expect(result.html).not.toContain('eyJhbGci');
      expect(result.html).toContain('[REDACTED]');
      expect(result.stats.patternsRedacted).toBeGreaterThanOrEqual(1);
    });

    it('scrubs API key patterns', () => {
      const html = '<html><body><span>Key: sk-abc12345678901234567890</span></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('sk-abc12345678901234567890');
      expect(result.html).toContain('[REDACTED]');
    });

    it('scrubs Anthropic API key patterns', () => {
      const html = '<html><body><span>Key: sk-ant-api03-abcdefghij1234567890</span></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('sk-ant-api03');
      expect(result.html).toContain('[REDACTED]');
    });

    it('scrubs UUID patterns', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const html = `<html><body><span>ID: ${uuid}</span></body></html>`;
      const result = redactHtml(html);
      expect(result.html).not.toContain(uuid);
      expect(result.html).toContain('[REDACTED]');
    });

    it('scrubs Stripe-like key patterns', () => {
      const html = '<html><body><span>pk_live_abc1234567890abc</span></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('pk_live_abc1234567890abc');
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts password input values', () => {
      const html = '<html><body><input type="password" value="s3cret123" /></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('s3cret123');
      expect(result.html).toContain('value="[REDACTED]"');
    });

    it('reduces href/src/action to domain only', () => {
      const html = `<html><body>
        <a href="https://example.com/path/to/page?q=sensitive">Link</a>
        <img src="https://cdn.example.com/images/photo.jpg" />
        <form action="https://api.example.com/submit?token=abc">
          <button>Submit</button>
        </form>
      </body></html>`;
      const result = redactHtml(html);
      expect(result.html).toContain('href="example.com"');
      expect(result.html).toContain('src="cdn.example.com"');
      expect(result.html).toContain('action="api.example.com"');
      expect(result.html).not.toContain('/path/to/page');
      expect(result.html).not.toContain('token=abc');
    });

    it('redacts href with no domain to [REDACTED]', () => {
      const html = '<html><body><a href="javascript:void(0)">Click</a></body></html>';
      const result = redactHtml(html);
      // javascript: scheme should be redacted
      expect(result.html).toContain('[REDACTED]');
    });

    it('preserves text content in moderate mode', () => {
      const html = '<html><body><h1>Welcome to our site</h1><p>Please log in</p></body></html>';
      const result = redactHtml(html);
      expect(result.html).toContain('Welcome to our site');
      expect(result.html).toContain('Please log in');
    });
  });

  describe('maxSize truncation', () => {
    it('truncates HTML when over maxSize', () => {
      const html = '<html><body>' + '<div>content</div>'.repeat(100) + '</body></html>';
      const result = redactHtml(html, { maxSize: 200 });
      expect(result.stats.truncated).toBe(true);
      expect(result.html).toContain('<!-- pw-doctor: truncated -->');
      // The truncated comment is appended, so total may be slightly over maxSize
      expect(result.html.length).toBeLessThan(html.length);
    });

    it('does not truncate when under maxSize', () => {
      const html = '<html><body><div>short</div></body></html>';
      const result = redactHtml(html, { maxSize: 10000 });
      expect(result.stats.truncated).toBe(false);
      expect(result.html).not.toContain('<!-- pw-doctor: truncated -->');
    });
  });

  describe('maxDepth flattening', () => {
    it('flattens elements deeper than maxDepth', () => {
      const html = `<html><body>
        <div class="level-1">
          <div class="level-2">
            <div class="level-3">
              <span class="level-4">Deep text</span>
            </div>
          </div>
        </div>
      </body></html>`;
      const result = redactHtml(html, { maxDepth: 2 });
      expect(result.html).toContain('Deep text');
      // Elements beyond depth 2 should be flattened
      expect(result.stats.elementsRemoved).toBeGreaterThanOrEqual(1);
    });
  });

  describe('strict preset', () => {
    it('strips all text content', () => {
      const html = '<html><body><h1>Secret Heading</h1><p>Private paragraph</p></body></html>';
      const result = redactHtml(html, { preset: 'strict' });
      expect(result.html).not.toContain('Secret Heading');
      expect(result.html).not.toContain('Private paragraph');
      expect(result.html).toContain('[TEXT]');
    });

    it('strips all attributes except selector-relevant ones', () => {
      const html = `<html><body>
        <div data-testid="foo" class="bar" data-custom="baz" style="color:red" onclick="hack()">
          Content
        </div>
      </body></html>`;
      const result = redactHtml(html, { preset: 'strict' });
      expect(result.html).toContain('data-testid="foo"');
      expect(result.html).toContain('class="bar"');
      expect(result.html).not.toContain('data-custom="baz"');
      expect(result.html).not.toContain('style=');
      expect(result.html).not.toContain('onclick=');
      expect(result.stats.attributesStripped).toBeGreaterThanOrEqual(2);
    });

    it('preserves role and aria attributes', () => {
      const html = '<html><body><button role="button" aria-label="Submit" data-analytics="track">Go</button></body></html>';
      const result = redactHtml(html, { preset: 'strict' });
      expect(result.html).toContain('role="button"');
      expect(result.html).toContain('aria-label="Submit"');
      expect(result.html).not.toContain('data-analytics');
    });

    it('still removes script/style/noscript', () => {
      const html = '<html><body><script>bad</script><style>.x{}</style><noscript>no</noscript><div>ok</div></body></html>';
      const result = redactHtml(html, { preset: 'strict' });
      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('<style');
      expect(result.html).not.toContain('<noscript');
    });
  });

  describe('minimal preset', () => {
    it('only strips script and style tags', () => {
      const html = `<html><body>
        <script>alert("xss")</script>
        <style>.foo { color: red; }</style>
        <div onclick="hack()" style="color: blue" data-secret="value">
          <span>user@example.com</span>
        </div>
      </body></html>`;
      const result = redactHtml(html, { preset: 'minimal' });
      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('<style');
      // Minimal does NOT strip event handlers, inline styles, or sensitive patterns
      expect(result.html).toContain('onclick="hack()"');
      expect(result.html).toContain('style="color: blue"');
      expect(result.html).toContain('user@example.com');
    });

    it('does not remove noscript in minimal mode', () => {
      const html = '<html><body><noscript>JS disabled</noscript><div>ok</div></body></html>';
      const result = redactHtml(html, { preset: 'minimal' });
      expect(result.html).toContain('JS disabled');
    });
  });

  describe('custom stripSelectors', () => {
    it('removes elements matching custom selectors', () => {
      const html = `<html><body>
        <nav class="sidebar">Navigation</nav>
        <div class="content">Main content</div>
        <footer>Footer</footer>
      </body></html>`;
      const result = redactHtml(html, { stripSelectors: ['nav.sidebar', 'footer'] });
      expect(result.html).not.toContain('Navigation');
      expect(result.html).not.toContain('Footer');
      expect(result.html).toContain('Main content');
      expect(result.stats.elementsRemoved).toBeGreaterThanOrEqual(2);
    });
  });

  describe('preserveAttributes override', () => {
    it('preserves attributes that would normally be stripped', () => {
      const html = '<html><body><div style="display:none" onclick="track()">Hello</div></body></html>';
      const result = redactHtml(html, { preserveAttributes: ['style'] });
      // style should be preserved because it's in preserveAttributes
      expect(result.html).toContain('style="display:none"');
      // onclick should still be stripped
      expect(result.html).not.toContain('onclick');
    });

    it('preserveAttributes works with strict preset', () => {
      const html = '<html><body><div data-custom="keep" data-other="strip">Hello</div></body></html>';
      const result = redactHtml(html, { preset: 'strict', preserveAttributes: ['data-custom'] });
      expect(result.html).toContain('data-custom="keep"');
      expect(result.html).not.toContain('data-other');
    });
  });

  describe('custom patterns', () => {
    it('applies custom regex patterns to text', () => {
      const html = '<html><body><span>Order #ORD-12345</span></body></html>';
      const result = redactHtml(html, { customPatterns: [/ORD-\d+/g] });
      expect(result.html).not.toContain('ORD-12345');
      expect(result.html).toContain('[REDACTED]');
    });
  });

  describe('combined options', () => {
    it('handles a realistic HTML page', () => {
      const html = `<html><body>
        <script>window.__INITIAL_STATE__ = {"token": "sk-abc12345678901234567890"}</script>
        <style>body { margin: 0; }</style>
        <!-- Build: v2.1.3 -->
        <div id="app" class="app-container" data-testid="app-root">
          <header role="banner">
            <h1>Dashboard</h1>
            <span>Welcome user@company.com</span>
          </header>
          <main role="main">
            <form action="https://api.example.com/submit" onsubmit="validate()">
              <input type="email" placeholder="Email" data-testid="email-input" />
              <input type="password" value="hunter2" name="password" />
              <button type="submit" data-testid="submit-btn" class="btn-primary" aria-label="Submit form">
                Sign In
              </button>
            </form>
          </main>
        </div>
      </body></html>`;

      const result = redactHtml(html);

      // Script and style removed
      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('__INITIAL_STATE__');
      expect(result.html).not.toContain('<style');

      // Comments removed
      expect(result.html).not.toContain('Build: v2.1.3');

      // Selector-relevant attributes preserved
      expect(result.html).toContain('data-testid="app-root"');
      expect(result.html).toContain('data-testid="email-input"');
      expect(result.html).toContain('data-testid="submit-btn"');
      expect(result.html).toContain('role="banner"');
      expect(result.html).toContain('role="main"');
      expect(result.html).toContain('class="btn-primary"');
      expect(result.html).toContain('aria-label="Submit form"');
      expect(result.html).toContain('placeholder="Email"');

      // Text content preserved
      expect(result.html).toContain('Dashboard');
      expect(result.html).toContain('Sign In');

      // Sensitive data redacted
      expect(result.html).not.toContain('user@company.com');
      expect(result.html).not.toContain('hunter2');

      // URLs reduced to domains
      expect(result.html).toContain('action="api.example.com"');

      // Event handlers stripped
      expect(result.html).not.toContain('onsubmit');

      expect(result.stats.elementsRemoved).toBeGreaterThanOrEqual(2);
      expect(result.stats.patternsRedacted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty HTML', () => {
      const result = redactHtml('');
      expect(result.html).toBeDefined();
      expect(result.stats.elementsRemoved).toBe(0);
    });

    it('handles HTML with no body', () => {
      const result = redactHtml('<div>Hello</div>');
      expect(result.html).toContain('Hello');
    });

    it('handles multiple sensitive values in same text node', () => {
      const html = '<html><body><span>Contact: user@example.com or admin@example.com</span></body></html>';
      const result = redactHtml(html);
      expect(result.html).not.toContain('user@example.com');
      expect(result.html).not.toContain('admin@example.com');
      expect(result.stats.patternsRedacted).toBeGreaterThanOrEqual(2);
    });

    it('does not double-count stats when running multiple times', () => {
      const html = '<html><body><span>user@example.com</span></body></html>';
      const result1 = redactHtml(html);
      const result2 = redactHtml(html);
      expect(result1.stats.patternsRedacted).toBe(result2.stats.patternsRedacted);
    });
  });
});
