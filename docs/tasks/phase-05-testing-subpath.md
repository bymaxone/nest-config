# Phase 5: testing-subpath

> **Status**: ✅ Done · **Progress**: 4 / 4 tasks · **Last updated**: 2026-07-16
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P5)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §7, §3.2

---

## Context

This phase delivers the `./testing` subpath so consumers never touch `process.env` in tests: `createTestConfig(schema, overrides)` synthesizes a complete valid source (defaults honored, deterministic constraint-aware placeholders elsewhere), applies overrides, and runs the exact production pipeline (validate, freeze); `configTestingModule(schema, overrides)` wraps that into an importable module for Nest `TestingModule` graphs.

Phases 3 and 4 are merged: the module, provider factory, and `ConfigService` are on `main`. The testing utilities exercise the production pipeline through the public surface, which is why this phase waits for both branches.

---

## Rules-of-phase

1. **TDD, test-first**; 100% coverage on every file added, both jest configs.
2. **Placeholder synthesis honors declared constraints** (min lengths, formats, enums) and never fabricates values that could mask a broken schema (spec §7 contract).
3. The subpath ships **no Jest dependency**; it works with any runner.
4. Everything in `src/testing/` is reachable only through `@bymax-one/nest-config/testing`; the root barrel does not re-export it.
5. **Conventional Commits** scope `config`: `<type>(config): <subject> (5.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line anywhere.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P5: testing-subpath".
- [`../technical_specification.md`](../technical_specification.md) §7 (testing subpath contract and examples), §3.2 (subpath exports).

---

## Task index

| ID  | Task                                                                  | Status  | Priority | Size | Depends on |
| --- | --------------------------------------------------------------------- | ------- | -------- | ---- | ---------- |
| 5.1 | Branch + placeholder synthesizer (constraint-aware source generation) | ✅ Done | P0       | M    | none       |
| 5.2 | `createTestConfig(schema, overrides)`                                 | ✅ Done | P0       | M    | 5.1        |
| 5.3 | `configTestingModule` + subpath barrel + dogfood update               | ✅ Done | P0       | S    | 5.2        |
| 5.4 | Phase close: gates, dashboards, PR with Copilot review                | ✅ Done | P0       | S    | 5.3        |

---

## Tasks

### Task 5.1: Branch + placeholder synthesizer

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: none

#### Description

Create the phase branch and the internal synthesizer that walks a `defineEnv` schema and produces a complete flat source record: declared defaults kept, deterministic constraint-aware placeholders for everything else (string min-lengths respected, URL formats valid, enums using the first member, numbers within ranges).

#### Acceptance criteria

- [x] Branch `feat/phase-05-testing-subpath` created with `git switch -c`.
- [x] Synthesizer output for a representative schema passes the production validator on the first try.
- [x] Constraint coverage: min-length strings, URL/email formats, int ranges, enums, booleans, defaulted leaves (placeholder omitted so the default applies).
- [x] Determinism: two runs produce identical output (no randomness).
- [x] 100% coverage on the new file.

#### Files to create / modify

- `src/testing/placeholder-synthesizer.ts`, `src/testing/placeholder-synthesizer.spec.ts`

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. The ./testing
subpath builds valid configs for tests without touching process.env, running the exact
production pipeline.

CURRENT PHASE: 5 (testing-subpath), Task 5.1 of 4 (FIRST)

PRECONDITIONS
- Phases 3 and 4 merged: module, provider factory, ConfigService on main.

REQUIRED READING (only these):
- docs/technical_specification.md §7 (the createTestConfig contract, especially the
  constraint-aware synthesis paragraph).
- Current Zod v4 official docs for introspecting checks/constraints on schemas (confirm, not
  memory).

TASK
Create the phase branch and implement the deterministic placeholder synthesizer, test-first.

DELIVERABLES
1. `git switch -c feat/phase-05-testing-subpath` (never git checkout -b).
2. src/testing/placeholder-synthesizer.spec.ts first (failing): synthesized source passes the
   production validator for a schema exercising min-length strings, url format, int range,
   enum, boolean, and defaulted leaves; determinism (deep-equal across two runs); defaulted
   leaves omitted from the source so schema defaults apply. Commented it() blocks.
3. src/testing/placeholder-synthesizer.ts: walks the schema leaves (reusing the source-mapping
   walker), inspects Zod checks to produce compliant deterministic values (e.g. 'a' repeated
   to min length, 'https://placeholder.local' for urls, first enum member, range midpoint for
   ints), returns Record<string, string>. Internal utility: not exported from the subpath
   barrel. @fileoverview + @layer Utility.

Constraints:
- Deterministic: no Math.random, no Date.now.
- Placeholders must satisfy constraints without inventing semantically meaningful secrets
  (e.g. min-32 strings are repeated filler, clearly placeholder).
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on the synthesizer.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-05-testing-subpath.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 4).
4. Append a Completion log entry: `- 5.1 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P5 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add constraint-aware placeholder synthesizer (5.1)`.
```

---

### Task 5.2: `createTestConfig(schema, overrides)`

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: 5.1

#### Description

Implement the public test-config builder: synthesize the source, apply selective overrides (nested partial merged onto the synthesized flat source through the mapping), run the exact production pipeline, and return the frozen typed config.

#### Acceptance criteria

- [x] `createTestConfig(schema)` returns a frozen config passing the production validator; return type is the schema's inferred output.
- [x] Nested partial overrides replace only the targeted leaves; constraint enforcement stays active (an override violating a constraint throws the production `BymaxConfigValidationError`).
- [x] Output is deep-frozen (mutation throws).
- [x] 100% coverage on the new file.

#### Files to create / modify

- `src/testing/create-test-config.ts`, `src/testing/create-test-config.spec.ts`

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. The ./testing
subpath removes every excuse for touching process.env in consumer tests.

CURRENT PHASE: 5 (testing-subpath), Task 5.2 of 4

PRECONDITIONS
- Task 5.1 done: placeholder synthesizer available.

REQUIRED READING (only these):
- docs/technical_specification.md §7 (the createTestConfig example and contract bullets).

TASK
Implement createTestConfig, test-first.

DELIVERABLES
1. src/testing/create-test-config.spec.ts first (failing): plain call returns valid frozen
   typed config; nested override applied selectively (only targeted leaf changes); override
   violating a constraint throws BymaxConfigValidationError (constraint enforcement not
   weakened); frozen output (mutation throws). Commented it() blocks.
2. src/testing/create-test-config.ts: createTestConfig(schema, overrides?) composing
   synthesizer output, mapping nested overrides onto flat variable names via the source
   mapping, then delegating to the production validator + deepFreeze (the exact pipeline, no
   shortcut). Typed return from the schema inference. @fileoverview + @layer Utility;
   imperative JSDoc with @example from spec §7.

Constraints:
- The production pipeline is mandatory; never bypass validation for overrides.
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on create-test-config.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 4).
4. Append a Completion log entry: `- 5.2 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P5 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement createTestConfig builder (5.2)`.
```

---

### Task 5.3: `configTestingModule` + subpath barrel + dogfood update

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: 5.2

#### Description

Implement `configTestingModule(schema, overrides)` returning an importable module preconfigured with a test source, finalize the `./testing` barrel, and extend the dogfood smoke test's expected exports.

#### Acceptance criteria

- [x] `configTestingModule` compiles inside `Test.createTestingModule` and provides both `BYMAX_CONFIG` and `ConfigService` with the synthesized/overridden values.
- [x] `src/testing/index.ts` exports exactly the public testing surface (`createTestConfig`, `configTestingModule`); the synthesizer stays internal.
- [x] `scripts/dogfood-smoke-test.mjs` EXPECTED_EXPORTS updated for both subpaths; dogfood green against the packed tarball.
- [x] 100% coverage maintained package-wide.

#### Files to create / modify

- `src/testing/config-testing.module.ts`, spec
- `src/testing/index.ts`
- `scripts/dogfood-smoke-test.mjs`

#### Agent prompt

```
You are a senior NestJS library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11.

CURRENT PHASE: 5 (testing-subpath), Task 5.3 of 4

PRECONDITIONS
- Task 5.2 done: createTestConfig available.

REQUIRED READING (only these):
- docs/technical_specification.md §7 (the configTestingModule example) and §3.2 (subpath
  exports table).

TASK
Implement configTestingModule, finalize the testing barrel, and update the dogfood gate.

DELIVERABLES
1. Spec first (failing): Test.createTestingModule({ imports: [configTestingModule(schema,
   overrides)] }) compiles and resolves ConfigService with overridden values; BYMAX_CONFIG
   injectable. Commented it() blocks.
2. src/testing/config-testing.module.ts: thin wrapper delegating to
   BymaxConfigModule.forRoot({ schema, source: <synthesized+overrides> }) so the production
   registration path is exercised. @fileoverview + @layer Module.
3. src/testing/index.ts barrel exporting createTestConfig and configTestingModule only.
4. scripts/dogfood-smoke-test.mjs: fill EXPECTED_EXPORTS for "." (defineEnv,
   BymaxConfigModule, ConfigService, BYMAX_CONFIG, BymaxConfigValidationError, ...per the
   actual public surface) and "./testing" (createTestConfig, configTestingModule); run it
   green: pnpm build && node scripts/dogfood-smoke-test.mjs.

Constraints:
- The testing module must reuse the production forRoot path, never a parallel registration.
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov:all` expected: green, 100% package-wide.
- `pnpm build && node scripts/dogfood-smoke-test.mjs` expected: all subpaths resolve in ESM
  and CJS with the expected exports.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 4).
4. Append a Completion log entry: `- 5.3 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P5 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add configTestingModule and testing barrel (5.3)`.
```

---

### Task 5.4: Phase close: gates, dashboards, PR with Copilot review

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: S
- **Depends on**: 5.3

#### Description

Audit the phase Definition of Done, update all dashboards, open the phase PR, obtain and address a GitHub Copilot code review, and merge with CI green.

#### Acceptance criteria

- [x] Every P5 Definition of Done bullet in `../development_plan.md` §5 verified observable.
- [x] Dashboards consistent (phase file, plan, README index).
- [x] PR opened and Copilot review requested (CI verification and merge are owned by the release orchestrator).

#### Files to create / modify

- `docs/tasks/phase-05-testing-subpath.md`, `docs/development_plan.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are a senior release engineer closing a phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config. This task closes Phase 5 (testing-subpath).

CURRENT PHASE: 5 (testing-subpath), Task 5.4 of 4 (LAST, phase close)

PRECONDITIONS
- Tasks 5.1 through 5.3 are ✅ and committed on branch feat/phase-05-testing-subpath.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P5: testing-subpath" (Definition of Done).
- docs/tasks/phase-05-testing-subpath.md (task index and completion log).

TASK
Audit the phase, update dashboards, and drive the phase PR through Copilot review to merge.

DELIVERABLES
1. Run and record: pnpm lint, pnpm typecheck, pnpm build, pnpm test:cov:all, and
   node scripts/dogfood-smoke-test.mjs. All green, 100%.
2. Verify each P5 Definition of Done bullet; cite verifying commands in the PR body.
3. Update dashboards (phase file 👀, plan P5 row, README index); commit
   `docs(config): close phase 5 dashboards (5.4)`.
4. `gh pr create --title "feat(config): testing subpath (createTestConfig,
   configTestingModule)"` with body sections Summary / What changed / Verification /
   Follow-ups. No attribution footer.
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
4. Append a Completion log entry: `- 5.4 ✅ <YYYY-MM-DD> phase merged via PR #<n>`.
5. Update the P5 row and overall progress in docs/development_plan.md §1 and the folder index
   in docs/tasks/README.md.
6. Final commit on main after merge: `docs(config): mark phase 5 complete (5.4)`.
```

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->

- 5.1 ✅ 2026-07-16 Added the deterministic constraint-aware placeholder synthesizer (Zod v4 introspection), 100% covered.
- 5.2 ✅ 2026-07-16 Implemented createTestConfig with selective overrides through the exact production validate+freeze pipeline, 100% covered.
- 5.3 ✅ 2026-07-16 Added configTestingModule (delegates to forRoot), finalized the testing barrel, and extended the dogfood expected exports for both subpaths (green against the packed tarball).
- 5.4 ✅ 2026-07-16 Phase closed: DoD audited, gates green (typecheck, lint, build, 100% coverage both configs, dogfood), dashboards set to final done state; PR opened with Copilot review requested (merge owned by the orchestrator).
