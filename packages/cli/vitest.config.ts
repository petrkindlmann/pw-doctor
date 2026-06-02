import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Resolve @pw-doctor/shared directly to the workspace source so tests run on a
  // clean checkout regardless of whether npm linked the workspace symlink into
  // node_modules (CI installs do not always create it). Mirrors the `paths`
  // mapping in tsconfig.json. The published runtime never sees this — shared is
  // bundled into dist at build time via scripts/bundle-shared.mjs.
  resolve: {
    alias: {
      '@pw-doctor/shared': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/fixtures/**'],
  },
});
