# Contributing

## Setup

```bash
git clone https://github.com/petr-kin/pw-doctor.git
cd pw-doctor
npm install
npm run build
```

## Running tests

```bash
cd packages/cli
npx vitest run
```

417 tests across 43 test files.

## Project structure

Turborepo monorepo with two packages:

- `packages/cli` — The CLI tool (published as `pw-doctor` on npm)
- `packages/shared` — Shared types and constants

```
packages/cli/src/
  bin/          CLI entry point
  commands/     init, check, heal, watch, report, calibrate, credentials
  core/         selector-extractor, fragility-scorer, ast-patcher, test-runner, dom-analyzer
  repair/       text-match, attribute-match, structural-match, anchor-match, candidate-ranker
  ai/           anthropic-adapter, openai-adapter, prompt-builder, consent-gate, audit-logger
  reporter/     Playwright reporter + fixture
  config/       cosmiconfig loader + schema
  utils/        safe-exec, safe-path, error-sanitizer, hash
```

## Code conventions

- TypeScript strict mode, ESM
- Zod for validation
- AST patching via recast + @babel/parser (never regex)
- `execFile` only (never `exec`)
- All file paths canonicalized and verified within project root

## Pull requests

1. Fork and create a feature branch
2. Write tests first
3. Run `npx vitest run` — all tests must pass
4. Keep commits focused and well-described
