# Contributing

## Setup

```bash
git clone https://github.com/petrkindlmann/pw-doctor.git
cd pw-doctor
npm install
npm run build
```

Requires Node ≥ 20.

## Running tests

```bash
cd packages/cli
npx vitest run        # 417 tests across 43 files
npx vitest            # watch mode
npx tsc --noEmit      # typecheck
```

## Project layout

Turborepo monorepo, two packages:

- `packages/cli` — the `pw-doctor` CLI (published to npm)
- `packages/shared` — shared types and Zod schemas

```
packages/cli/src/
  bin/          CLI entry (commander)
  commands/     init check heal watch report calibrate credentials
  core/         selector extraction, AST patching, DOM analysis & redaction
  repair/       attribute, text, structural, anchor strategies + pipeline
  ai/           provider-agnostic adapter (Anthropic, OpenAI) + safety gates
  reporter/     Playwright reporter + fixture (captures DOM on failure)
  config/       cosmiconfig loader + schema
  report/       terminal & JSON output renderers
  utils/        safe-exec, safe-path, error-sanitizer, hash, gitleaks-hook
```

Full architecture: [CLAUDE.md](CLAUDE.md).

## Conventions

- TypeScript strict, ESM
- Zod for every external boundary (config, AI response, file content)
- AST patching via `recast` + `@babel/parser` — **never regex** on selectors
- `execFile` only — **never `exec`** or string-interpolated shells
- Canonicalize every path and verify it lives inside the project root before any write
- Secrets via env vars only (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)

The full non-negotiable list is in [CLAUDE.md](CLAUDE.md#non-negotiable-rules). Skim it before touching `src/ai/`, `src/core/ast-patcher.ts`, or anything in `src/utils/safe-*`.

## Pull requests

1. Fork, branch from `main`.
2. Add or update tests in `packages/cli/tests/` alongside the change.
3. `npx vitest run` and `npx tsc --noEmit` must be clean.
4. One logical change per PR; descriptive commit body.
5. If the change touches a security control, call it out explicitly in the PR body.

## Reporting bugs

Open an issue: <https://github.com/petrkindlmann/pw-doctor/issues>. Include the Playwright version, Node version, and (if possible) a redacted snippet of the failing selector + DOM.
