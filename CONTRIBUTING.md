# Contributing to Michigatari

Thanks for wanting to help!

## Contributor License Agreement

**By opening a pull request you agree to the [CLA](CLA.md).** In short: the
project is AGPL-3.0 and stays that way, but the maintainer also ships a
commercial build, so contributions are licensed to the maintainer in a way
that lets them appear in both. If you can't agree to that, please open an
issue describing the change instead of a PR.

## Development setup

Requires Node 22+ (see `.nvmrc`).

    npm install
    npm run dev    # the editor
    npm test       # unit tests (vitest)
    npm run lint   # oxlint
    npm run build  # typecheck + production build

## Guidelines

- TypeScript throughout. The engine (`src/engine/`) is pure — no React, no DOM,
  no MapLibre imports. Keep it that way.
- Match the existing style; the codebase favors small focused modules.
- Non-trivial logic gets a vitest unit test next to it (`*.test.ts`).
- CI runs lint, tests, and build on every PR — all three must pass.
- Design docs and plans live in `docs/superpowers/` if you want context on why
  things are built the way they are.
