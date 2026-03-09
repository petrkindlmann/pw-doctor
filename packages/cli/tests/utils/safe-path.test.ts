import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { assertWithinRoot, resolveProjectPath } from '../../src/utils/safe-path.js';

describe('safe-path', () => {
  const root = '/Users/test/project';

  it('allows paths within project root', () => {
    expect(() => assertWithinRoot(root, 'src/test.ts')).not.toThrow();
  });

  it('allows nested paths within project root', () => {
    expect(() =>
      assertWithinRoot(root, 'tests/deep/nested/file.ts'),
    ).not.toThrow();
  });

  it('rejects path traversal with ../', () => {
    expect(() => assertWithinRoot(root, '../../../etc/passwd')).toThrow(
      'outside project root',
    );
  });

  it('rejects absolute paths outside root', () => {
    expect(() => assertWithinRoot(root, '/etc/passwd')).toThrow(
      'outside project root',
    );
  });

  it('resolves clean path within root', () => {
    const result = resolveProjectPath(root, 'src/./utils/../test.ts');
    expect(result).toBe(path.join(root, 'src/test.ts'));
  });
});
