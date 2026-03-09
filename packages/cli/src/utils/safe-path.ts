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

export function assertWithinRoot(
  projectRoot: string,
  filePath: string,
): void {
  const resolved = path.resolve(projectRoot, filePath);
  const normalizedRoot = path.resolve(projectRoot);

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
