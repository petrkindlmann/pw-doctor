import { describe, it, expect } from 'vitest';
import { renderUnifiedDiff } from '../../src/utils/diff.js';

const FILE = 'tests/example.spec.ts';

describe('renderUnifiedDiff', () => {
  it('renders headers, a hunk, and -/+ lines for a one-line change', () => {
    const before = 'line one\nold content\nline three';
    const after = 'line one\nnew content\nline three';
    const out = renderUnifiedDiff(before, after, { filePath: FILE, color: false });

    expect(out).toContain(`--- a/${FILE}`);
    expect(out).toContain(`+++ b/${FILE}`);
    expect(out).toMatch(/^@@ .* @@$/m);
    expect(out).toContain('-old content');
    expect(out).toContain('+new content');
  });

  it('reports "(no changes)" for identical before/after', () => {
    const text = 'unchanged\ncontent\nhere';
    const out = renderUnifiedDiff(text, text, { filePath: FILE, color: false });

    expect(out).toContain('(no changes)');
    expect(out).not.toContain('@@');
    // No content diff lines (a single +/-, distinct from the +++/--- headers).
    const lines = out.split('\n');
    expect(lines.some((l) => /^[+-](?![+-])/.test(l))).toBe(false);
  });

  it('includes one unchanged line above and below with context:1', () => {
    const before = 'top\nabove\nold\nbelow\nbottom';
    const after = 'top\nabove\nnew\nbelow\nbottom';
    const out = renderUnifiedDiff(before, after, {
      filePath: FILE,
      context: 1,
      color: false,
    });

    const lines = out.split('\n');
    // Context lines are prefixed with a single leading space.
    expect(lines).toContain(' above');
    expect(lines).toContain(' below');
    // The change itself.
    expect(lines).toContain('-old');
    expect(lines).toContain('+new');
    // context:1 should NOT pull in lines two away from the change.
    expect(lines).not.toContain(' top');
    expect(lines).not.toContain(' bottom');
  });

  it('removed line holds the old selector and added line holds the new selector', () => {
    const before = 'await page.locator("#a").click();';
    const after = 'await page.getByRole("button").click();';
    const out = renderUnifiedDiff(before, after, { filePath: FILE, color: false });

    const lines = out.split('\n');
    // Match content diff lines (single +/-), not the +++/--- file headers.
    const removed = lines.find((l) => /^-(?!-)/.test(l));
    const added = lines.find((l) => /^\+(?!\+)/.test(l));

    expect(removed).toBeDefined();
    expect(added).toBeDefined();
    expect(removed).toContain('page.locator("#a")');
    expect(added).toContain('page.getByRole("button")');
  });

  it('emits no ANSI escape codes when color:false', () => {
    const before = 'line one\nold content\nline three';
    const after = 'line one\nnew content\nline three';
    const out = renderUnifiedDiff(before, after, { filePath: FILE, color: false });

    expect(out).not.toContain('\x1b[');
    expect(out).not.toMatch(/\x1b\[[0-9;]*m/);
  });
});
