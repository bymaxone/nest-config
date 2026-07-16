# Phase 4: typed-accessor

> **Status**: 🔄 In Progress · **Progress**: 3 / 4 tasks · **Last updated**: 2026-07-16
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P4)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §5, §12.1

---

## Context

This phase ships `ConfigService<T>` with compile-time dot-path inference: the `Path<T>` and `PathValue<T, P>` template-literal utilities scoped to the two-level `namespace.leaf` convention, and the `get` / `getAll` / `has` API. Inference is deliberately limited to two levels to keep compiler cost flat for large schemas; deeper nesting stays typed through `getAll()` and is documented as a known limitation.

Phase 1 is merged. This phase runs in parallel with Phases 2 and 3 (disjoint files); the service reads the frozen object registered by Phase 3, but its implementation and tests depend only on the Phase 1 types.

---

## Rules-of-phase

1. **TDD, test-first**; 100% runtime coverage plus dedicated type-assertion tests for inference.
2. **Inference targets `namespace.leaf` paths only** (spec §12.1); do not attempt arbitrary-depth recursion.
3. Invalid paths are compile-time errors, pinned by type tests that assert compilation failure.
4. `get` never throws for declared paths: validation completed at bootstrap (document in JSDoc).
5. **Conventional Commits** scope `config`: `<type>(config): <subject> (4.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line anywhere.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P4: typed-accessor".
- [`../technical_specification.md`](../technical_specification.md) §5 (API surface table and example), §12.1 (two-level limitation).

---

## Task index

| ID  | Task                                                       | Status  | Priority | Size | Depends on |
| --- | ---------------------------------------------------------- | ------- | -------- | ---- | ---------- |
| 4.1 | Branch + `Path` / `PathValue` type utilities + type tests  | ✅ Done | P0       | M    | none       |
| 4.2 | `ConfigService`: `get`, `getAll`, `has`                    | ✅ Done | P0       | M    | 4.1        |
| 4.3 | Service registration in the module + global injection test | ✅ Done | P0       | S    | 4.2        |
| 4.4 | Phase close: gates, dashboards, PR with Copilot review     | 📋 ToDo | P0       | S    | 4.3        |

---

## Tasks

### Task 4.1: Branch + `Path` / `PathValue` type utilities + type tests

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: none

#### Description

Create the phase branch and the template-literal type utilities that power dot-path inference for the two-level convention.

#### Acceptance criteria

- [x] Branch `feat/phase-04-typed-accessor` created with `git switch -c`.
- [x] `Path<T>` produces the union of `namespace.leaf` strings for a config type; `PathValue<T, P>` resolves the leaf type.
- [x] Type tests pin: `'database.url'` accepted with `string` value type; `'server.port'` accepted with `number`; `'database.missing'` and `'database'` (namespace alone) rejected at compile time.
- [x] Compiler cost stays flat: utilities avoid deep recursive conditional types (two fixed levels only).
- [x] 100% coverage on any runtime code introduced (type-only files excluded from coverage per config, consistently with the sibling convention).

#### Files to create / modify

- `src/types.ts` (extend) or `src/path-types.ts` per layout, plus type-test spec

#### Agent prompt

```
You are a senior TypeScript type-system engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. ConfigService
offers compile-time dot-path inference limited to the two-level namespace.leaf convention.

CURRENT PHASE: 4 (typed-accessor), Task 4.1 of 4 (FIRST)

PRECONDITIONS
- Phase 1 merged (schema types available). Phases 2/3 may be in flight on disjoint files; do
  not touch validator or module files in this task.

REQUIRED READING (only these):
- docs/technical_specification.md §5 (Path/PathValue description) and §12.1 (the two-level
  limitation and its rationale).

TASK
Create the phase branch and implement Path and PathValue with exhaustive type tests.

DELIVERABLES
1. `git switch -c feat/phase-04-typed-accessor` (never git checkout -b).
2. Path<T> and PathValue<T, P> template-literal utilities covering exactly two levels
   (namespace and leaf), placed per the spec §3.1 layout (types file). @fileoverview + @layer
   Types; imperative JSDoc explaining the deliberate depth limit (timeless wording).
3. Type tests pinning accepted paths with their inferred value types and rejected paths
   (missing leaf, namespace-only, arbitrary string) via compile-time assertions (e.g.
   @ts-expect-error markers are NOT suppressions when used in dedicated type tests; follow
   the sibling type-test convention). Commented it()/test blocks.

Constraints:
- Two fixed levels; no unbounded recursion in conditional types.
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm typecheck && pnpm test:cov` expected: green.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-04-typed-accessor.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 4).
4. Append a Completion log entry: `- 4.1 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P4 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add dot-path inference type utilities (4.1)`.
```

---

### Task 4.2: `ConfigService`: `get`, `getAll`, `has`

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 4.1

#### Description

Implement the injectable `ConfigService<T>` wrapping the frozen config object: `get(path)` with inferred return type, `getAll()` returning the frozen root, and `has(path)` reporting declared-path presence.

#### Acceptance criteria

- [x] `src/config.service.ts` implements the API table of spec §5 exactly; constructor injects the config object with explicit `@Inject(BYMAX_CONFIG)`.
- [x] `get('database.url')` type-checks as `string`, `get('server.port')` as `number` (type tests); runtime resolution covered for all leaves of a representative schema.
- [x] `getAll()` returns the same frozen reference; `has` is `true` for defined leaves and `false` when the resolved value is `undefined` (optional leaf without default).
- [x] 100% coverage on the new file.

#### Files to create / modify

- `src/config.service.ts`, `src/config.service.spec.ts`
- `src/index.ts` (export)

#### Agent prompt

```
You are a senior NestJS library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. ConfigService
is the recommended consumption surface over the frozen BYMAX_CONFIG object.

CURRENT PHASE: 4 (typed-accessor), Task 4.2 of 4

PRECONDITIONS
- Task 4.1 done: Path and PathValue utilities exist. The BYMAX_CONFIG token exists (from the
  parallel module phase or, if not yet merged, from src/config.tokens.ts on main; rebase if
  needed).

REQUIRED READING (only these):
- docs/technical_specification.md §5 (full API table, the InvoiceService example, and the
  never-throws guarantee paragraph).

TASK
Implement ConfigService, test-first.

DELIVERABLES
1. src/config.service.spec.ts first (failing): get resolves every leaf of a representative
   frozen fixture (string, number, enum, defaulted); getAll returns the frozen root by
   reference; has true/false paths; type tests for inferred returns. Commented it() blocks.
2. src/config.service.ts: @Injectable() class ConfigService<T>, constructor
   (@Inject(BYMAX_CONFIG) private readonly config: T); get<P extends Path<T>>(path: P):
   PathValue<T, P> splitting on the single dot (two-level convention); getAll(): Readonly<T>;
   has(path: Path<T>): boolean. JSDoc documents that get never throws for declared paths
   because validation completed at bootstrap. @fileoverview + @layer Service.
3. Export ConfigService from src/index.ts.

Constraints:
- Explicit @Inject; no metadata reliance. TypeScript strict, zero any.
- English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on src/config.service.ts.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 4).
4. Append a Completion log entry: `- 4.2 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P4 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement typed ConfigService (4.2)`.
```

---

### Task 4.3: Service registration in the module + global injection test

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: 4.2

#### Description

Register `ConfigService` as a module provider/export (coordinating with the Phase 3 module if already merged; otherwise rebase on it) and prove end-to-end injection in a feature module through the global module.

#### Acceptance criteria

- [x] `BymaxConfigModule` provides and exports `ConfigService` alongside `BYMAX_CONFIG`.
- [x] Integration spec: feature provider injects `ConfigService<AppConfig>` without importing the module (global default) and reads typed values.
- [x] 100% coverage maintained package-wide.

#### Files to create / modify

- `src/config.module.ts` (provider registration), integration spec

#### Agent prompt

```
You are a senior NestJS library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11.

CURRENT PHASE: 4 (typed-accessor), Task 4.3 of 4

PRECONDITIONS
- Task 4.2 done. Phase 3 merged (module with provider factory); rebase this branch on main
  first: `git fetch && git rebase origin/main`.

REQUIRED READING (only these):
- docs/technical_specification.md §2.3 (the note that ConfigService is the recommended
  surface) and §5 (the InvoiceService example).

TASK
Register ConfigService in the module and prove global typed injection.

DELIVERABLES
1. Extend src/config.module.ts: provide ConfigService (factory or class provider consuming
   BYMAX_CONFIG via explicit inject) and export it together with BYMAX_CONFIG.
2. Extend the module integration spec: a feature provider in a nested module injects
   ConfigService via explicit @Inject(ConfigService) without importing BymaxConfigModule and
   reads get('...') values typed. Commented it() blocks.

Constraints:
- Explicit @Inject everywhere. TypeScript strict, zero any. English-only, timeless comments.
- No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov:all` expected: green, 100% package-wide.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 4).
4. Append a Completion log entry: `- 4.3 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P4 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): register ConfigService in the module (4.3)`.
```

---

### Task 4.4: Phase close: gates, dashboards, PR with Copilot review

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 4.3

#### Description

Audit the phase Definition of Done, update all dashboards, open the phase PR, obtain and address a GitHub Copilot code review, and merge with CI green.

#### Acceptance criteria

- [ ] Every P4 Definition of Done bullet in `../development_plan.md` §5 verified observable.
- [ ] Dashboards consistent (phase file, plan, README index).
- [ ] PR opened, Copilot review requested and fully addressed, merged with CI green, branch deleted.

#### Files to create / modify

- `docs/tasks/phase-04-typed-accessor.md`, `docs/development_plan.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are a senior release engineer closing a phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config. This task closes Phase 4 (typed-accessor).

CURRENT PHASE: 4 (typed-accessor), Task 4.4 of 4 (LAST, phase close)

PRECONDITIONS
- Tasks 4.1 through 4.3 are ✅ and committed on branch feat/phase-04-typed-accessor.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P4: typed-accessor" (Definition of Done).
- docs/tasks/phase-04-typed-accessor.md (task index and completion log).

TASK
Audit the phase, update dashboards, and drive the phase PR through Copilot review to merge.

DELIVERABLES
1. Run and record: pnpm lint, pnpm typecheck, pnpm build, pnpm test:cov:all. All green, 100%.
2. Verify each P4 Definition of Done bullet; cite verifying commands in the PR body.
3. Update dashboards (phase file 👀, plan P4 row, README index); commit
   `docs(config): close phase 4 dashboards (4.4)`.
4. `gh pr create --title "feat(config): typed ConfigService with dot-path inference"` with
   body sections Summary / What changed / Verification / Follow-ups. No attribution footer.
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
3. Set the phase header Progress to 4 / 4 and Status ✅.
4. Append a Completion log entry: `- 4.4 ✅ <YYYY-MM-DD> phase merged via PR #<n>`.
5. Update the P4 row and overall progress in docs/development_plan.md §1 and the folder index
   in docs/tasks/README.md.
6. Final commit on main after merge: `docs(config): mark phase 4 complete (4.4)`.
```

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->

- 4.1 ✅ 2026-07-16 Added two-level `Path`/`PathValue` dot-path utilities to `types.ts` with compile-time type tests pinning accepted paths, their value types, and rejected paths.
- 4.2 ✅ 2026-07-16 Implemented injectable `ConfigService<T>` (`get`/`getAll`/`has`) over the frozen `BYMAX_CONFIG` with explicit `@Inject`, 100% coverage, and inferred-return type tests.
- 4.3 ✅ 2026-07-16 Registered `ConfigService` as a provider and export of `BymaxConfigModule`; proved typed global injection from a non-importing feature module in the integration suite (95 tests, 100% package-wide).
