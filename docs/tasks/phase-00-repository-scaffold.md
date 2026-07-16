# Phase 0: repository-scaffold

> **Status**: 🔄 In Progress · **Progress**: 5 / 6 tasks · **Last updated**: 2026-07-16
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P0)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §3, §9, §10, §11

---

## Context

This phase stands up the complete repository toolchain for `@bymax-one/nest-config` so that every later phase lands on green gates from its first commit. It delivers the `package.json` with the two-subpath exports map (`.` and `./testing`), the TypeScript and tsup build configuration, lint and format tooling, both jest configs with the 100% coverage threshold, the Stryker configuration, local commit governance (husky, commitlint, lint-staged), the community and security files, the quality scripts (`check-size.mjs`, `dogfood-smoke-test.mjs`), and the four GitHub workflows. CI is front-loaded here on purpose: every pull request from this phase onward, including this phase's own PR, runs the full gate.

At the start of this phase the repository contains only `docs/` and an empty `main` branch history. The proven layout of the sibling library `@bymax-one/nest-logger` (available locally at `../nest-logger`) is the reference: configuration is copied and adapted, never invented.

---

## Rules-of-phase

1. **Copy from the sibling, adapt, never invent.** Every config file starts from the `nest-logger` equivalent; adapt names, subpaths, and peers to this package.
2. **Two subpaths exactly**: `.` (server) and `./testing`. No `./shared`, no client subpaths.
3. **`dependencies` stays `{}`.** Peers: `@nestjs/common ^11`, `@nestjs/core ^11`, `reflect-metadata ^0.2`, `zod ^4`, all required (none optional), mirrored in `devDependencies`.
4. **Both jest configs enforce 100%** line, branch, function, and statement coverage from day one, with `passWithNoTests: true` until the first spec lands, and `maxWorkers: '50%'`.
5. **CI from the start.** `.github/workflows/ci.yml` runs lint, typecheck, build, and tests on every push and pull request. `codeql.yml` and `scorecard.yml` are committed now and activate when the repository goes public. `release.yml` stays tag-driven and inert.
6. **English-only, timeless content.** No plan-stage or task references in any committed file.
7. **No `.gitkeep`** or empty-directory placeholders anywhere.
8. **Conventional Commits** with scope `config`: `<type>(config): <subject> (0.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line to commits, PR titles, PR bodies, or comments.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P0: repository-scaffold" (scope, DoD) and §4 "Global Conventions".
- [`../technical_specification.md`](../technical_specification.md) §3.1 (directory tree), §3.2 (subpath exports), §9 (dependencies and packaging), §10 (quality gates), §11 (repository standard).
- Sibling reference layout: `/Users/maximiliano/Documents/MyApps/bymax-one/nest-logger` (copy sources for each config file are listed per task).

---

## Task index

| ID  | Task                                                                                                                                                   | Status  | Priority | Size | Depends on              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------- | ---- | ----------------------- |
| 0.1 | Branch + `package.json` + pnpm install                                                                                                                 | ✅ Done | P0       | S    | none                    |
| 0.2 | Build config: tsconfig set + `tsup.config.ts` + placeholder barrels                                                                                    | ✅ Done | P0       | S    | 0.1                     |
| 0.3 | Quality tooling: ESLint flat config, Prettier, jest configs, Stryker                                                                                   | ✅ Done | P0       | M    | 0.2                     |
| 0.4 | Governance and community files: husky, commitlint, lint-staged, LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, README skeleton           | ✅ Done | P0       | M    | 0.1                     |
| 0.5 | Scripts and workflows: `check-size.mjs`, `dogfood-smoke-test.mjs`, `ci.yml`, `codeql.yml`, `scorecard.yml`, `release.yml`, dependabot, issue templates | ✅ Done | P0       | L    | 0.2, 0.3                |
| 0.6 | Phase close: full-gate verification, dashboards, PR with Copilot review                                                                                | 📋 ToDo | P0       | S    | 0.1, 0.2, 0.3, 0.4, 0.5 |

---

## Tasks

### Task 0.1: Branch + `package.json` + pnpm install

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: none

#### Description

Create the phase working branch, author `package.json` under the `@bymax-one` scope with the two-subpath exports map, canonical scripts, required peers, and `"dependencies": {}`, then install.

#### Acceptance criteria

- [x] Working branch `feat/phase-00-repository-scaffold` created with `git switch -c`.
- [x] `package.json` declares `"name": "@bymax-one/nest-config"`, `"version": "0.1.0"`, `"type": "module"`, `"sideEffects": false`, `"files": ["dist", "LICENSE", "README.md", "CHANGELOG.md"]`, `"engines": { "node": ">=24.0.0" }`, `publishConfig` public npm.
- [x] `exports` declares exactly `.` and `./testing`, each with `types` / `import` / `require` entries pointing into `dist/`.
- [x] `"dependencies": {}`; peers `@nestjs/common ^11`, `@nestjs/core ^11`, `reflect-metadata ^0.2`, `zod ^4` all required, mirrored in `devDependencies`.
- [x] Canonical scripts present (`build`, `typecheck`, `lint`, `lint:fix`, `test`, `test:cov`, `test:cov:all`, `mutation`, `size`, `dogfood`, `clean`, `prepublishOnly`, `prepare`).
- [x] `pnpm install` completes with no missing-peer warnings and generates `pnpm-lock.yaml`.

#### Files to create / modify

- `package.json`
- `pnpm-lock.yaml` (generated)
- `.gitignore`, `.npmrc` (engine-strict)

#### Agent prompt

```
You are a senior NestJS library release engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, a public npm package giving NestJS 11 applications a single,
typed, validated entry point for environment configuration: Zod v4 schema validation of
process.env exactly once at bootstrap, fail-fast aggregated error reporting that never echoes
values, and a deep-frozen typed config object via DI. Two subpaths: "." (server) and "./testing".
Zero direct dependencies; everything is a peer. Mirrors the conventions of the sibling
@bymax-one/nest-logger.

CURRENT PHASE: 0 (repository-scaffold), Task 0.1 of 6 (FIRST)

PRECONDITIONS
- The repository contains only docs/ and has an empty main history.
- The sibling reference exists locally at ../nest-logger (relative to the repo root's parent).

REQUIRED READING (only these, do not load more):
- docs/technical_specification.md §3.2 "Subpath Exports" and §9 "Dependencies and Packaging".
- ../nest-logger/package.json (reference for scripts, devDependencies versions, packageManager).

TASK
Create the phase branch, author package.json, .gitignore, and .npmrc, and install dependencies.

DELIVERABLES
1. Create the branch first: `git switch -c feat/phase-00-repository-scaffold` (never use
   `git checkout -b`).
2. `package.json`: name @bymax-one/nest-config, version 0.1.0, type module, sideEffects false,
   files ["dist", "LICENSE", "README.md", "CHANGELOG.md"], engines.node >=24.0.0, publishConfig
   { "access": "public", "registry": "https://registry.npmjs.org/" }. Exports map with exactly
   two subpaths: "." -> dist/index.{d.ts,mjs,cjs} and "./testing" ->
   dist/testing/index.{d.ts,mjs,cjs} (types/import/require order). dependencies {}. peers:
   @nestjs/common ^11.0.0, @nestjs/core ^11.0.0, reflect-metadata ^0.2.0, zod ^4.0.0, all
   required (no peerDependenciesMeta optional flags), mirrored in devDependencies. Copy the
   dev toolchain versions, canonical scripts, and packageManager field from
   ../nest-logger/package.json, adapting script targets to this package (no bench scripts).
3. `.gitignore` copied from ../nest-logger/.gitignore.
4. `.npmrc` with `engine-strict=true` only (no registry mappings, no tokens).
5. Run `pnpm install`; confirm pnpm-lock.yaml is generated cleanly.

Constraints:
- dependencies stays {} (zero direct deps).
- Copy version ranges from the sibling; do not invent versions from memory.
- English-only content; timeless (no phase/task references inside committed files).
- No .gitkeep or empty-directory placeholders. No em dashes anywhere.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `git branch --show-current` expected: feat/phase-00-repository-scaffold.
- `pnpm install` expected: completes with no missing-peer warnings.
- `node -e "const p=require('./package.json'); if(Object.keys(p.dependencies||{}).length) throw new Error('deps not empty')"` expected: no throw.
- `node -e "const p=require('./package.json'); if(!p.exports['./testing']) throw new Error('missing testing subpath')"` expected: no throw.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-00-repository-scaffold.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 6) in the header blockquote.
4. Append a Completion log entry: `- 0.1 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P0 row in docs/development_plan.md §1 (Status, Progress, Last Updated) and the
   folder index in docs/tasks/README.md.
6. Commit: `feat(config): scaffold package.json and workspace hygiene (0.1)`.
```

---

### Task 0.2: Build config: tsconfig set + `tsup.config.ts` + placeholder barrels

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: 0.1

#### Description

Copy the tsconfig family from `nest-logger`, adapt path aliases to the two subpaths of this package, author `tsup.config.ts` with two entries, and add placeholder barrels so `typecheck` and `build` run green.

#### Acceptance criteria

- [x] tsconfig set present (base + build + jest variants matching the sibling layout), strict flags on (`noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, target ES2022).
- [x] Path aliases declare exactly `@bymax-one/nest-config` -> `./src/index.ts` and `@bymax-one/nest-config/testing` -> `./src/testing/index.ts`.
- [x] `tsup.config.ts` has two entries (`src/index.ts`, `src/testing/index.ts`), formats ESM + CJS, `dts: true`, `minify: false`, `target: node24`, externals `/^@nestjs\//`, `reflect-metadata`, `zod`.
- [x] `src/index.ts` and `src/testing/index.ts` exist as `export {}` placeholders with `@fileoverview` headers.
- [x] `pnpm typecheck` and `pnpm build` pass; `dist/` contains `.mjs`, `.cjs`, and declarations for both entries.

#### Files to create / modify

- `tsconfig.json` and variants, `tsup.config.ts`
- `src/index.ts`, `src/testing/index.ts`

#### Agent prompt

```
You are a senior NestJS library build engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11 (Zod v4,
fail-fast aggregated validation, frozen config via DI). Two subpaths: "." and "./testing".
Zero direct dependencies. Sibling reference: @bymax-one/nest-logger.

CURRENT PHASE: 0 (repository-scaffold), Task 0.2 of 6

PRECONDITIONS
- Task 0.1 done: package.json exists, pnpm install has run, branch
  feat/phase-00-repository-scaffold is checked out.

REQUIRED READING (only these):
- ../nest-logger tsconfig*.json and tsup.config.ts (copy sources).
- docs/technical_specification.md §9.2 "Build".

TASK
Create the TypeScript and tsup build configuration adapted to the two subpaths, plus placeholder
source barrels, and prove typecheck and build are green.

DELIVERABLES
1. tsconfig set copied from the sibling and adapted: aliases exactly
   "@bymax-one/nest-config" -> ./src/index.ts and "@bymax-one/nest-config/testing" ->
   ./src/testing/index.ts. Keep strict compiler options (ES2022, noUncheckedIndexedAccess,
   exactOptionalPropertyTypes). Remove aliases and includes for subpaths this package does not
   have.
2. tsup.config.ts: entries { index: 'src/index.ts', 'testing/index': 'src/testing/index.ts' },
   formats ['esm','cjs'], dts true, minify false (server-side lib, readable stack traces),
   target node24, treeshake true, splitting false, external [/^@nestjs\//, 'reflect-metadata',
   'zod']. No emitDecoratorMetadata anywhere in build tsconfigs (the package relies on explicit
   @Inject only).
3. src/index.ts and src/testing/index.ts: `export {}` placeholders, each with a JSDoc header
   carrying @fileoverview (one line of purpose) and @layer Module.
4. Run pnpm typecheck and pnpm build.

Constraints:
- English-only, timeless comments (no phase/task references). No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm typecheck` expected: green.
- `pnpm build` expected: dist/index.mjs, dist/index.cjs, dist/testing/index.mjs,
  dist/testing/index.cjs plus .d.ts/.d.cts emitted.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 6).
4. Append a Completion log entry: `- 0.2 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P0 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add build configuration and placeholder barrels (0.2)`.
```

---

### Task 0.3: Quality tooling: ESLint flat config, Prettier, jest configs, Stryker

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 0.2

#### Description

Port the lint, format, test, and mutation tooling from the sibling: ESLint flat config with the family's restricted-import rules (ban `dotenv`, bare `crypto`, and denied packages), Prettier, both jest configs at the 100% threshold with bounded workers, and the Stryker configuration.

#### Acceptance criteria

- [x] `eslint.config.mjs` (flat, v9) adapted from the sibling; `no-restricted-imports` bans `dotenv`, bare `crypto`, `bcrypt`, `argon2`, `uuid`, `nanoid`, `crypto-js`, `axios`, `moment`, `lodash`; `@typescript-eslint/no-explicit-any` is an error.
- [x] `.prettierrc` + `.prettierignore` present (lockfile guarded).
- [x] Both jest configs (day-to-day and `test:cov:all` release config) enforce `coverageThreshold` 100/100/100/100 and set `maxWorkers: '50%'`; `passWithNoTests` enabled until first specs land.
- [x] `stryker.config.json` present with thresholds `high: 99, low: 95, break: 95`, jest runner.
- [x] `pnpm lint` passes on the placeholder sources.

#### Files to create / modify

- `eslint.config.mjs`, `.prettierrc`, `.prettierignore`
- `jest.config.ts`, `jest.coverage.config.ts`
- `stryker.config.json`

#### Agent prompt

```
You are a senior TypeScript quality engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11 (Zod v4,
fail-fast aggregated validation, frozen config via DI). Two subpaths. Zero direct dependencies.
Sibling reference: @bymax-one/nest-logger.

CURRENT PHASE: 0 (repository-scaffold), Task 0.3 of 6

PRECONDITIONS
- Tasks 0.1 and 0.2 done: package.json, build config, and placeholder barrels exist; typecheck
  and build are green.

REQUIRED READING (only these):
- ../nest-logger eslint.config.mjs, .prettierrc, .prettierignore, jest.config.ts,
  jest.coverage.config.ts, stryker.config.json (copy sources).
- docs/development_plan.md §4 "Global Conventions" items 1, 5, 10.

TASK
Port lint, format, test, and mutation tooling, adapted to this package's file layout.

DELIVERABLES
1. eslint.config.mjs: flat config adapted from the sibling. Keep @typescript-eslint strict rules
   (no-explicit-any as error), import ordering, eslint-config-prettier last. no-restricted-imports
   must ban: dotenv, crypto (bare, forcing node:crypto), bcrypt, argon2, uuid, nanoid, crypto-js,
   axios, moment, lodash. Remove rules referencing directories this package does not have.
2. .prettierrc and .prettierignore copied (keep the lockfile ignore guard).
3. jest.config.ts (day-to-day) and jest.coverage.config.ts (release, test:cov:all): BOTH with
   coverageThreshold global 100% for lines, branches, functions, statements; maxWorkers '50%';
   passWithNoTests true (removed later when specs exist); ts-jest transform per the sibling.
4. stryker.config.json: jest runner, thresholds { high: 99, low: 95, break: 95 }, mutate
   src/**/*.ts excluding *.spec.ts and the testing barrel until implemented.
5. Run pnpm lint and fix any finding.

Constraints:
- Both jest configs MUST carry the identical 100% threshold (they drift easily; do not ship a
  weaker local gate).
- Test suites run sequentially with bounded workers; never configure or suggest parallel suite
  runs across packages.
- English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm lint` expected: green.
- `pnpm test` expected: green (passWithNoTests).
- `node -e "const c=require('./stryker.config.json'); if(c.thresholds.break!==95) throw new Error('break must be 95')"` expected: no throw.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 6).
4. Append a Completion log entry: `- 0.3 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P0 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add lint, test, and mutation tooling (0.3)`.
```

---

### Task 0.4: Governance and community files

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 0.1

#### Description

Add local commit governance (husky hooks, commitlint, lint-staged, `.gitmessage`) and the open-source baseline files: `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 by reference), `CHANGELOG.md` (Keep a Changelog), and the README skeleton with badges.

#### Acceptance criteria

- [x] `.husky/pre-commit` runs lint-staged; `.husky/commit-msg` runs commitlint; `prepare` script wires husky.
- [x] `commitlint.config.cjs` extends the conventional config; `.gitmessage` lists the package scopes.
- [x] `lint-staged` block in `package.json` runs `eslint --fix` + `prettier --write`.
- [x] `LICENSE` MIT, `SECURITY.md` with private reporting instructions, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` referencing (not transcribing) Contributor Covenant 2.1, `CHANGELOG.md` with an Unreleased section.
- [x] `README.md` skeleton: title, one-paragraph value proposition, badge row (CI, coverage, npm version, license), Installation and Quick start stubs marked as completed in a later phase by content, not by placeholder text.
- [x] A deliberately malformed commit message is rejected locally by the commit-msg hook.

#### Files to create / modify

- `.husky/pre-commit`, `.husky/commit-msg`, `commitlint.config.cjs`, `.gitmessage`
- `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `README.md`
- `package.json` (lint-staged block, prepare script)

#### Agent prompt

```
You are a senior open-source maintainer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11 (Zod v4,
fail-fast aggregated validation, frozen config via DI). Public npm package under the MIT
license. Sibling reference: @bymax-one/nest-logger.

CURRENT PHASE: 0 (repository-scaffold), Task 0.4 of 6

PRECONDITIONS
- Task 0.1 done: package.json exists and pnpm install has run.

REQUIRED READING (only these):
- ../nest-logger: .husky/, commitlint.config.cjs, .gitmessage, LICENSE, SECURITY.md,
  CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, and the README.md header/badges block
  (copy sources; adapt names and scopes).
- docs/technical_specification.md §11 "Repository Standard".

TASK
Port the commit governance and the community/security file set, adapted to this package.

DELIVERABLES
1. Husky + commitlint + lint-staged exactly as in the sibling: .husky/pre-commit (lint-staged),
   .husky/commit-msg (commitlint --edit), commitlint.config.cjs extending
   @commitlint/config-conventional, lint-staged block in package.json (eslint --fix,
   prettier --write), prepare script running husky, .gitmessage listing this package's commit
   scopes (config, docs, ci, deps, release).
2. LICENSE (MIT, current year, Bymax One), SECURITY.md (private vulnerability reporting via
   GitHub security advisories), CONTRIBUTING.md (dev setup, quality gates, Conventional
   Commits), CODE_OF_CONDUCT.md referencing Contributor Covenant 2.1 by link (never transcribe
   the full text), CHANGELOG.md in Keep a Changelog format with an Unreleased section.
3. README.md skeleton: package title, one-paragraph description (typed env validation for
   NestJS, fail-fast, value-free errors, frozen config), badge row (CI workflow, coverage, npm
   version, license), and section headings for Installation, Quick start, API, Error catalog,
   Testing, License. Real content for API sections arrives in a later phase; keep the headings
   with concise one-line summaries, never "TODO" markers.
4. Verify the commit-msg hook rejects a malformed message (e.g. "wip") locally, then discard
   that test commit.

Constraints:
- CODE_OF_CONDUCT.md is by reference only.
- English-only, timeless content. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `echo "wip" | pnpm exec commitlint` expected: fails.
- `pnpm exec commitlint --from HEAD~0 --verbose` on a conventional message expected: passes.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 6).
4. Append a Completion log entry: `- 0.4 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P0 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `chore(config): add commit governance and community files (0.4)`.
```

---

### Task 0.5: Scripts and workflows

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: L
- **Depends on**: 0.2, 0.3

#### Description

Add the quality scripts (`check-size.mjs` brotli budget gate, `dogfood-smoke-test.mjs` for the two subpaths) and the four GitHub workflows plus dependabot and issue templates. CI must gate every pull request from this point forward.

#### Acceptance criteria

- [x] `scripts/check-size.mjs`: zero-dependency (node builtins only), budgets in KiB brotli, provisional values with a comment stating they are recalibrated when the real artifact exists.
- [x] `scripts/dogfood-smoke-test.mjs`: SUBPATHS `['.', './testing']`, validates ESM and CJS resolution from a packed tarball; EXPECTED_EXPORTS empty until the public API lands (documented in the script header).
- [x] `.github/workflows/ci.yml`: on push to main and on pull_request; jobs run lint, typecheck, build, and `test:cov:all` sequentially with pnpm cache.
- [x] `.github/workflows/codeql.yml` and `scorecard.yml` present (activate when the repository is public); `.github/workflows/release.yml` tag-driven (`v*.*.*`), publishes with npm provenance via OIDC, never with a long-lived token.
- [x] `.github/dependabot.yml` and issue templates ported from the sibling.
- [x] CI executes green on the phase branch.

#### Files to create / modify

- `scripts/check-size.mjs`, `scripts/dogfood-smoke-test.mjs`
- `.github/workflows/ci.yml`, `codeql.yml`, `scorecard.yml`, `release.yml`
- `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/`

#### Agent prompt

```
You are a senior CI/CD engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. Public npm
package, two subpaths ("." and "./testing"), zero direct dependencies. Sibling reference:
@bymax-one/nest-logger.

CURRENT PHASE: 0 (repository-scaffold), Task 0.5 of 6

PRECONDITIONS
- Tasks 0.2 and 0.3 done: build and quality tooling are green locally.

REQUIRED READING (only these):
- ../nest-logger: scripts/check-size.mjs, scripts/dogfood-smoke-test.mjs,
  .github/workflows/*.yml, .github/dependabot.yml, .github/ISSUE_TEMPLATE/ (copy sources).
- docs/technical_specification.md §10 "Quality Gates" and §11 "Repository Standard".

TASK
Port the quality scripts and the four workflows, adapted to this package's two subpaths.

DELIVERABLES
1. scripts/check-size.mjs: adapt the sibling's script; budgets expressed as KiB via n * 1024,
   measured brotli over the built .mjs artifacts; provisional budgets (index: generous initial
   value, testing: small) with a code comment stating recalibration happens when the artifact
   stabilizes; zero third-party imports (node:zlib, node:fs, node:path, node:url only).
2. scripts/dogfood-smoke-test.mjs: adapt SUBPATHS to ['.', './testing']; the script packs the
   tarball, installs it in a temp consumer, and imports every subpath from both ESM and CJS.
3. .github/workflows/ci.yml: triggers push (main) + pull_request; single job with steps:
   checkout, pnpm setup with cache, install --frozen-lockfile, lint, typecheck, build,
   test:cov:all. Steps sequential, no matrix parallelism across suites.
4. codeql.yml and scorecard.yml copied from the sibling (they activate once the repository is
   public; keep schedules). release.yml: tag-driven on v*.*.*, runs the full gate then
   `pnpm publish --provenance --access public` authenticated via OIDC (id-token: write).
5. dependabot.yml and ISSUE_TEMPLATE/ ported.
6. Push the branch and confirm the ci workflow runs green on GitHub for this branch.

Constraints:
- check-size.mjs must remain zero-dependency (supply-chain rule for pre-publish scripts).
- No secrets or tokens hardcoded anywhere; release auth is OIDC only.
- English-only, timeless content. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm build && node scripts/check-size.mjs` expected: passes with provisional budgets.
- `gh run list --branch feat/phase-00-repository-scaffold --limit 1` expected: ci run listed
  and concluded successfully after push.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 6).
4. Append a Completion log entry: `- 0.5 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P0 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `ci(config): add quality scripts and GitHub workflows (0.5)`.
```

---

### Task 0.6: Phase close: full-gate verification, dashboards, PR with Copilot review

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 0.1, 0.2, 0.3, 0.4, 0.5

#### Description

Audit every Definition of Done item of the phase, update all dashboards, open the phase pull request, obtain and address a GitHub Copilot code review, and merge once CI is green and the review is resolved.

#### Acceptance criteria

- [ ] Every P0 Definition of Done bullet in `../development_plan.md` §5 verified observable (green commands recorded in the PR description).
- [ ] Phase file dashboards, `docs/development_plan.md` §1, and `docs/tasks/README.md` all consistent.
- [ ] PR opened from `feat/phase-00-repository-scaffold` to `main` with a professional English title and body (scope summary, verification evidence, no attribution footer).
- [ ] GitHub Copilot code review requested; every Copilot finding addressed (fixed or answered with justification) before merge.
- [ ] PR merged with CI green; branch deleted.

#### Files to create / modify

- `docs/tasks/phase-00-repository-scaffold.md` (statuses, log)
- `docs/development_plan.md` (dashboard)
- `docs/tasks/README.md` (folder index)

#### Agent prompt

```
You are a senior release engineer closing a phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. Public npm
package. This task closes Phase 0 (repository-scaffold).

CURRENT PHASE: 0 (repository-scaffold), Task 0.6 of 6 (LAST, phase close)

PRECONDITIONS
- Tasks 0.1 through 0.5 are ✅ and committed on branch feat/phase-00-repository-scaffold.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P0: repository-scaffold" (the Definition of Done list).
- docs/tasks/phase-00-repository-scaffold.md (this file's task index and completion log).

TASK
Audit the phase, update every dashboard, and drive the phase PR through Copilot review to merge.

DELIVERABLES
1. Run the full local gate and record outputs: pnpm lint, pnpm typecheck, pnpm build,
   pnpm test:cov:all, node scripts/check-size.mjs. All must be green.
2. Verify each P0 Definition of Done bullet from docs/development_plan.md §5 and note the
   verifying command or file next to it in the PR body.
3. Update dashboards: this phase file (Status 👀 Review until merge, Progress 6/6, completion
   log), docs/development_plan.md §1 (P0 row + overall progress + active phase), and
   docs/tasks/README.md folder index. Commit as
   `docs(config): close phase 0 dashboards (0.6)`.
4. Open the PR: `gh pr create --title "feat(config): repository scaffold and quality gates"
   --body <professional English body>`. Body sections: Summary, What changed, Verification
   (the green command list), Follow-ups. No attribution footer of any kind.
5. Request a GitHub Copilot code review on the PR (GitHub UI "Reviewers > Copilot", or the gh
   reviewer request for the Copilot reviewer bot). Wait for the review, then address EVERY
   finding: fix valid ones in follow-up commits, answer non-applicable ones in the thread with
   a technical justification. Re-request review until no unresolved findings remain.
6. Merge only when CI is green and the Copilot review is resolved: `gh pr merge --squash
   --delete-branch`. After merge, flip this phase's Status to ✅ everywhere (phase file,
   development_plan.md, README index) on main.

Constraints:
- Never bypass a red gate to merge. Never use --admin or force flags.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.
- English-only. No em dashes.

Verification:
- `gh pr checks` expected: all green before merge.
- `gh pr view --json reviews` expected: Copilot review present with no unresolved threads.
- After merge: `git log main --oneline -1` shows the squash commit; dashboards show P0 ✅.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Set the phase header Progress to 6 / 6 and Status ✅.
4. Append a Completion log entry: `- 0.6 ✅ <YYYY-MM-DD> phase merged via PR #<n>`.
5. Update the P0 row and overall progress in docs/development_plan.md §1 and the folder index
   in docs/tasks/README.md.
6. Final commit on main after merge: `docs(config): mark phase 0 complete (0.6)`.
```

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->

- 0.1 ✅ 2026-07-16 package.json (two subpaths, zero deps, required peers), .gitignore, .npmrc, pnpm install clean
- 0.2 ✅ 2026-07-16 tsconfig set, tsup.config.ts (two entries), placeholder barrels; typecheck and build green
- 0.3 ✅ 2026-07-16 eslint.config.mjs (extended denied-import list), prettier, both jest configs at 100% threshold, stryker.config.json; lint and test green
- 0.4 ✅ 2026-07-16 husky pre-commit/commit-msg, commitlint, lint-staged, LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, README skeleton; malformed commit rejected locally
- 0.5 ✅ 2026-07-16 check-size.mjs and dogfood-smoke-test.mjs (both green against placeholder barrels), four workflows, dependabot, issue templates
