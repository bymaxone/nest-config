# Contributing to @bymax-one/nest-config

Thank you for your interest in contributing! This document describes the
workflow and quality gates for this library. By participating, you agree to
abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting security issues

**Do not open public issues for security vulnerabilities.** Follow the private
reporting process described in [SECURITY.md](./SECURITY.md).

## Prerequisites

- Node.js >= 24
- pnpm 10.8.1 (`corepack enable`)

## Getting started

```bash
pnpm install
pnpm build
```

## Development workflow

This is a published npm library, not an application. Keep `dependencies`
empty; everything ships as a `peerDependency` or a `node:` builtin.

1. Create a branch from `main`.
2. Make your change; add or update co-located `*.spec.ts` tests (100% coverage
   is a hard gate, not a target).
3. Run the full verification suite before opening a PR.

## Verification, run before every PR

```bash
pnpm typecheck && pnpm lint && pnpm test:cov:all && pnpm build && pnpm size
```

All of the following must pass:

- **Typecheck**: `tsc --noEmit` (strict, zero errors)
- **Lint**: ESLint (zero `any`, import order, security rules)
- **Coverage**: 100% statements / branches / functions / lines
- **Build**: tsup produces ESM + CJS + `.d.ts` for every subpath
- **Size**: every subpath stays within the budget in `scripts/check-size.mjs`

Mutation testing (`pnpm mutation`) is a release gate, run manually before
tagging a version, never on every PR.

## Commits, Conventional Commits

Commit messages are validated by commitlint via the `commit-msg` hook:

```
<type>(<scope>): <subject>
```

Types: `feat | fix | docs | refactor | perf | test | build | ci | chore | revert`.
The `pre-commit` hook runs lint-staged (ESLint + Prettier on staged files).

## Pull requests

- Keep PRs focused and small.
- Record user-facing changes under the `Unreleased` section of `CHANGELOG.md`.
- All active CI checks must be green. The `ci` workflow runs on every pull
  request; the `codeql` and `scorecard` security workflows activate once the
  repository is public.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).

---

## Releasing

Publishing is driven entirely from CI through the `release.yml` workflow, which
uses npm OIDC trusted publishing (no long-lived npm token) and attaches build
provenance. Provenance and the security workflows (CodeQL, Scorecard, dependency review)
require a public repository; this repository is public, so those jobs run.

Go-live is a deliberate, manual sequence performed by a maintainer:

1. **Verify the gates locally.** `pnpm mutation`, `pnpm prepublishOnly`,
   `pnpm build && pnpm test:e2e`, and `pnpm publish --dry-run` (confirm the
   tarball packs only `dist/`, `LICENSE`, `README.md`, and `CHANGELOG.md`).

   The release bar for mutation is **100%, or every survivor a documented,
   re-verified equivalent** — not a percentage. `break: 95` in
   `stryker.config.json` is the floor CI enforces on a branch; it is not what
   clears a release.

   A survivor qualifies only if `docs/mutation_testing_results.md` argues why no
   test can observe a behavioural difference, and that argument was checked by
   **running the mutant**, not by reading it. A survivor that is merely plausible
   blocks the release like any other.

   The distinction matters because the alternative readings are both worse. A
   literal 100% would eventually force disabling a killable mutant to reach a
   number, which this repository forbids and the results doc records as a
   standing rule. A lower percentage would tolerate a real coverage gap, which is
   exactly what the gate exists to catch.

2. **Confirm the version.** `package.json` `version` and the top dated
   `CHANGELOG.md` heading must both read the version being released.
3. **Confirm the repository is public.** Provenance publishing and the CodeQL,
   Scorecard and dependency-review gates all require it. It is public today; this
   step exists so a repository that was made private for any reason is not tagged
   for release while those jobs cannot run.
4. **Tag from `main`.** Push an annotated `vX.Y.Z` tag matching the manifest
   version. The tag push triggers `release.yml`, which verifies the tag against
   `package.json`, re-runs the release gates, and publishes with provenance.
5. **Post-publish smoke.** In a scratch directory outside the repository, install
   the freshly published version alongside the NestJS 11 peers and boot a minimal
   fixture to confirm the shipped artifact resolves and starts.
