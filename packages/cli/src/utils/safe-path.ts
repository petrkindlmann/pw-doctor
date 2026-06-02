import path from 'node:path';
import fs from 'node:fs';

export function resolveProjectPath(
  projectRoot: string,
  relativePath: string,
): string {
  const resolved = path.resolve(projectRoot, relativePath);
  assertWithinRoot(projectRoot, relativePath);
  return resolved;
}

/**
 * Canonicalize a path that may not exist yet: realpath the deepest existing
 * ancestor (resolving symlinks), then re-append the not-yet-created tail. This
 * lets us verify a *write target* lives inside the root without being fooled by
 * a symlinked directory in the chain.
 */
function canonicalize(target: string): string {
  let current = target;
  const tail: string[] = [];
  // Walk up until we hit a path that exists, recording the missing tail.
  // Bounded by filesystem depth; the parent of '/' is '/' so this terminates.
  for (let i = 0; i < 4096; i++) {
    try {
      const real = fs.realpathSync.native(current);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break; // reached the root, nothing existed
      tail.push(path.basename(current));
      current = parent;
    }
  }
  return path.resolve(target);
}

export function assertWithinRoot(
  projectRoot: string,
  filePath: string,
): void {
  const resolvedInput = path.resolve(projectRoot, filePath);
  // Canonicalize BOTH the root and the target so a symlinked file/dir cannot
  // escape the root via a path that string-prefixes correctly but resolves out.
  const normalizedRoot = canonicalize(path.resolve(projectRoot));
  const resolved = canonicalize(resolvedInput);

  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(
      `Path "${filePath}" resolves to "${resolved}" which is outside project root "${normalizedRoot}"`,
    );
  }
}

export function safeWriteFile(
  projectRoot: string,
  filePath: string,
  content: string,
): void {
  const resolved = resolveProjectPath(projectRoot, filePath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(resolved, content, { mode: 0o600 });
}

export function safeReadFile(
  projectRoot: string,
  filePath: string,
): string {
  const resolved = resolveProjectPath(projectRoot, filePath);
  return fs.readFileSync(resolved, 'utf-8');
}
