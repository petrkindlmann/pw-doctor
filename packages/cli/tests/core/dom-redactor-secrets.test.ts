import { describe, it, expect } from 'vitest';
import { redactHtml } from '../../src/core/dom-redactor.js';
import { REDACT_SENSITIVE_PATTERNS } from '@pw-doctor/shared';

/**
 * Covers the expanded secret-redaction surface in dom-redactor.ts and the
 * shared REDACT_SENSITIVE_PATTERNS catalogue. Default preset is 'moderate'.
 * Each sensitive value is embedded in visible text (or a non-stripped attribute
 * value) and must be replaced with [REDACTED] before the DOM could leave the box.
 */
describe('dom-redactor secret patterns (moderate default)', () => {
  describe('shared REDACT_SENSITIVE_PATTERNS catalogue', () => {
    it('exports a non-empty array of global RegExps', () => {
      expect(Array.isArray(REDACT_SENSITIVE_PATTERNS)).toBe(true);
      expect(REDACT_SENSITIVE_PATTERNS.length).toBeGreaterThan(0);
      // Every pattern must carry /g so the redactor's match-counting works and
      // multiple hits in one node are all replaced.
      for (const p of REDACT_SENSITIVE_PATTERNS) {
        expect(p).toBeInstanceOf(RegExp);
        expect(p.flags).toContain('g');
      }
    });
  });

  describe('token-shaped secrets in visible text', () => {
    // Token fixtures are assembled from parts at runtime so no complete,
    // scanner-recognizable secret literal ever lives in the source (which would
    // trip GitHub push protection). The redactor still sees the full string.
    it('redacts a GitHub token (ghp_ + 20+ chars)', () => {
      const token = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123';
      const result = redactHtml(`<html><body><span>Token: ${token}</span></body></html>`);
      expect(result.html).not.toContain(token);
      expect(result.html).toContain('[REDACTED]');
      expect(result.stats.patternsRedacted).toBeGreaterThanOrEqual(1);
    });

    it('redacts an AWS access key id (AKIA + 16 chars)', () => {
      const key = 'AKIA' + 'IOSFODNN7EXAMPLE';
      const result = redactHtml(`<html><body><span>${key}</span></body></html>`);
      expect(result.html).not.toContain(key);
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts a Google API key (AIza...)', () => {
      const key = 'AIza' + 'SyD-1234567890abcdefghijklmnop';
      const result = redactHtml(`<html><body><span>${key}</span></body></html>`);
      expect(result.html).not.toContain(key);
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts a Slack token (xoxb-...)', () => {
      const token = 'xoxb-' + '123456789012-abcdefghijklmno';
      const result = redactHtml(`<html><body><span>${token}</span></body></html>`);
      expect(result.html).not.toContain(token);
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts an Authorization Bearer token', () => {
      const result = redactHtml(
        '<html><body><span>Authorization: Bearer abcdef0123456789xyz</span></body></html>',
      );
      expect(result.html).not.toContain('abcdef0123456789xyz');
      expect(result.html).not.toContain('Bearer abcdef0123456789xyz');
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts a Set-Cookie name=value blob', () => {
      const result = redactHtml(
        '<html><body><span>Set-Cookie: sessionid=abc123def456ghi789</span></body></html>',
      );
      expect(result.html).not.toContain('abc123def456ghi789');
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts session= and csrf= name/value pairs', () => {
      const result = redactHtml(
        '<html><body><span>session=abc123def456</span> <span>csrf=tok987654321zzz</span></body></html>',
      );
      expect(result.html).not.toContain('abc123def456');
      expect(result.html).not.toContain('tok987654321zzz');
      // Both pairs should each produce a redaction.
      expect(result.stats.patternsRedacted).toBeGreaterThanOrEqual(2);
    });

    it('redacts an IPv4 address', () => {
      const result = redactHtml('<html><body><span>Server at 192.168.1.100 is down</span></body></html>');
      expect(result.html).not.toContain('192.168.1.100');
      expect(result.html).toContain('[REDACTED]');
      // Surrounding non-sensitive words survive.
      expect(result.html).toContain('Server at');
      expect(result.html).toContain('is down');
    });

    it('redacts a US SSN (123-45-6789)', () => {
      const result = redactHtml('<html><body><span>SSN 123-45-6789 on file</span></body></html>');
      expect(result.html).not.toContain('123-45-6789');
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts a credit-card-shaped digit group (4111 1111 1111 1111)', () => {
      const result = redactHtml('<html><body><span>Card 4111 1111 1111 1111 charged</span></body></html>');
      // None of the card digit groups should survive.
      expect(result.html).not.toContain('4111 1111 1111 1111');
      expect(result.html).not.toContain('4111');
      expect(result.html).toContain('[REDACTED]');
    });

    it('redacts an email address (sanity — already covered pattern)', () => {
      const result = redactHtml('<html><body><span>Reach us at user@example.com today</span></body></html>');
      expect(result.html).not.toContain('user@example.com');
      expect(result.html).toContain('[REDACTED]');
    });
  });

  describe('input value redaction by type', () => {
    it('redacts a hidden input value (not just password inputs)', () => {
      const result = redactHtml(
        '<html><body><input type="hidden" value="csrf-secret-token-value"></body></html>',
      );
      expect(result.html).not.toContain('csrf-secret-token-value');
      expect(result.html).toContain('value="[REDACTED]"');
    });

    it('keeps a value-safe input value (checkbox)', () => {
      const result = redactHtml(
        '<html><body><input type="checkbox" value="agree"></body></html>',
      );
      expect(result.html).toContain('value="agree"');
      expect(result.html).not.toContain('[REDACTED]');
    });
  });

  describe('URL query params in visible text', () => {
    it('strips the query string so tokens do not survive', () => {
      const result = redactHtml(
        '<html><body><span>https://x.com/cb?token=abc&email=a@b.com</span></body></html>',
      );
      // The token (and the whole query string) must be gone.
      expect(result.html).not.toContain('token=abc');
      expect(result.html).not.toContain('a@b.com');
      // Query string is reduced to a redacted placeholder.
      expect(result.html).toContain('[REDACTED]');
    });
  });

  describe('email inside a generic data attribute', () => {
    it('redacts an email in data-foo (not href/src/action) in moderate mode', () => {
      const result = redactHtml(
        '<html><body><div data-foo="x@y.com">hi</div></body></html>',
      );
      expect(result.html).not.toContain('x@y.com');
      expect(result.html).toContain('data-foo="[REDACTED]"');
    });
  });

  describe('customPatterns as RegExp source strings', () => {
    it('compiles a string pattern and redacts matches', () => {
      const result = redactHtml(
        '<html><body><span>code secret123 here</span></body></html>',
        { customPatterns: ['secret\\d+'] },
      );
      expect(result.html).not.toContain('secret123');
      expect(result.html).toContain('[REDACTED]');
    });

    it('silently ignores an uncompilable string pattern (no throw)', () => {
      let result: ReturnType<typeof redactHtml> | undefined;
      expect(() => {
        result = redactHtml(
          '<html><body><span>hello world</span></body></html>',
          { customPatterns: ['('] },
        );
      }).not.toThrow();
      // The bad pattern is dropped; benign text is left untouched.
      expect(result!.html).toContain('hello world');
    });
  });
});
