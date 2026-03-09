import fs from 'node:fs';
import path from 'node:path';

export function findTestFiles(dir: string, pattern: string): string[] {
  const files: string[] = [];
  const matchSuffix = pattern.includes('.spec.ts')
    ? '.spec.ts'
    : pattern.includes('.test.ts')
      ? '.test.ts'
      : '.spec.ts';

  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules'
      ) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(matchSuffix)) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}
