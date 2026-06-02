import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  assertWithinRoot,
  safeWriteFile,
} from '../../src/utils/safe-path.js';

/**
 * These tests exercise the symlink-escape hardening in assertWithinRoot:
 * paths are canonicalized via realpathSync before the prefix check, so a
 * symlinked dir/file that string-prefixes the root but resolves outside it
 * is rejected.
 *
 * NOTE: os.tmpdir() is itself a symlink on macOS (/var -> /private/var), so we
 * realpath the temp dirs before using them as roots — otherwise the canonical
 * target would never prefix-match the un-canonicalized root string.
 */

const cleanups: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(dir);
  // Resolve symlinks (macOS /var -> /private/var) so the root is canonical.
  return fs.realpathSync.native(dir);
}

/** Try to create a symlink; return false if the platform forbids it. */
function trySymlink(target: string, linkPath: string, type?: string): boolean {
  try {
    fs.symlinkSync(target, linkPath, type as fs.symlink.Type | undefined);
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  while (cleanups.length) {
    const dir = cleanups.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('assertWithinRoot symlink hardening', () => {
  it('allows a normal file inside the root', () => {
    const root = makeTempDir('pw-doctor-sp-ok-');
    fs.writeFileSync(path.join(root, 'real.ts'), '');
    expect(() => assertWithinRoot(root, 'real.ts')).not.toThrow();
    expect(() => assertWithinRoot(root, 'src/nested/file.ts')).not.toThrow();
  });

  it('rejects ../ traversal escaping the root', () => {
    const root = makeTempDir('pw-doctor-sp-trav-');
    expect(() => assertWithinRoot(root, '../../../etc/passwd')).toThrow(
      'outside project root',
    );
  });

  it('rejects a path through a symlinked DIRECTORY that escapes the root', () => {
    const root = makeTempDir('pw-doctor-sp-dir-');
    const outside = makeTempDir('pw-doctor-sp-outside-');
    // A real secret file living outside the root, reachable only via the link.
    fs.writeFileSync(path.join(outside, 'evil.ts'), 'secret');

    const made = trySymlink(outside, path.join(root, 'link'), 'dir');
    if (!made) {
      // Platform refused symlink creation — skip rather than false-fail.
      return;
    }

    // 'link' string-prefixes the root, but resolves to the outside dir.
    expect(() => assertWithinRoot(root, 'link/evil.ts')).toThrow(
      'outside project root',
    );
  });

  it('rejects a symlinked FILE that escapes the root', () => {
    const root = makeTempDir('pw-doctor-sp-file-');
    const outside = makeTempDir('pw-doctor-sp-outside-file-');
    const realTarget = path.join(outside, 'real.ts');
    fs.writeFileSync(realTarget, 'secret');

    const made = trySymlink(realTarget, path.join(root, 'escape.ts'), 'file');
    if (!made) {
      return;
    }

    expect(() => assertWithinRoot(root, 'escape.ts')).toThrow(
      'outside project root',
    );
  });

  it('allows a not-yet-existing file under a real (non-symlinked) subdir', () => {
    const root = makeTempDir('pw-doctor-sp-missing-');
    // Real subdir exists; the leaf file does not yet exist.
    fs.mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
    expect(() =>
      assertWithinRoot(root, 'src/deep/not-created-yet.ts'),
    ).not.toThrow();
    // Even an entirely missing subtree under the real root is allowed.
    expect(() =>
      assertWithinRoot(root, 'brand/new/tree/file.ts'),
    ).not.toThrow();
  });
});

describe('safeWriteFile', () => {
  it('writes a file inside the root with mode 0o600', () => {
    const root = makeTempDir('pw-doctor-sp-write-');
    safeWriteFile(root, 'out/result.ts', 'hello');

    const written = path.join(root, 'out', 'result.ts');
    expect(fs.readFileSync(written, 'utf-8')).toBe('hello');

    const mode = fs.statSync(written).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('rejects writing to an out-of-root target', () => {
    const root = makeTempDir('pw-doctor-sp-write-bad-');
    expect(() => safeWriteFile(root, '../escape.ts', 'nope')).toThrow(
      'outside project root',
    );
    // The escaping file must not have been created.
    expect(fs.existsSync(path.join(path.dirname(root), 'escape.ts'))).toBe(
      false,
    );
  });
});
