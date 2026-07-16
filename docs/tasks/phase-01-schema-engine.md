# Phase 1: schema-engine

> **Status**: 🔄 In Progress · **Progress**: 1 / 5 tasks · **Last updated**: 2026-07-16
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P1)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §4.1, §4.2, §1.5

---

## Context

This phase delivers the schema layer everything else consumes: the `defineEnv(shape)` factory with the two-level namespace convention and its inferred-type helper, the deterministic mapping from nested config paths to `SCREAMING_SNAKE_CASE` environment variable names with the `meta({ env })` override, and the `deepFreeze` immutability utility. No validation execution and no NestJS wiring happen here; those are the next phases.

At the start of this phase the repository has the full Phase 0 toolchain on `main`: green lint, typecheck, build, tests (empty), CI on every PR. Zod v4 is a peer and dev dependency.

---

## Rules-of-phase

1. **TDD, test-first.** Write the failing spec before each implementation file; 100% coverage on every file added in this phase, both jest configs.
2. **Official docs first.** Confirm the current Zod v4 API (`z.object`, `z.coerce`, `.meta()`, error/issue shapes) against the official documentation before coding; never from memory.
3. **`defineEnv` never rewrites the caller's schema.** Coercion stays an explicit consumer choice (spec §4.1 contract).
4. **Mapping is deterministic and total**: `SCREAMING_SNAKE_CASE` of the joined path; `meta({ env })` wins when present; the resolution order is covered by tests.
5. Every source file carries `@fileoverview` + `@layer`; every export carries imperative JSDoc.
6. **Conventional Commits** scope `config`, task id in the subject: `<type>(config): <subject> (1.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line anywhere.
7. Remove `passWithNoTests` from the jest configs in the first task that adds a spec.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P1: schema-engine".
- [`../technical_specification.md`](../technical_specification.md) §4.1 (`defineEnv`), §4.2 (source mapping), §1.5 (principles 4 to 6), §3.1 (file layout).

---

## Task index

| ID  | Task                                                                                           | Status  | Priority | Size | Depends on    |
| --- | ---------------------------------------------------------------------------------------------- | ------- | -------- | ---- | ------------- |
| 1.1 | Branch + core types (`EnvSchema`, shape constraints, `ConfigIssueCode` placeholder-free types) | ✅ Done | P0       | S    | none          |
| 1.2 | `defineEnv(shape)` factory + inferred-type helper                                              | 📋 ToDo | P0       | M    | 1.1           |
| 1.3 | Source-name mapping: path derivation + `meta({ env })` override                                | 📋 ToDo | P0       | M    | 1.2           |
| 1.4 | `deepFreeze` utility                                                                           | 📋 ToDo | P0       | S    | 1.1           |
| 1.5 | Phase close: gates, dashboards, PR with Copilot review                                         | 📋 ToDo | P0       | S    | 1.2, 1.3, 1.4 |

---

## Tasks

### Task 1.1: Branch + core types

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: none

#### Description

Create the phase branch and the foundational type definitions used across the package: the `EnvSchema` shape contract (two-level namespaces of Zod objects) and supporting generic types, in `src/types.ts`.

#### Acceptance criteria

- [x] Branch `feat/phase-01-schema-engine` created with `git switch -c`.
- [x] `src/types.ts` defines the schema shape types with JSDoc; no `any` anywhere.
- [x] Type-level assertions (via `expectTypeOf` or equivalent dedicated type tests) pin the accepted and rejected shapes.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test:cov` green; coverage 100% on files added.

#### Files to create / modify

- `src/types.ts`, `src/types.spec.ts`

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11: Zod v4 schema
validation of process.env once at bootstrap, aggregated value-free errors, deep-frozen typed
config via DI. Subpaths "." and "./testing". Zero direct dependencies.

CURRENT PHASE: 1 (schema-engine), Task 1.1 of 5 (FIRST)

PRECONDITIONS
- Phase 0 merged: full toolchain green on main; src/index.ts is an empty barrel.

REQUIRED READING (only these):
- docs/technical_specification.md §4.1 (the defineEnv contract and example) and §3.1 (file
  layout).
- Current Zod v4 official docs for z.object typing (confirm, do not rely on memory).

TASK
Create the phase branch and author the foundational schema shape types with type tests.

DELIVERABLES
1. `git switch -c feat/phase-01-schema-engine` (never git checkout -b).
2. src/types.ts: the EnvSchema/shape contract types for the two-level namespace convention
   (top-level keys are namespaces holding Zod object schemas; leaves are Zod types). Include
   the generic helpers later files will need to infer the parsed output type from a shape.
   @fileoverview + @layer Types header; imperative JSDoc on every export.
3. src/types.spec.ts: type-level tests pinning that valid two-level shapes are accepted and
   that the inferred output type matches Zod inference. Every it() carries a comment stating
   scenario and protected rule. Remove passWithNoTests from both jest configs now that a spec
   exists.

Constraints:
- TypeScript strict, zero any, no suppression comments. Functions <= 50 lines, files <= 800.
- English-only, timeless comments (no phase/task references in code). No em dashes. No .gitkeep.
- Run tests sequentially with the configured bounded workers.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm typecheck && pnpm lint && pnpm test:cov` expected: green, 100% coverage on added files.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-01-schema-engine.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 1.1 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P1 row in docs/development_plan.md §1 (Status 🔄, Progress, Last Updated) and the
   folder index in docs/tasks/README.md.
6. Commit: `feat(config): add schema shape types (1.1)`.
```

---

### Task 1.2: `defineEnv(shape)` factory + inferred-type helper

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 1.1

#### Description

Implement `defineEnv`, the thin typed factory over `z.object(...)` that establishes the namespace convention and exposes the inferred type through the `infer` phantom property, without rewriting the caller's schema.

#### Acceptance criteria

- [ ] `src/define-env.ts` exports `defineEnv(shape)` returning the composed Zod schema augmented with the `infer` type helper; runtime value is the schema itself.
- [ ] Accepts nested Zod v4 namespaces exactly as in spec §4.1; rejects non-object top-level entries at the type level.
- [ ] `typeof envSchema.infer` equals the Zod-inferred output type (pinned by type tests).
- [ ] No schema mutation: the caller's shape objects are reused, not cloned or wrapped with extra behavior.
- [ ] 100% coverage on the new file; specs follow TDD order.

#### Files to create / modify

- `src/define-env.ts`, `src/define-env.spec.ts`
- `src/index.ts` (export)

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11 (Zod v4,
fail-fast aggregated validation, frozen config via DI). Subpaths "." and "./testing".

CURRENT PHASE: 1 (schema-engine), Task 1.2 of 5

PRECONDITIONS
- Task 1.1 done: src/types.ts exists with the shape contract; branch
  feat/phase-01-schema-engine checked out.

REQUIRED READING (only these):
- docs/technical_specification.md §4.1 "defineEnv(shape)" (full contract and code example).
- Current Zod v4 official docs for z.object and type inference (confirm, not memory).

TASK
Implement defineEnv with its inferred-type helper, test-first.

DELIVERABLES
1. src/define-env.spec.ts first (failing): covers composition of namespaces into one schema,
   the infer helper matching Zod inference, defaults surviving untouched, and the no-rewrite
   guarantee (same schema instances are reachable). Commented it() blocks.
2. src/define-env.ts: defineEnv(shape) building z.object(shape), returned with the phantom
   infer property typed as the parsed output. @fileoverview + @layer Utility. Imperative JSDoc
   with @example matching spec §4.1.
3. Export defineEnv (and its types) from src/index.ts.

Constraints:
- defineEnv never rewrites or wraps leaf schemas; coercion is the caller's explicit choice.
- TypeScript strict, zero any, no suppression comments. Functions <= 50 lines.
- English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on src/define-env.ts.
- `pnpm build` expected: green.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 1.2 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P1 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement defineEnv factory (1.2)`.
```

---

### Task 1.3: Source-name mapping

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 1.2

#### Description

Implement the deterministic mapping between nested config paths and flat environment variable names: `SCREAMING_SNAKE_CASE` of the joined path (`database.url` reads `DATABASE_URL`, `auth.jwtSecret` reads `AUTH_JWT_SECRET`), with `meta({ env })` on a leaf overriding the derived name.

#### Acceptance criteria

- [ ] A dedicated module (e.g. `src/source-mapping.ts`) exposes resolution of every leaf's source variable name from a `defineEnv` schema.
- [ ] Derivation handles camelCase leaves (`jwtSecret` -> `JWT_SECRET` within its namespace) and is covered for single-word, camelCase, and numeric-suffix names.
- [ ] `meta({ env: '...' })` override wins over derivation; precedence covered by tests.
- [ ] The full leaf-to-variable table for a representative schema is pinned by a snapshot test (contract stability).
- [ ] 100% coverage on the new files.

#### Files to create / modify

- `src/source-mapping.ts`, `src/source-mapping.spec.ts`
- `src/index.ts` (export if the helper is public per spec §4.2)

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11 (Zod v4,
fail-fast aggregated validation, frozen config via DI).

CURRENT PHASE: 1 (schema-engine), Task 1.3 of 5

PRECONDITIONS
- Task 1.2 done: defineEnv exists and is exported.

REQUIRED READING (only these):
- docs/technical_specification.md §4.2 "Source Mapping" (the deterministic rule and the
  meta({ env }) override example).
- Current Zod v4 official docs for .meta() metadata access (confirm, not memory).

TASK
Implement leaf-to-variable name resolution, test-first.

DELIVERABLES
1. src/source-mapping.spec.ts first (failing): derivation cases (database.url ->
   DATABASE_URL, auth.jwtSecret -> AUTH_JWT_SECRET, single word, numeric suffix), override
   precedence via meta({ env }), and a snapshot of the complete mapping table for a
   representative schema. Commented it() blocks.
2. src/source-mapping.ts: walks a defineEnv schema, yields { path, variable } for every leaf;
   derivation is SCREAMING_SNAKE_CASE of the joined path segments (camelCase split on case
   boundaries); meta env override wins. @fileoverview + @layer Utility; imperative JSDoc.
3. Export from src/index.ts only if spec §4.2 declares it public; otherwise keep it internal
   (imported by the validator in the next phase) and state so in the file header.

Constraints:
- The mapping must be pure and total: every leaf resolves to exactly one variable name.
- TypeScript strict, zero any. Functions <= 50 lines. English-only, timeless comments.
- No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on src/source-mapping.ts.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 1.3 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P1 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement deterministic source-name mapping (1.3)`.
```

---

### Task 1.4: `deepFreeze` utility

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 1.1

#### Description

Implement the recursive freeze utility that makes the validated config immutable by construction: nested objects and arrays frozen, mutation attempts throwing under strict mode.

#### Acceptance criteria

- [ ] `src/deep-freeze.ts` exports a generic `deepFreeze<T>(value: T): Readonly<T>` handling nested objects, arrays, and already-frozen values without infinite recursion.
- [ ] Tests prove: nested object frozen, array element frozen, mutation throws in strict-mode test, primitives and null pass through, idempotent on re-freeze.
- [ ] 100% coverage on the new file.

#### Files to create / modify

- `src/deep-freeze.ts`, `src/deep-freeze.spec.ts`

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. The validated
config object is deep-frozen before entering the DI container (immutability by construction).

CURRENT PHASE: 1 (schema-engine), Task 1.4 of 5

PRECONDITIONS
- Task 1.1 done. Runs independently of 1.2/1.3 (disjoint files).

REQUIRED READING (only these):
- docs/technical_specification.md §1.5 principle 5 and §2.2 step 4.

TASK
Implement deepFreeze, test-first.

DELIVERABLES
1. src/deep-freeze.spec.ts first (failing): nested object immutability, arrays, throw on
   mutation ("use strict" semantics of the jest environment), primitive/null pass-through,
   idempotence, no infinite recursion on self-referencing structures. Commented it() blocks.
2. src/deep-freeze.ts: recursive Object.freeze walking own enumerable properties; skips
   already-frozen nodes (cycle safety). Generic signature deepFreeze<T>(value: T): Readonly<T>.
   @fileoverview + @layer Utility; imperative JSDoc with @example.

Constraints:
- Zero dependencies; node builtins and language features only.
- TypeScript strict, zero any. Functions <= 50 lines. English-only, timeless comments.
- No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on src/deep-freeze.ts including the cycle branch.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 1.4 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P1 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement deepFreeze utility (1.4)`.
```

---

### Task 1.5: Phase close: gates, dashboards, PR with Copilot review

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 1.2, 1.3, 1.4

#### Description

Audit the phase Definition of Done, update all dashboards, open the phase PR, obtain and address a GitHub Copilot code review, and merge with CI green.

#### Acceptance criteria

- [ ] Every P1 Definition of Done bullet in `../development_plan.md` §5 verified observable.
- [ ] Dashboards consistent across the phase file, `docs/development_plan.md`, and `docs/tasks/README.md`.
- [ ] PR opened, Copilot review requested and fully addressed, merged with CI green, branch deleted.

#### Files to create / modify

- `docs/tasks/phase-01-schema-engine.md`, `docs/development_plan.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are a senior release engineer closing a phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config. This task closes Phase 1 (schema-engine).

CURRENT PHASE: 1 (schema-engine), Task 1.5 of 5 (LAST, phase close)

PRECONDITIONS
- Tasks 1.1 through 1.4 are ✅ and committed on branch feat/phase-01-schema-engine.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P1: schema-engine" (Definition of Done).
- docs/tasks/phase-01-schema-engine.md (task index and completion log).

TASK
Audit the phase, update dashboards, and drive the phase PR through Copilot review to merge.

DELIVERABLES
1. Run and record: pnpm lint, pnpm typecheck, pnpm build, pnpm test:cov:all. All green; 100%
   coverage over every file added in the phase.
2. Verify each P1 Definition of Done bullet; cite the verifying command in the PR body.
3. Update dashboards (phase file 👀, plan P1 row, README index); commit
   `docs(config): close phase 1 dashboards (1.5)`.
4. `gh pr create --title "feat(config): schema engine (defineEnv, source mapping, deepFreeze)"`
   with body sections Summary / What changed / Verification / Follow-ups. No attribution footer.
5. Request a GitHub Copilot code review; address EVERY finding (fix or justify in-thread);
   re-request until no unresolved findings remain.
6. `gh pr merge --squash --delete-branch` only with CI green and review resolved; then flip
   the phase to ✅ everywhere on main.

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
4. Append a Completion log entry: `- 1.5 ✅ <YYYY-MM-DD> phase merged via PR #<n>`.
5. Update the P1 row and overall progress in docs/development_plan.md §1 and the folder index
   in docs/tasks/README.md.
6. Final commit on main after merge: `docs(config): mark phase 1 complete (1.5)`.
```

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->

- 1.1 ✅ 2026-07-16 Added foundational schema shape types (EnvShape, EnvNamespace, EnvLeaf, EnvOutput, EnvSchema) with compile-time type tests; removed passWithNoTests from both jest configs.
