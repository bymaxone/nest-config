# Phase 2: validation-pipeline

> **Status**: 🔄 In Progress · **Progress**: 3 / 5 tasks · **Last updated**: 2026-07-16
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P2)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §6, §1.5

---

## Context

This phase implements the single-pass validation run and the value-free aggregated error model: the `ConfigIssue` structure, the frozen issue-code catalog (`BYMAX_CONFIG_MISSING`, `BYMAX_CONFIG_INVALID`, `BYMAX_CONFIG_UNKNOWN_KEY`), the `strict` mode detection of undeclared variables, `BymaxConfigValidationError` with its formatted multi-line report, and the validator that consumes a flat source record plus a `defineEnv` schema and either returns the parsed output or throws with every violation listed at once.

The hard guarantee of the package lands here: **raw source values never appear in any error output**. Tests must assert it explicitly.

Phase 1 is merged: `defineEnv`, source mapping, and `deepFreeze` are available. This phase can run in parallel with Phase 4 (typed-accessor); they touch disjoint files.

---

## Rules-of-phase

1. **TDD, test-first**; 100% coverage on every file added, both jest configs.
2. **Value-free errors are a hard contract.** Dedicated tests assert that raw values never appear in `message`, in the formatted report, or in serialized error output (spec §6.1).
3. **The report format is public contract**: snapshot tests pin it exactly (spec §6.1 example).
4. **Error codes are frozen constants**, exported once, never inline strings.
5. Variable names in the report are the resolved source names (after `meta({ env })` overrides).
6. **Conventional Commits** scope `config`: `<type>(config): <subject> (2.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line anywhere.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P2: validation-pipeline".
- [`../technical_specification.md`](../technical_specification.md) §6.1 (aggregated report), §6.2 (`BymaxConfigValidationError` and `ConfigIssue`), §6.3 (error code catalog), §1.5 principles 2 and 3.

---

## Task index

| ID  | Task                                                                | Status  | Priority | Size | Depends on    |
| --- | ------------------------------------------------------------------- | ------- | -------- | ---- | ------------- |
| 2.1 | Branch + error codes + `ConfigIssue` + `BymaxConfigValidationError` | ✅ Done | P0       | M    | none          |
| 2.2 | Report formatter (value-free, aligned, snapshot-pinned)             | ✅ Done | P0       | S    | 2.1           |
| 2.3 | Validator: single-pass parse + issue aggregation                    | ✅ Done | P0       | M    | 2.1           |
| 2.4 | Strict mode: undeclared-variable detection                          | 📋 ToDo | P1       | S    | 2.3           |
| 2.5 | Phase close: gates, dashboards, PR with Copilot review              | 📋 ToDo | P0       | S    | 2.2, 2.3, 2.4 |

---

## Tasks

### Task 2.1: Branch + error codes + `ConfigIssue` + `BymaxConfigValidationError`

- **Status**: ✅ Done
- **Priority**: P0
- **Size**: M
- **Depends on**: none

#### Description

Create the phase branch and the error model: the frozen code catalog, the `ConfigIssue` interface (path, variable, code, message), and the `BymaxConfigValidationError` class carrying the read-only issue list.

#### Acceptance criteria

- [x] Branch `feat/phase-02-validation-pipeline` created with `git switch -c`.
- [x] `src/errors.ts` exports the code constants (`BYMAX_CONFIG_VALIDATION`, `BYMAX_CONFIG_MISSING`, `BYMAX_CONFIG_INVALID`, `BYMAX_CONFIG_UNKNOWN_KEY`) as a frozen object plus the `ConfigIssueCode` union, the `ConfigIssue` interface, and `BymaxConfigValidationError` (`code`, `issues: ReadonlyArray<ConfigIssue>`).
- [x] The error's `name` is stable, `instanceof` works across ESM/CJS boundaries (constructor sets the prototype explicitly), and `issues` is immutable.
- [x] Tests cover construction, immutability of `issues`, and serialization shape.
- [x] 100% coverage on the new files.

#### Files to create / modify

- `src/errors.ts`, `src/errors.spec.ts`
- `src/index.ts` (exports)

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11: Zod v4 schema
validation of process.env once at bootstrap, aggregated value-free errors, deep-frozen typed
config via DI. Subpaths "." and "./testing". Zero direct dependencies.

CURRENT PHASE: 2 (validation-pipeline), Task 2.1 of 5 (FIRST)

PRECONDITIONS
- Phase 1 merged: defineEnv, source mapping, deepFreeze available on main.

REQUIRED READING (only these):
- docs/technical_specification.md §6.2 "BymaxConfigValidationError" and §6.3 "Error Code
  Catalog" (exact shapes and codes).

TASK
Create the phase branch and implement the error model, test-first.

DELIVERABLES
1. `git switch -c feat/phase-02-validation-pipeline` (never git checkout -b).
2. src/errors.spec.ts first (failing): code catalog frozen and complete, ConfigIssue shape,
   error construction with issues, issues immutability (push throws), instanceof stability,
   JSON serialization exposes code and issues but never a value field. Commented it() blocks.
3. src/errors.ts: frozen code catalog object + ConfigIssueCode union; ConfigIssue interface
   (readonly path, variable, code, message) exactly per spec §6.2; BymaxConfigValidationError
   extends Error with readonly code 'BYMAX_CONFIG_VALIDATION' and readonly issues, prototype
   fixed in the constructor. @fileoverview + @layer Error; imperative JSDoc.
4. Export the public error surface from src/index.ts.

Constraints:
- Codes are constants, never inline strings at use sites.
- TypeScript strict, zero any, no suppression comments. Functions <= 50 lines.
- English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on src/errors.ts.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-02-validation-pipeline.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 2.1 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P2 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add error model and code catalog (2.1)`.
```

---

### Task 2.2: Report formatter

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 2.1

#### Description

Implement the multi-line human-readable report attached to `BymaxConfigValidationError.message`: header with issue count, one aligned line per issue (variable name, constraint description), closing fix instruction, and never a raw value.

#### Acceptance criteria

- [x] Formatter produces the exact layout of spec §6.1 (header, aligned issue lines, footer).
- [x] Snapshot test pins the format for a representative multi-issue case.
- [x] A test feeds sources containing sentinel secret values and asserts none appear anywhere in the output.
- [x] 100% coverage on the new file.

#### Files to create / modify

- `src/report-formatter.ts`, `src/report-formatter.spec.ts`

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. The validation
error report is part of the public contract and never echoes raw values.

CURRENT PHASE: 2 (validation-pipeline), Task 2.2 of 5

PRECONDITIONS
- Task 2.1 done: ConfigIssue and BymaxConfigValidationError exist.

REQUIRED READING (only these):
- docs/technical_specification.md §6.1 "Aggregated Report" (the exact example block and the
  three formatting rules).

TASK
Implement the report formatter, test-first, and wire it into the error message.

DELIVERABLES
1. src/report-formatter.spec.ts first (failing): snapshot of the §6.1 layout for a three-issue
   case (missing, too-short, invalid-range), column alignment of variable names, singular and
   plural issue counts, and the value-leak guard: construct issues from a source containing
   sentinel values (e.g. "SUPER_SECRET_VALUE_123") and assert the formatted output, the error
   message, and JSON.stringify of the error contain no sentinel. Commented it() blocks.
2. src/report-formatter.ts: pure function formatting ReadonlyArray<ConfigIssue> into the §6.1
   layout. @fileoverview + @layer Utility; imperative JSDoc.
3. BymaxConfigValidationError.message built through this formatter (adjust src/errors.ts).

Constraints:
- The formatter is pure: no I/O, no color codes, no locale dependence.
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on the formatter, snapshot committed.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 2.2 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P2 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement value-free report formatter (2.2)`.
```

---

### Task 2.3: Validator: single-pass parse + issue aggregation

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 2.1

#### Description

Implement the validator that maps the flat source record onto the nested schema via the Phase 1 source mapping, runs one Zod parse, translates every Zod issue into a `ConfigIssue` (missing vs invalid), and either returns the typed parsed output or throws `BymaxConfigValidationError` with all issues.

#### Acceptance criteria

- [x] `src/env-validator.ts` exposes the validate function: `(schema, source) -> parsed output` or throws with the aggregated issues.
- [x] Missing required variables map to `BYMAX_CONFIG_MISSING`; present-but-invalid map to `BYMAX_CONFIG_INVALID`; issue `variable` is the resolved source name (post-`meta` override).
- [x] Multiple simultaneous violations are all reported in one throw (test with 3+ issues across namespaces).
- [x] Defaults apply when variables are absent; coerced leaves parse from strings.
- [x] Value-leak guard test at the validator level (sentinel values never in error output).
- [x] 100% coverage on the new file.

#### Files to create / modify

- `src/env-validator.ts`, `src/env-validator.spec.ts`
- `src/index.ts` (exports, if public per spec)

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11 (Zod v4).
The validator runs exactly once at bootstrap and reports every violation in a single error.

CURRENT PHASE: 2 (validation-pipeline), Task 2.3 of 5

PRECONDITIONS
- Task 2.1 done (error model). Phase 1 merged (defineEnv, source mapping).

REQUIRED READING (only these):
- docs/technical_specification.md §2.2 "Boot Sequence" steps 2 and 3, §6 (all subsections).
- Current Zod v4 official docs for safeParse and the issue array shape (confirm, not memory).

TASK
Implement the single-pass validator with full issue aggregation, test-first.

DELIVERABLES
1. src/env-validator.spec.ts first (failing): success path returns typed output with defaults
   and coercions applied; failure path aggregates 3+ issues across namespaces in one throw;
   missing vs invalid code mapping; variable names honor meta({ env }) overrides; sentinel
   value-leak guard; empty source produces one issue per required leaf. Commented it() blocks.
2. src/env-validator.ts: builds the nested candidate object from the flat source using the
   Phase 1 mapping, runs schema.safeParse once, translates Zod issues (undefined-received
   invalid_type => BYMAX_CONFIG_MISSING, everything else => BYMAX_CONFIG_INVALID) into
   ConfigIssue with path, resolved variable, code, value-free message; throws
   BymaxConfigValidationError on any issue; returns the parsed output otherwise.
   @fileoverview + @layer Service; imperative JSDoc.

Constraints:
- One parse pass; no per-leaf re-validation loops.
- Messages describe the constraint (expected shape), never the received value.
- TypeScript strict, zero any. Functions <= 50 lines. English-only, timeless comments.
- No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on src/env-validator.ts.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 2.3 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P2 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): implement single-pass env validator (2.3)`.
```

---

### Task 2.4: Strict mode: undeclared-variable detection

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: S
- **Depends on**: 2.3

#### Description

Add opt-in `strict` behavior: source variables that match the schema's namespace prefixes but correspond to no declared leaf produce `BYMAX_CONFIG_UNKNOWN_KEY` issues; silent when `strict` is false (the default).

#### Acceptance criteria

- [ ] With `strict: true`, `DATABASE_TYPO` (prefix `DATABASE_` declared, leaf not) yields a `BYMAX_CONFIG_UNKNOWN_KEY` issue; unrelated variables (e.g. `PATH`, `HOME`) never do.
- [ ] With `strict: false` or omitted, no unknown-key issues are produced.
- [ ] Unknown-key issues aggregate together with missing/invalid issues in one error.
- [ ] 100% coverage on the changed files.

#### Files to create / modify

- `src/env-validator.ts`, `src/env-validator.spec.ts`

#### Agent prompt

```
You are a senior TypeScript library engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. Strict mode
surfaces variables that look like config (declared namespace prefixes) but match no leaf.

CURRENT PHASE: 2 (validation-pipeline), Task 2.4 of 5

PRECONDITIONS
- Task 2.3 done: the validator aggregates missing/invalid issues.

REQUIRED READING (only these):
- docs/technical_specification.md §4.3 (the strict option JSDoc) and §6.3 (the
  BYMAX_CONFIG_UNKNOWN_KEY row).

TASK
Add strict-mode unknown-key detection to the validator, test-first.

DELIVERABLES
1. Extend src/env-validator.spec.ts first (failing): DATABASE_TYPO flagged under strict with
   the resolved namespace prefix logic; PATH and HOME ignored; strict false/omitted silent;
   unknown-key issues aggregate with other issues in the same error. Commented it() blocks.
2. Extend src/env-validator.ts: accept a strict flag (default false); compute the declared
   namespace prefixes from the schema mapping; flag source keys matching a declared prefix
   without a declared leaf as BYMAX_CONFIG_UNKNOWN_KEY (path: the namespace, variable: the
   offending source key, value-free message).

Constraints:
- Detection must not scan unrelated process variables into issues (prefix gate is mandatory).
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm test:cov` expected: green, 100% on the validator including strict branches.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 2.4 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P2 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `feat(config): add strict-mode unknown-key detection (2.4)`.
```

---

### Task 2.5: Phase close: gates, dashboards, PR with Copilot review

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 2.2, 2.3, 2.4

#### Description

Audit the phase Definition of Done, update all dashboards, open the phase PR, obtain and address a GitHub Copilot code review, and merge with CI green.

#### Acceptance criteria

- [ ] Every P2 Definition of Done bullet in `../development_plan.md` §5 verified observable.
- [ ] Dashboards consistent (phase file, plan, README index).
- [ ] PR opened, Copilot review requested and fully addressed, merged with CI green, branch deleted.

#### Files to create / modify

- `docs/tasks/phase-02-validation-pipeline.md`, `docs/development_plan.md`, `docs/tasks/README.md`

#### Agent prompt

```
You are a senior release engineer closing a phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config. This task closes Phase 2 (validation-pipeline).

CURRENT PHASE: 2 (validation-pipeline), Task 2.5 of 5 (LAST, phase close)

PRECONDITIONS
- Tasks 2.1 through 2.4 are ✅ and committed on branch feat/phase-02-validation-pipeline.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P2: validation-pipeline" (Definition of Done).
- docs/tasks/phase-02-validation-pipeline.md (task index and completion log).

TASK
Audit the phase, update dashboards, and drive the phase PR through Copilot review to merge.

DELIVERABLES
1. Run and record: pnpm lint, pnpm typecheck, pnpm build, pnpm test:cov:all. All green; 100%
   coverage over every file added in the phase.
2. Verify each P2 Definition of Done bullet, including the explicit value-leak guard tests;
   cite verifying commands in the PR body.
3. Update dashboards (phase file 👀, plan P2 row, README index); commit
   `docs(config): close phase 2 dashboards (2.5)`.
4. `gh pr create --title "feat(config): validation pipeline and value-free error model"` with
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
3. Set the phase header Progress to 5 / 5 and Status ✅.
4. Append a Completion log entry: `- 2.5 ✅ <YYYY-MM-DD> phase merged via PR #<n>`.
5. Update the P2 row and overall progress in docs/development_plan.md §1 and the folder index
   in docs/tasks/README.md.
6. Final commit on main after merge: `docs(config): mark phase 2 complete (2.5)`.
```

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->

- 2.1 ✅ 2026-07-16 Added the frozen error-code catalog, value-free ConfigIssue shape, and BymaxConfigValidationError with immutable issues and stable instanceof.
- 2.2 ✅ 2026-07-16 Added the pure, value-free report formatter, snapshot-pinned to the spec §6.1 layout, and wired it into the error message.
- 2.3 ✅ 2026-07-16 Added the single-pass validator: source mapping, one safeParse, missing-vs-invalid classification, value-free constraint messages, and aggregated throw.
