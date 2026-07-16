# Development Plan: @bymax-one/nest-config

> **Version:** 1.0.0
> **Last updated:** 2026-07-06
> **Status:** Draft for execution
> **Source spec:** [`technical_specification.md`](./technical_specification.md)
> **Derived documents:** per-phase task files under `docs/tasks/` (generated later, one file per phase)

---

## Status Legend

| Emoji | Meaning     |
| ----- | ----------- |
| 📋    | ToDo        |
| 🔄    | In Progress |
| 👀    | Review      |
| ✅    | Done        |
| ⛔    | Blocked     |
| 🟡    | Partial     |

---

## 1. Progress Dashboard

> **Overall progress: 3 / 8 phases (38%)**
> **Active phase:** P3
> **Blocked phases:** none

### Phase Table

| ID  | Name                       | Status | Progress | Size | Last Updated |
| --- | -------------------------- | ------ | -------- | ---- | ------------ |
| P0  | repository-scaffold        | ✅     | 100%     | M    | 2026-07-16   |
| P1  | schema-engine              | ✅     | 100%     | M    | 2026-07-16   |
| P2  | validation-pipeline        | ✅     | 100%     | M    | 2026-07-16   |
| P3  | dynamic-module-di          | 🔄     | 20%      | M    | 2026-07-16   |
| P4  | typed-accessor             | 📋     | 0%       | S    | 2026-07-06   |
| P5  | testing-subpath            | 📋     | 0%       | M    | 2026-07-06   |
| P6  | integration-docs-dogfood   | 📋     | 0%       | M    | 2026-07-06   |
| P7  | mutation-hardening-release | 📋     | 0%       | L    | 2026-07-06   |

---

## 2. Dependency Graph

```
P0 ── P1 ──┬── P2 ── P3 ──┬── P5 ── P6 ── P7
           │              │
           └── P4 ────────┘
```

Reading guide: P0 unlocks everything. P1 (schema engine) feeds both the validation
pipeline branch (P2, then P3) and the typed accessor branch (P4). P5 needs the module
(P3) and the accessor (P4) because the testing utilities exercise the exact production
pipeline through the public surface. P6 and P7 are strictly sequential closers.

---

## 3. Parallelization Notes

- **P2 and P4 can run in parallel** once P1 is done: the validation pipeline and the
  path-inference type utilities touch disjoint files and share only the types shipped
  by P1.
- **P3 must wait for P2**: the module provider factory is the component that throws
  `BymaxConfigValidationError` during bootstrap, so the error model must exist first.
- **P5 must wait for both branches** (P3 and P4): `configTestingModule` wraps module
  registration and `createTestConfig` returns objects consumed through `ConfigService`.
- **P6 and P7 are single-threaded phases**: documentation, budget calibration, and
  mutation hardening act on the whole codebase and do not benefit from parallel work.
- Test suites always run with a bounded worker pool (`maxWorkers` capped in the jest
  configs); phases are never verified by concurrent test runs of the same package.

---

## 4. Global Conventions

These rules apply to every phase. Phase sections only add rules specific to them.

1. **TypeScript strict, zero `any`.** `noImplicitAny`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes` enabled. No suppression comments (`@ts-ignore`,
   `eslint-disable`) anywhere.
2. **Clean Code sizing.** Functions at most 50 lines; files at most 800 lines with a
   typical target of 200 to 400. Split by responsibility when a limit approaches.
3. **Explicit dependency injection.** Every constructor parameter and every factory
   `inject` entry uses `@Inject(token)`; tokens are `Symbol`s. The published bundle is
   built without `emitDecoratorMetadata`, so implicit class-type DI is never relied on.
4. **Packaging discipline.** `dependencies` stays empty. `@nestjs/common`,
   `@nestjs/core`, `reflect-metadata`, and `zod` are required peer dependencies,
   mirrored in `devDependencies` for isolated builds. tsup produces ESM + CJS + type
   declarations for both subpaths (`.` and `./testing`); no deep imports.
5. **Test discipline.** Jest with **100% line, branch, function, and statement
   coverage** enforced through `coverageThreshold` in **both** jest configs (the
   day-to-day config and the release config). Every `it()` carries a comment stating
   the scenario and the rule it protects. TDD is the working mode: tests are written
   with the code inside each phase, never deferred.
6. **English only.** Identifiers, comments, JSDoc, commit messages, and documentation
   are written in English.
7. **Timeless comments.** Code comments explain what the code does and why it is
   shaped that way. They never reference plan stages, phase numbers, or task ids.
8. **JSDoc on every export.** First line imperative, with `@param`, `@returns`,
   `@throws`, and `@example` where applicable. File headers carry `@fileoverview`
   and `@layer`.
9. **Conventional Commits.** `feat:`, `fix:`, `test:`, `docs:`, `chore:`,
   `refactor:`; commit subjects drive the semver bump at release.
10. **Security defaults.** Only `node:` prefixed builtins; ESLint restricted imports
    ban `dotenv`, bare `crypto`, and the family-wide denied packages. Validation
    errors never echo environment values (spec §6.1), and tests assert it.

---

## 5. Phase Detail

### P0: repository-scaffold

- **Goal:** Stand up the full repository toolchain so that every later phase lands on
  green gates from the first commit.
- **Scope (in):** `package.json` (subpath exports, scripts, peers, engines Node 24),
  tsconfig set, tsup config with two entries (`.` and `./testing`), ESLint flat config
  with restricted-import rules, both jest configs with the 100% threshold, Stryker
  config, husky + commitlint + lint-staged, `README.md` skeleton with badges,
  `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1 by reference), `CHANGELOG.md`, `.github/` workflows (`ci.yml`,
  `codeql.yml`, `scorecard.yml`, `release.yml`) plus `dependabot.yml` and issue
  templates, `scripts/check-size.mjs` and `scripts/dogfood-smoke-test.mjs` with the
  two subpaths declared.
- **Scope (out):** any `src/` logic beyond empty public barrels; README API content.
- **Definition of Done:**
  - `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass from a
    clean clone.
  - `pnpm build` emits `.mjs`, `.cjs`, and type declarations for both subpaths.
  - Husky hooks reject a non-conventional commit message locally.
  - CI workflow runs lint, typecheck, build, and tests on push and pull request.
- **Context / preconditions:** empty repository with `main` branch. The proven
  structure of the sibling libraries (`@bymax-one/nest-logger`, `nest-cache`) is the
  reference layout; configuration is adapted, never invented.
- **Rules-of-phase:** no placeholder directories without files; budgets in
  `check-size.mjs` start provisional and are recalibrated in P6. CodeQL and OpenSSF
  Scorecard workflows are committed now and become active once the repository is
  public.
- **References:** spec §3 (package structure), §9 (dependencies and packaging),
  §10 (quality gates), §11 (repository standard).
- **Size:** M

### P1: schema-engine

- **Goal:** Deliver the schema layer: `defineEnv`, the deterministic source-name
  mapping, and the immutability utility.
- **Scope (in):** `defineEnv(shape)` factory with the two-level namespace convention
  and the `infer` type helper; deterministic mapping from nested path to
  `SCREAMING_SNAKE_CASE` variable names; `meta({ env })` override for legacy names;
  `deepFreeze` recursive utility; supporting types.
- **Scope (out):** validation execution and error aggregation (P2); module wiring (P3).
- **Definition of Done:**
  - `defineEnv` accepts nested Zod v4 namespaces and exposes the inferred type.
  - Mapping resolves `database.url` to `DATABASE_URL` and honors `meta` overrides,
    verified by unit tests covering derivation and override precedence.
  - `deepFreeze` freezes nested objects and arrays; mutation attempts throw in strict
    mode tests.
  - Coverage stands at 100% for every file added in the phase.
- **Context / preconditions:** P0 green. Zod v4 API confirmed against current
  official documentation before implementation.
- **Rules-of-phase:** `defineEnv` never rewrites the caller's schema; coercion stays
  an explicit, documented consumer choice (spec §4.1 contract).
- **References:** spec §4.1, §4.2, §1.5 principles 4 to 6.
- **Size:** M

### P2: validation-pipeline

- **Goal:** Implement the single-pass validation run and the value-free aggregated
  error model.
- **Scope (in):** validator that consumes a flat source record and the schema;
  collection of all violations in one pass; `ConfigIssue` structure (path, variable,
  code, message); issue codes `BYMAX_CONFIG_MISSING`, `BYMAX_CONFIG_INVALID`,
  `BYMAX_CONFIG_UNKNOWN_KEY`; `strict` mode detection of undeclared variables;
  `BymaxConfigValidationError` with the formatted multi-line report.
- **Scope (out):** DI registration and the `onValidationError` hook wiring (P3).
- **Definition of Done:**
  - A source with multiple violations produces one error listing every issue, with
    resolved variable names after `meta` overrides.
  - Tests assert that raw source values never appear in `message`, in the formatted
    report, or in serialized error output (the hard guarantee of spec §6.1).
  - Strict mode flags undeclared variables under declared namespace prefixes and
    stays silent when `strict` is false.
  - Coverage stands at 100% for every file added in the phase.
- **Context / preconditions:** P1 done (mapping and types are inputs to the
  validator).
- **Rules-of-phase:** the report format is part of the public contract; snapshot
  tests pin it. Error codes are frozen constants, never inline strings.
- **References:** spec §6 (all subsections), §1.5 principles 2 and 3.
- **Size:** M

### P3: dynamic-module-di

- **Goal:** Expose the pipeline through the NestJS dynamic module with fail-fast
  bootstrap semantics.
- **Scope (in):** `ConfigurableModuleBuilder` wiring with `isGlobal` mapped through
  `setExtras`; `BymaxConfigModule.forRoot` and `forRootAsync`; Symbol tokens
  (`BYMAX_CONFIG_OPTIONS`, `BYMAX_CONFIG`); provider factory that validates, freezes,
  and registers the config; `onValidationError` observability hook invoked before the
  throw and unable to suppress it; injectable `source` defaulting to `process.env`.
- **Scope (out):** the typed accessor surface (P4); testing helpers (P5).
- **Definition of Done:**
  - A fixture application boots with a valid source and fails to boot (before binding
    a port) with an invalid one.
  - `forRootAsync` resolves options through `useFactory` with explicit `inject`.
  - The hook receives the structured issue list and the error still propagates when
    the hook itself throws or returns normally.
  - The registered config object is deep-frozen and globally injectable by default.
  - Coverage stands at 100% for every file added in the phase.
- **Context / preconditions:** P2 done. NestJS 11 `ConfigurableModuleBuilder`
  behavior confirmed against current official documentation.
- **Rules-of-phase:** no `@Global()` decorator; globality flows only through the
  builder extras. Every injection site uses explicit `@Inject`.
- **References:** spec §2.1 to §2.3, §4.3, §4.4.
- **Size:** M

### P4: typed-accessor

- **Goal:** Ship `ConfigService` with compile-time dot-path inference.
- **Scope (in):** `Path` and `PathValue` template-literal utilities scoped to the
  two-level convention; `ConfigService.get`, `getAll`, `has`; type-level tests
  asserting inference and rejection of invalid paths.
- **Scope (out):** runtime validation logic (owned by P2); module registration (P3).
- **Definition of Done:**
  - `get('database.url')` type-checks as `string` and `get('server.port')` as
    `number` in compile-time assertions; an invalid path fails compilation.
  - `getAll` returns the frozen root; `has` reports declared-path presence.
  - Runtime behavior is covered at 100%, and type behavior is pinned with dedicated
    type-assertion tests.
- **Context / preconditions:** P1 done. Runs in parallel with P2 and P3.
- **Rules-of-phase:** inference intentionally targets `namespace.leaf` paths only;
  deeper nesting stays out of `get` and is documented as such (spec §12.1).
- **References:** spec §5, §12.1.
- **Size:** S

### P5: testing-subpath

- **Goal:** Deliver `./testing` so consumers never touch `process.env` in tests.
- **Scope (in):** `createTestConfig(schema, overrides)` synthesizing a complete valid
  source (defaults honored, deterministic placeholders elsewhere, constraint-aware
  lengths and formats) and running the exact production pipeline;
  `configTestingModule(schema, overrides)` for Nest `TestingModule` graphs; subpath
  barrel.
- **Scope (out):** any Jest-specific dependency inside the shipped code.
- **Definition of Done:**
  - `createTestConfig` output passes the production validator and arrives frozen.
  - Overrides merge selectively without weakening constraint enforcement.
  - `configTestingModule` compiles in a `TestingModule` and provides `ConfigService`.
  - The dogfood smoke test resolves `./testing` in both ESM and CJS.
  - Coverage stands at 100% for every file added in the phase.
- **Context / preconditions:** P3 and P4 done.
- **Rules-of-phase:** placeholder synthesis honors declared constraints and never
  fabricates values that could mask a broken schema (spec §7 contract).
- **References:** spec §7, §3.2.
- **Size:** M

### P6: integration-docs-dogfood

- **Goal:** Prove the package end to end and finish the public documentation.
- **Scope (in):** e2e suite booting a realistic fixture application through the
  packed artifact (success path, aggregated-failure path, async registration path);
  full `README.md` (quick start, API reference, error catalog, testing guide);
  `CHANGELOG.md` for the first release; bundle budgets in `check-size.mjs`
  recalibrated to the real artifact; dogfood smoke test green across subpaths and
  module formats.
- **Scope (out):** mutation hardening and publishing (P7).
- **Definition of Done:**
  - e2e specs pass against the built package, not against source aliases.
  - README documents every exported symbol and every error code.
  - Size budgets sit within roughly 1.2x to 1.5x of the measured artifact.
  - `pnpm prepublishOnly` chain (typecheck, lint, full coverage, build) is green.
- **Context / preconditions:** P5 done; every public surface frozen.
- **Rules-of-phase:** documentation examples must compile; snippets are lifted from
  tested fixtures, not written free-hand.
- **References:** spec §10, §11, §13.
- **Size:** M

### P7: mutation-hardening-release

- **Goal:** Reach the mutation threshold and publish v0.1.0 with provenance.
- **Scope (in):** Stryker baseline run; survivor analysis and test hardening in one
  concentrated pass; documentation of genuine equivalents in
  `docs/mutation_testing_results.md`; final run at or above the break threshold of
  95; npm publish dry run resolving against the public registry; provenance release
  from CI via OIDC; version tag and changelog entry.
- **Scope (out):** new features of any kind; API changes require reopening earlier
  phases.
- **Definition of Done:**
  - Mutation score at or above 95 with `break: 95` configured.
  - Equivalent mutants documented with reasons; no blanket disables.
  - `pnpm publish --dry-run` succeeds; the real release publishes
    `@bymax-one/nest-config@0.1.0` with provenance from CI.
  - Post-publish smoke: a scratch consumer installs the released version and boots
    the fixture successfully.
- **Context / preconditions:** P6 done; repository public so provenance and the
  security workflows are effective.
- **Rules-of-phase:** mutation runs are a release gate, not a per-commit gate; test
  changes here must not lower readability or introduce implementation coupling.
- **References:** spec §9.3, §10.
- **Size:** L

---

## 6. Update Protocol

When a phase changes status:

1. Update the phase's **Status** and **Progress** in the Phase Table (section 1) and
   set **Last Updated** to the current date.
2. Update the **Overall progress** counter and the **Active phase** line in the
   Progress Dashboard.
3. If the phase is blocked, set ⛔, name the blocker in the phase's Context, and list
   it under **Blocked phases** in the dashboard.
4. When a phase reaches ✅, verify its Definition of Done checklist is fully
   observable in the repository (green commands, merged commits) before flipping the
   emoji.
5. Mirror the status change in the phase's task file under `docs/tasks/` when task
   files exist; the dashboard in **this file is canonical** and wins on divergence.
6. Commit the documentation update with a `docs:` Conventional Commit in the same
   change set that completed the phase.

---

## 7. References

- [`technical_specification.md`](./technical_specification.md), the source spec for
  every phase in this plan.
- Sibling prior art: `@bymax-one/nest-logger` and `@bymax-one/nest-cache`
  (repository layout, quality gates, and release flow this plan mirrors).
