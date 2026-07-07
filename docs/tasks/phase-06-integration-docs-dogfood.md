# Phase 6: integration-docs-dogfood

> **Status**: 📋 ToDo · **Progress**: 0 / 5 tasks · **Last updated**: 2026-07-06
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P6)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §10, §11, §13

---

## Context

This phase proves the package end to end and finishes the public documentation: an e2e suite that boots a realistic fixture application through the **packed artifact** (not source aliases), the full `README.md` (quick start, API reference, error catalog, testing guide), the first-release `CHANGELOG.md` entry, bundle budgets in `check-size.mjs` recalibrated to the real artifact (roughly 1.2x to 1.5x), and a green dogfood smoke test across subpaths and module formats.

Phase 5 is merged; every public surface is frozen. No API changes are allowed here; if one is needed, the corresponding earlier phase reopens.

---

## Rules-of-phase

1. **Documentation examples must compile**: every README snippet is lifted from tested fixture code, never written free-hand.
2. **e2e runs against the built package** (packed tarball or `dist` via the exports map), not `src` path aliases.
3. Budgets are calibrated as a bloat tripwire (1.2x to 1.5x of the measured artifact), in KiB brotli, with the rationale in a script comment.
4. `pnpm prepublishOnly` (typecheck, lint, full coverage, build) must be green at phase close.
5. **Conventional Commits** scope `config`: `<type>(config): <subject> (6.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line anywhere.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P6: integration-docs-dogfood".
- [`../technical_specification.md`](../technical_specification.md) §10 (quality gates), §11 (repository standard), §13 (example integration).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
|---|---|---|---|---|---|
| 6.1 | Branch + e2e fixture app + success/failure/async boot specs against the packed artifact | 📋 ToDo | P0 | M | none |
| 6.2 | Full README (quick start, API reference, error catalog, testing guide) | 📋 ToDo | P0 | M | 6.1 |
| 6.3 | CHANGELOG first entry + budget recalibration | 📋 ToDo | P1 | S | 6.1 |
| 6.4 | prepublishOnly chain + dogfood verification | 📋 ToDo | P0 | S | 6.2, 6.3 |
| 6.5 | Phase close: gates, dashboards, PR with Copilot review | 📋 ToDo | P0 | S | 6.4 |

---

## Tasks

### Task 6.1: Branch + e2e fixture app + boot specs against the packed artifact

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: none

#### Description

Create the phase branch and the e2e suite: a realistic fixture application consuming the packed artifact, covering the success boot path, the aggregated-failure path, and the async registration path.

#### Acceptance criteria

- [ ] e2e specs import from `@bymax-one/nest-config` resolved through the built package (packed tarball installed into the e2e fixture, or dist-mapped exports), never `src/` aliases.
- [ ] Success path: fixture app module (spec §13 shape) boots, feature provider reads typed values.
- [ ] Failure path: incomplete source rejects bootstrap with the aggregated report; assertion pins issue count and absence of raw values.
- [ ] Async path: `forRootAsync` composing `process.env`-shaped source with a fixture secrets provider.
- [ ] e2e wired as a separate jest project/config, still sequential with bounded workers.

#### Files to create / modify

- `test/e2e/` fixture and specs, `jest.e2e.config.ts` (if not present), `package.json` (test:e2e script)

#### Agent prompt

````
You are a senior NestJS quality engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. This phase
proves the shipped artifact end to end.

CURRENT PHASE: 6 (integration-docs-dogfood), Task 6.1 of 5 (FIRST)

PRECONDITIONS
- Phase 5 merged: the full public surface is frozen and 100% covered at unit level.

REQUIRED READING (only these):
- docs/technical_specification.md §13 "Example Integration" (the fixture shape) and §10
  (the package-integrity gate description).
- ../nest-logger e2e layout (jest.e2e config and how the sibling wires e2e against dist).

TASK
Create the phase branch and the e2e suite against the built package.

DELIVERABLES
1. `git switch -c feat/phase-06-integration-docs-dogfood` (never git checkout -b).
2. test/e2e/ fixture application mirroring spec §13 (env.schema.ts with server/database/
   redis/log namespaces; app module registering BymaxConfigModule.forRoot and a feature
   provider consuming ConfigService). Imports resolve to the BUILT package (follow the
   sibling's e2e resolution approach: pack + install into the fixture, or moduleNameMapper to
   dist through the exports map). Document the chosen mechanism in the config file header.
3. Specs: success boot with typed reads; failure boot with 3+ issues asserting the aggregated
   report and no raw values; forRootAsync composition path. Commented it() blocks.
4. jest.e2e.config.ts (or extend existing) with maxWorkers '50%'; package.json test:e2e
   script; CI ci.yml gains the e2e step after unit tests (sequential).

Constraints:
- Never bind network ports; TestingModule level is enough.
- TypeScript strict, zero any. English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm build && pnpm test:e2e` expected: green against the built artifact.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-06-integration-docs-dogfood.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 6.1 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P6 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `test(config): add e2e suite against the packed artifact (6.1)`.
````

---

### Task 6.2: Full README

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 6.1

#### Description

Write the complete public README: value proposition, installation, quick start, full API reference (every exported symbol), the error catalog, the testing guide, and the design-principles section. Every snippet is lifted from compiled fixture or spec code.

#### Acceptance criteria

- [ ] README documents every exported symbol of both subpaths and every error code of spec §6.3.
- [ ] Quick start reproduces the spec §13 integration; snippets copied from the e2e fixture (compile-verified sources referenced in an HTML comment near each block).
- [ ] Sections: badges, features, installation (peer requirements table), quick start, API reference, error catalog, testing guide, design principles (validate once, value-free errors, frozen config), limitations, license.
- [ ] English, professional, public-grade; no internal references; no em dashes.

#### Files to create / modify

- `README.md`

#### Agent prompt

````
You are a senior open-source technical writer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11: Zod v4
validation once at bootstrap, aggregated value-free errors, deep-frozen typed config via DI.
Public npm package, MIT.

CURRENT PHASE: 6 (integration-docs-dogfood), Task 6.2 of 5

PRECONDITIONS
- Task 6.1 done: e2e fixtures exist and compile (the source of truth for snippets).

REQUIRED READING (only these):
- docs/technical_specification.md §1 (vision), §5 (API table), §6.3 (error catalog), §7
  (testing), §12 (limitations), §13 (integration example).
- test/e2e/ fixture files (snippet sources).
- ../nest-logger/README.md (structure and badge conventions of the family).

TASK
Write the complete public README.

DELIVERABLES
1. README.md with: title + one-line value proposition; badge row (CI, coverage, npm version,
   license); Features list; Installation (pnpm/npm commands + peer requirements table:
   Node >= 24, NestJS ^11, zod ^4, reflect-metadata ^0.2); Quick start (define schema,
   register module, inject ConfigService, the failure report example verbatim from spec
   §6.1); API reference covering defineEnv, BymaxConfigModule.forRoot/forRootAsync + options
   table, ConfigService (get/getAll/has), BymaxConfigValidationError + ConfigIssue; Error
   catalog table (§6.3); Testing guide (./testing subpath, createTestConfig,
   configTestingModule examples); Design principles (validate once, fail fast and complete,
   never echo values, frozen config, injectable source); Known limitations (§12 summarized);
   License. Every code snippet lifted from the e2e fixture or spec files.

Constraints:
- Public-grade and professional; no references to private repositories or internal tooling.
- English-only. ABSOLUTELY no em dashes (use commas, colons, parentheses).
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- Every README snippet compiles: extract and typecheck them against the fixture sources
  (manual diff acceptable; state the mapping in the PR body later).
- `grep -cP '\x{2014}|\x{2013}' README.md` expected: 0 (no em or en dash characters).

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 6.2 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P6 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `docs(config): write complete public README (6.2)`.
````

---

### Task 6.3: CHANGELOG first entry + budget recalibration

- **Status**: 📋 ToDo
- **Priority**: P1
- **Size**: S
- **Depends on**: 6.1

#### Description

Write the `0.1.0` changelog entry (Keep a Changelog format) and recalibrate the `check-size.mjs` budgets against the real built artifact.

#### Acceptance criteria

- [ ] `CHANGELOG.md` Unreleased content moved to a `0.1.0` section listing the public surface shipped.
- [ ] Budgets set to roughly 1.2x to 1.5x of the measured brotli size per subpath, with a comment stating the measured baseline and date.
- [ ] `node scripts/check-size.mjs` green with the new budgets.

#### Files to create / modify

- `CHANGELOG.md`, `scripts/check-size.mjs`

#### Agent prompt

````
You are a senior release engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11.

CURRENT PHASE: 6 (integration-docs-dogfood), Task 6.3 of 5

PRECONDITIONS
- Task 6.1 done; the artifact builds green.

REQUIRED READING (only these):
- CHANGELOG.md (current Unreleased section), scripts/check-size.mjs (provisional budgets).

TASK
Finalize the first changelog entry and calibrate the size budgets.

DELIVERABLES
1. CHANGELOG.md: 0.1.0 section (date placeholder until release) with Added entries for the
   public surface (defineEnv, validation pipeline with value-free aggregated errors, dynamic
   module, typed ConfigService, ./testing subpath). Keep a Changelog structure.
2. Measure: pnpm build && node scripts/check-size.mjs (or a temporary size print) to obtain
   the real brotli KiB per subpath; set each budget to ~1.3x measured (within the 1.2x to
   1.5x band); write the measured baseline and date in the script comment.
3. Confirm the gate passes.

Constraints:
- Budgets are a bloat tripwire, never >2x headroom.
- English-only, timeless comments. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm build && node scripts/check-size.mjs` expected: green with calibrated budgets.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 6.3 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P6 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `chore(config): finalize changelog and calibrate size budgets (6.3)`.
````

---

### Task 6.4: prepublishOnly chain + dogfood verification

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 6.2, 6.3

#### Description

Wire and prove the full pre-publish gate: `prepublishOnly` runs typecheck, lint, full coverage, build, size, and dogfood; everything green in one command.

#### Acceptance criteria

- [ ] `prepublishOnly` script chains typecheck, lint, `test:cov:all`, build, `size`, `dogfood` (order documented).
- [ ] `pnpm prepublishOnly` completes green from a clean tree.
- [ ] Dogfood validates both subpaths, ESM and CJS, expected exports complete.

#### Files to create / modify

- `package.json` (script), `scripts/dogfood-smoke-test.mjs` (if export list changed)

#### Agent prompt

````
You are a senior release engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11.

CURRENT PHASE: 6 (integration-docs-dogfood), Task 6.4 of 5

PRECONDITIONS
- Tasks 6.2 and 6.3 done.

REQUIRED READING (only these):
- package.json scripts block; ../nest-logger/package.json prepublishOnly (sibling reference).

TASK
Wire the complete prepublishOnly chain and prove it green.

DELIVERABLES
1. package.json: prepublishOnly chaining pnpm typecheck && pnpm lint && pnpm test:cov:all &&
   pnpm build && pnpm size && pnpm dogfood (match sibling ordering where it differs, and say
   why in the PR body if adapted).
2. Run pnpm prepublishOnly from a clean tree; fix anything red; record the output summary.

Constraints:
- No gate may be skipped or weakened to get to green.
- English-only. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm prepublishOnly` expected: green end to end.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 6.4 ✅ <YYYY-MM-DD> <one-line summary>`.
5. Update the P6 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `chore(config): wire complete prepublishOnly gate (6.4)`.
````

---

### Task 6.5: Phase close: gates, dashboards, PR with Copilot review

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 6.4

#### Description

Audit the phase Definition of Done, update all dashboards, open the phase PR, obtain and address a GitHub Copilot code review, and merge with CI green.

#### Acceptance criteria

- [ ] Every P6 Definition of Done bullet in `../development_plan.md` §5 verified observable.
- [ ] Dashboards consistent (phase file, plan, README index).
- [ ] PR opened, Copilot review requested and fully addressed, merged with CI green, branch deleted.

#### Files to create / modify

- `docs/tasks/phase-06-integration-docs-dogfood.md`, `docs/development_plan.md`, `docs/tasks/README.md`

#### Agent prompt

````
You are a senior release engineer closing a phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config. This task closes Phase 6 (integration-docs-dogfood).

CURRENT PHASE: 6 (integration-docs-dogfood), Task 6.5 of 5 (LAST, phase close)

PRECONDITIONS
- Tasks 6.1 through 6.4 are ✅ and committed on branch feat/phase-06-integration-docs-dogfood.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P6: integration-docs-dogfood" (Definition of Done).
- docs/tasks/phase-06-integration-docs-dogfood.md (task index and completion log).

TASK
Audit the phase, update dashboards, and drive the phase PR through Copilot review to merge.

DELIVERABLES
1. Run and record: pnpm prepublishOnly and pnpm test:e2e. All green.
2. Verify each P6 Definition of Done bullet (e2e against built package, README completeness,
   budget band, prepublish chain); cite commands in the PR body.
3. Update dashboards (phase file 👀, plan P6 row, README index); commit
   `docs(config): close phase 6 dashboards (6.5)`.
4. `gh pr create --title "feat(config): e2e proof, public README, calibrated gates"` with
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
4. Append a Completion log entry: `- 6.5 ✅ <YYYY-MM-DD> phase merged via PR #<n>`.
5. Update the P6 row and overall progress in docs/development_plan.md §1 and the folder index
   in docs/tasks/README.md.
6. Final commit on main after merge: `docs(config): mark phase 6 complete (6.5)`.
````

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->
