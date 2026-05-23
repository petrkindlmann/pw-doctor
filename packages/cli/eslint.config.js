// packages/cli/eslint.config.js
// Minimal, security-focused flat config. Style rules deliberately omitted
// to avoid introducing a large lint backlog. Add rules incrementally.
import tseslint from 'typescript-eslint';
import securityPlugin from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.tsbuildinfo'],
  },
  {
    files: ['**/*.ts'],
    plugins: { security: securityPlugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      // Security non-negotiables (see SECURITY.md control catalogue).
      // C1.2: no shell-string subprocess execution.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:child_process',
              importNames: ['exec', 'execSync'],
              message: 'Use execFile / execFileSync from src/utils/safe-exec.ts (C1.2).',
            },
            {
              name: 'child_process',
              importNames: ['exec', 'execSync'],
              message: 'Use execFile / execFileSync from src/utils/safe-exec.ts (C1.2).',
            },
          ],
        },
      ],
      // C1.1: no dynamic code evaluation.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // eslint-plugin-security highlights (others disabled for noise).
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-pseudoRandomBytes': 'error',

      // Drop these to 'warn' once the existing backlog is addressed.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // Tests get a lighter ruleset (fixtures often need permissive patterns).
    files: ['tests/**/*.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
);
