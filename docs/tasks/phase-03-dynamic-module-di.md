# Phase 3: dynamic-module-di

> **Status**: 🔄 In Progress · **Progress**: 2 / 5 tasks · **Last updated**: 2026-07-16
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P3)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §2, §4.3, §4.4

---

## Context

This phase exposes the validation pipeline through the NestJS dynamic module with fail-fast bootstrap semantics: the `ConfigurableModuleBuilder` wiring with `isGlobal` mapped through `setExtras`, `BymaxConfigModule.forRoot` and `forRootAsync`, the Symbol DI tokens (`BYMAX_CONFIG_OPTIONS`, `BYMAX_CONFIG`), the provider factory that validates, freezes, and registers the config, the `onValidationError` observability hook (invoked before the throw, unable to suppress it), and the injectable `source` defaulting to `process.env`.

Phases 1 and 2 are merged: schema engine and validator are available. Phase 4 (typed-accessor) may be running in parallel on disjoint files.

---

## Rules-of-phase

1. **TDD, test-first**; 100% coverage on every file added, both jest configs.
2. **No `@Global()` decorator.** Globality flows only through the builder extras (`setExtras`), NestJS 11 convention.
3. **Every injection site uses explicit `@Inject(token)`**; tokens are `Symbol`s. The published bundle has no `emitDecoratorMetadata`.
4. **The hook cannot suppress the failure**: `onValidationError` runs first, then the error propagates, including when the hook itself throws.
5. Confirm the current NestJS 11 `ConfigurableModuleBuilder` API against official documentation before coding.
6. **Conventional Commits** scope `config`: `<type>(config): <subject> (3.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line anywhere.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P3: dynamic-module-di".
- [`../technical_specification.md`](../technical_specification.md) §2.1 to §2.3 (architecture, boot sequence, tokens), §4.3 (module options), §4.4 (registration).

---

## Task index

| ID  | Task                                                                   | Status  | Priority | Size | Depends on |
| --- | ---------------------------------------------------------------------- | ------- | -------- | ---- | ---------- |
| 3.1 | Branch + DI tokens + module options types                              | ✅ Done | P0       | S    | none       |
| 3.2 | Module definition: `ConfigurableModuleBuilder` + `setExtras(isGlobal)` | ✅ Done | P0       | M    | 3.1        |
| 3.3 | Provider factory: validate, freeze, hook, register `BYMAX_CONFIG`      | 📋 ToDo | P0       | M    | 3.2        |
| 3.4 | Bootstrap fixtures: fail-fast and success e2e-style module tests       | 📋 ToDo | P0       | M    | 3.3        |
| 3.5 | Phase close: gates, dashboards, PR with Copilot review                 | 📋 ToDo | P0       | S    | 3.4        |

---

## Tasks

### Task 3.1: Branch + DI tokens + module options types

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: none

#### Description

Create the phase branch, the Symbol token definitions, and the `BymaxConfigModuleOptions` interface exactly as specified.

#### Acceptance criteria

- [x] Branch `feat/phase-03-dynamic-module-di` created with `git switch -c`.
- [x] `src/config.tokens.ts` exports `BYMAX_CONFIG_OPTIONS` and `BYMAX_CONFIG` as `Symbol`s (unique, described).
- [x] Options interface matches spec §4.3: `schema` (required), `source?`, `onValidationError?`, `strict?`, fully JSDoc'd.
- [x] 100% coverage on the new files.

#### Files to create / modify

- `src/config.tokens.ts`, `src/config.tokens.spec.ts`
- `src/config.options.ts` (or colocated types file per §3.1 layout), tests
- `src/index.ts` (exports)

#### Agent prompt

```
You are a senior NestJS library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11: Zod v4
validation once at bootstrap, aggregated value-free errors, deep-frozen config via DI.
Subpaths "." and "./testing". Zero direct dependencies.

CURRENT PHASE: 3 (dynamic-module-di), Task 3.1 of 5 (FIRST)

PRECONDITIONS
- Phases 1 and 2 merged: defineEnv, source mapping, deepFreeze, validator, error model on main.

REQUIRED READING (only these):
- docs/technical_specification.md §2.3 "Dependency Injection Tokens" and §4.3 "Module Options".

TASK
Create the phase branch, the Symbol tokens, and the module options types, test-first.

DELIVERABLES
1. `git switch -c feat/phase-03-dynamic-module-di` (never git checkout -b).
2. src/config.tokens.ts: BYMAX_CONFIG_OPTIONS and BYMAX_CONFIG as Symbol('...') constants with
   imperative JSDoc; @fileoverview + @layer Constants.
3. BymaxConfigModuleOptions<TSchema> exactly per spec §4.3 (schema, source?,
   onValidationError?, strict?) in its own file per the §3.1 layout, each property JSDoc'd
   with the spec's wording adapted.
4. Specs pinning token uniqueness (Symbol identity, no global registry) and the options type
   surface (type tests). Commented it() blocks.
5. Export tokens and option types from src/index.ts.

Constraints:
- Tokens are Symbol, never strings. TypeScript strict, zero any.
- English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on added files.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-03-dynamic-module-di.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 3.1 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P3 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add DI tokens and module options (3.1)`.
```

---

### Task 3.2: Module definition: `ConfigurableModuleBuilder` + `setExtras(isGlobal)`

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 3.1

#### Description

Author the module definition on `ConfigurableModuleBuilder`: options class token bound to `BYMAX_CONFIG_OPTIONS`, `isGlobal` extra (default `true`) mapped to `DynamicModule.global` via `setExtras`, and the `BymaxConfigModule` class exposing `forRoot` / `forRootAsync`.

#### Acceptance criteria

- [x] `src/config.module-definition.ts` builds the ConfigurableModuleClass with `setClassMethodName('forRoot')` and the `isGlobal` extra defaulting to `true`, mapped via `setExtras` (no `@Global()` anywhere).
- [x] `src/config.module.ts` declares `BymaxConfigModule` extending the builder class; `forRoot` and `forRootAsync` compile with the options type from 3.1.
- [x] `forRootAsync` supports `useFactory` + explicit `inject`.
- [x] Module registration tests: `forRoot` produces a global `DynamicModule` by default and a non-global one with `isGlobal: false`.
- [x] 100% coverage on the new files.

#### Files to create / modify

- `src/config.module-definition.ts`, `src/config.module.ts`, specs
- `src/index.ts` (exports)

#### Agent prompt

```
You are a senior NestJS library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. Dynamic module
built on ConfigurableModuleBuilder; global by default through setExtras, never @Global().

CURRENT PHASE: 3 (dynamic-module-di), Task 3.2 of 5

PRECONDITIONS
- Task 3.1 done: tokens and options types exist.

REQUIRED READING (only these):
- docs/technical_specification.md §2.1 "NestJS Dynamic Module Pattern" and §4.4 "Registration".
- Current NestJS 11 official docs for ConfigurableModuleBuilder, setExtras, and
  setClassMethodName (confirm the API, do not code from memory).

TASK
Implement the module definition and the module class, test-first.

DELIVERABLES
1. Specs first (failing): forRoot returns a DynamicModule with global true by default;
   isGlobal false disables it; forRootAsync accepts useFactory + inject and registers the
   async options provider under BYMAX_CONFIG_OPTIONS. Commented it() blocks.
2. src/config.module-definition.ts: ConfigurableModuleBuilder<BymaxConfigModuleOptions>()
   .setClassMethodName('forRoot').setExtras({ isGlobal: true }, (definition, extras) =>
   ({ ...definition, global: extras.isGlobal })).build(); export ConfigurableModuleClass,
   MODULE_OPTIONS_TOKEN aliased/bridged to BYMAX_CONFIG_OPTIONS per the layout in spec §3.1.
   @fileoverview + @layer Module.
3. src/config.module.ts: BymaxConfigModule extending the builder class (providers/exports are
   completed in the next task; keep this task's scope to registration shape).
4. Export BymaxConfigModule from src/index.ts.

Constraints:
- No @Global() decorator anywhere. Explicit @Inject at every injection site.
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on added files.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 3.2 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P3 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add configurable module definition (3.2)`.
```

---

### Task 3.3: Provider factory: validate, freeze, hook, register `BYMAX_CONFIG`

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 3.2

#### Description

Implement the heart of the module: the `BYMAX_CONFIG` provider factory that resolves options, defaults `source` to `process.env`, runs the Phase 2 validator, invokes `onValidationError` with the structured issues before the throw (unable to suppress it), and registers the deep-frozen output.

#### Acceptance criteria

- [ ] Provider factory injects `BYMAX_CONFIG_OPTIONS` explicitly and produces the frozen validated config under `BYMAX_CONFIG`; module exports it.
- [ ] `source` defaults to `process.env`; a custom source is used verbatim (no env fallback merge).
- [ ] On failure: hook called once with `ReadonlyArray<ConfigIssue>`, then `BymaxConfigValidationError` propagates; hook throwing does not replace or swallow the original error path (tested).
- [ ] On success: registered object is deep-frozen (mutation throws) and identical through repeated injection.
- [ ] `strict` flows from options into the validator.
- [ ] 100% coverage on the changed files.

#### Files to create / modify

- `src/config.module.ts` (providers/exports), `src/config.providers.ts` if split per layout, specs

#### Agent prompt

```
You are a senior NestJS library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. Fail-fast:
a misconfigured process must not boot; the observability hook cannot suppress the failure.

CURRENT PHASE: 3 (dynamic-module-di), Task 3.3 of 5

PRECONDITIONS
- Task 3.2 done: module definition and registration shape exist.

REQUIRED READING (only these):
- docs/technical_specification.md §2.2 "Boot Sequence" (all four steps) and §4.3 (the
  onValidationError contract).

TASK
Implement the BYMAX_CONFIG provider factory with fail-fast and hook semantics, test-first.

DELIVERABLES
1. Specs first (failing): success path registers frozen config (mutation throws, getAll
   identity stable); custom source used verbatim; default source is process.env (stub it in
   the test, never mutate the real one); failure path throws BymaxConfigValidationError after
   invoking onValidationError exactly once with the issues; a throwing hook still results in
   the original validation error propagating; strict true forwards to the validator.
   Commented it() blocks.
2. Provider factory wired into BymaxConfigModule: factory provider for BYMAX_CONFIG with
   explicit inject: [BYMAX_CONFIG_OPTIONS]; body: resolve source (options.source ??
   process.env), call the validator, on error invoke hook inside try/catch (hook errors are
   swallowed with the original error rethrown), on success return deepFreeze(parsed). Export
   BYMAX_CONFIG from the module.
3. Keep functions <= 50 lines; split a provider file per the spec §3.1 layout if the module
   file approaches the limit.

Constraints:
- The hook is observability only; it must never change the outcome.
- Explicit @Inject everywhere; tokens are Symbols. TypeScript strict, zero any.
- English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% including the hook-throws branch.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 3.3 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P3 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement fail-fast config provider factory (3.3)`.
```

---

### Task 3.4: Bootstrap fixtures: fail-fast and success module tests

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 3.3

#### Description

Prove the bootstrap semantics through real Nest testing-module fixtures: an application graph that boots with a valid source, fails to compile with an invalid one, and resolves options through `forRootAsync` factories.

#### Acceptance criteria

- [ ] Fixture app module using `forRoot` compiles and exposes `BYMAX_CONFIG` in a feature provider via explicit `@Inject`.
- [ ] Invalid source: `Test.createTestingModule(...).compile()` rejects with `BymaxConfigValidationError` (fail-fast before any consumer instantiation).
- [ ] `forRootAsync` with `useFactory` + `inject` resolves options from another provider.
- [ ] `isGlobal: true` default verified: a nested feature module injects the config without importing the config module.
- [ ] 100% coverage maintained package-wide.

#### Files to create / modify

- `src/config.module.integration.spec.ts` (fixtures colocated per sibling convention)

#### Agent prompt

```
You are a senior NestJS library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. This task
proves the module's bootstrap semantics through real TestingModule graphs.

CURRENT PHASE: 3 (dynamic-module-di), Task 3.4 of 5

PRECONDITIONS
- Task 3.3 done: provider factory registers the frozen config.

REQUIRED READING (only these):
- docs/technical_specification.md §2.2 "Boot Sequence" and §4.4 "Registration".

TASK
Write the integration-level module specs against real Nest testing graphs.

DELIVERABLES
1. src/config.module.integration.spec.ts: (a) forRoot success graph with a feature provider
   injecting BYMAX_CONFIG via explicit @Inject, asserting typed frozen values; (b) invalid
   source graph where compile() rejects with BymaxConfigValidationError; (c) forRootAsync
   graph resolving source through useFactory + inject from a fixture provider; (d) global
   default: nested module consumes without importing; (e) isGlobal false: nested module
   without import fails resolution. Every it() carries a scenario comment. Use in-test source
   records; never touch the real process.env values (stub/restore).

Constraints:
- Use @nestjs/testing only (already a devDependency); no HTTP server, no port binding.
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Run the suite with the configured bounded workers; never in parallel with other packages.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov:all` expected: green, 100% package-wide.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 3.4 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P3 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `test(config): add bootstrap fixture integration specs (3.4)`.
```

---

### Task 3.5: Phase close: gates, dashboards, PR with Copilot review

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 3.4

#### Description

Audit the phase Definition of Done, update all dashboards, open the phase PR, obtain and address a GitHub Copilot code review, and merge with CI green.

#### Acceptance criteria

- [ ] Every P3 Definition of Done bullet in `../development_plan.md` §5 verified observable.
- [ ] Dashboards consistent (phase file, plan, README index).
- [ ] PR opened, Copilot review requested and fully addressed, merged with CI green, branch deleted.

#### Files to create / modify

- `docs/tasks/phase-03-dynamic-module-di.md`, `docs/development_plan.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are a senior release engineer closing a phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config. This task closes Phase 3 (dynamic-module-di).

CURRENT PHASE: 3 (dynamic-module-di), Task 3.5 of 5 (LAST, phase close)

PRECONDITIONS
- Tasks 3.1 through 3.4 are ✅ and committed on branch feat/phase-03-dynamic-module-di.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P3: dynamic-module-di" (Definition of Done).
- docs/tasks/phase-03-dynamic-module-di.md (task index and completion log).

TASK
Audit the phase, update dashboards, and drive the phase PR through Copilot review to merge.

DELIVERABLES
1. Run and record: pnpm lint, pnpm typecheck, pnpm build, pnpm test:cov:all. All green, 100%.
2. Verify each P3 Definition of Done bullet; cite verifying commands in the PR body.
3. Update dashboards (phase file 👀, plan P3 row, README index); commit
   `docs(config): close phase 3 dashboards (3.5)`.
4. `gh pr create --title "feat(config): dynamic module with fail-fast DI"` with body sections
   Summary / What changed / Verification / Follow-ups. No attribution footer.
5. Request a GitHub Copilot code review; address EVERY finding (fix or justify in-thread);
   re-request until no unresolved findings remain.
6. `gh pr merge --squash --delete-branch` only with CI green and review resolved; flip the
   phase to ✅ everywhere on main.

Constraints:
- Never bypass a red gate. Never add Co-Authored-By, "Generated with", or any AI-attribution
  line to commits, PR titles, PR bodies, or comments. English-only. No em dashes.

Verification:
- `gh pr checks` expected: all green before merge.
- `gh pr view --json reviews` expected: Copilot review present, no unresolved threads.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Set the phase header Progress to 5 / 5 and Status ✅.
4. Append a Completion log entry: `- 3.5 ✅ <YYYY-MM-DD> phase merged via PR #<n>`.
5. Update the P3 row and overall progress in docs/development_plan.md §1 and the folder index
   in docs/tasks/README.md.
6. Final commit on main after merge: `docs(config): mark phase 3 complete (3.5)`.
```

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->

- 3.1 ✅ 2026-07-16 Symbol DI tokens (BYMAX_CONFIG_OPTIONS, BYMAX_CONFIG) and the BymaxConfigModuleOptions contract, exported from the barrel with 100% coverage.
- 3.2 ✅ 2026-07-16 ConfigurableModuleBuilder definition (options token bridged to BYMAX_CONFIG_OPTIONS, forRoot/forRootAsync, isGlobal extra mapped via setExtras) and the BymaxConfigModule class; registration-shape tests at 100% coverage.
