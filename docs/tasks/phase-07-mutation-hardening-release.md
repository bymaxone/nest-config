# Phase 7: mutation-hardening-release

> **Status**: 📋 ToDo · **Progress**: 0 / 5 tasks · **Last updated**: 2026-07-06
> **Source roadmap**: [`../development_plan.md`](../development_plan.md) §5 (P7)
> **Source spec**: [`../technical_specification.md`](../technical_specification.md) §9.3, §10

---

## Context

This phase takes the package from feature-complete to released: the Stryker baseline run, one concentrated survivor-hardening pass, documentation of genuine equivalent mutants, the final run at or above the break threshold of 95, the npm publish dry run against the public registry, and the provenance release from CI via OIDC with the version tag.

Phase 6 is merged. No new features and no API changes are allowed; if one is needed, the corresponding earlier phase reopens. **Precondition for the release tasks: the repository must be public** so provenance and the security workflows (CodeQL, Scorecard) are effective.

---

## Rules-of-phase

1. **Mutation runs are a release gate, not a per-commit gate**: they run here, in concentrated sessions.
2. **Test hardening must not lower readability or couple tests to implementation details**; kill mutants with behavioral assertions.
3. Genuine equivalent mutants are documented with reasons in `docs/mutation_testing_results.md`; **no blanket disables** (a narrow inline disable with justification is acceptable only for a proven equivalent).
4. Release authentication is **OIDC only**; no long-lived npm tokens anywhere.
5. **Conventional Commits** scope `config`: `<type>(config): <subject> (7.N)`. Never add `Co-Authored-By`, "Generated with", or any AI-attribution line anywhere.

---

## Reference docs

- [`../development_plan.md`](../development_plan.md) §5 "P7: mutation-hardening-release".
- [`../technical_specification.md`](../technical_specification.md) §9.3 (publishing), §10 (quality gates).

---

## Task index

| ID | Task | Status | Priority | Size | Depends on |
|---|---|---|---|---|---|
| 7.1 | Branch + mutation plan + Stryker baseline run | 📋 ToDo | P0 | M | none |
| 7.2 | Survivor hardening pass | 📋 ToDo | P0 | L | 7.1 |
| 7.3 | Equivalents documentation + final run at score >= 95 | 📋 ToDo | P0 | S | 7.2 |
| 7.4 | Release readiness: repository public, publish dry run, tag and provenance release | 📋 ToDo | P0 | M | 7.3 |
| 7.5 | Phase close: post-publish smoke, dashboards, PR with Copilot review | 📋 ToDo | P0 | S | 7.4 |

---

## Tasks

### Task 7.1: Branch + mutation plan + Stryker baseline run

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: none

#### Description

Create the phase branch, author `docs/mutation_testing_plan.md` (targets, thresholds, known-risk areas), and produce the Stryker baseline: full run, score recorded, survivors cataloged by file.

#### Acceptance criteria

- [ ] Branch `feat/phase-07-mutation-hardening-release` created with `git switch -c`.
- [ ] `docs/mutation_testing_plan.md` states thresholds (high 99 / low 95 / break 95), the target file list, and the session strategy.
- [ ] Baseline run completes; score and survivor list (file, mutator, line) recorded in the plan document.
- [ ] Run executed with bounded resources (Stryker concurrency capped; no parallel suites).

#### Files to create / modify

- `docs/mutation_testing_plan.md`
- `stryker.config.json` (concurrency cap if missing)

#### Agent prompt

````
You are a senior test-quality engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11.
Feature-complete at 100% coverage; this phase hardens test assertiveness via mutation testing.

CURRENT PHASE: 7 (mutation-hardening-release), Task 7.1 of 5 (FIRST)

PRECONDITIONS
- Phase 6 merged; pnpm prepublishOnly green on main.

REQUIRED READING (only these):
- stryker.config.json; docs/development_plan.md §5 "P7" scope.
- ../nest-logger/docs/mutation_testing_plan.md (structure reference).

TASK
Create the phase branch, the mutation plan document, and the baseline run.

DELIVERABLES
1. `git switch -c feat/phase-07-mutation-hardening-release` (never git checkout -b).
2. docs/mutation_testing_plan.md: thresholds (high 99, low 95, break 95), mutated file list
   (src/**, excluding specs and barrels per config), risk notes (validator branch density,
   formatter string mutants, deep-freeze cycle branch), session strategy (baseline, one
   hardening pass, equivalents documentation, final run).
3. Ensure stryker.config.json caps concurrency (e.g. concurrency 2) so the run stays within
   bounded resources; run pnpm mutation; record the score and the survivor catalog (file,
   mutator, line, brief note) in the plan document.

Constraints:
- Do not fix survivors yet (next task); this task is measurement and planning.
- Never run the mutation suite concurrently with other test workloads.
- English-only, timeless content. No em dashes. No .gitkeep.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR titles,
  PR bodies, or comments.

Verification:
- `pnpm mutation` expected: completes; report generated; score recorded in the plan doc.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row of
   docs/tasks/phase-07-mutation-hardening-release.md.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 7.1 ✅ <YYYY-MM-DD> baseline score <score>%`.
5. Update the P7 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `test(config): add mutation plan and baseline (7.1)`.
````

---

### Task 7.2: Survivor hardening pass

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: L
- **Depends on**: 7.1

#### Description

One concentrated hardening session: for every surviving mutant, either add or sharpen a behavioral assertion that kills it, or classify it as a candidate equivalent for Task 7.3. Coverage stays at 100%; readability is not sacrificed.

#### Acceptance criteria

- [ ] Every baseline survivor is either killed by a new/sharpened test or classified as candidate-equivalent with a reason.
- [ ] No test asserts implementation internals (private call counts, exact string internals beyond the pinned public contract).
- [ ] Interim mutation run shows score at or above 95 excluding candidate equivalents.
- [ ] `pnpm test:cov:all` remains green at 100%.

#### Files to create / modify

- `src/**/*.spec.ts` (hardened tests), `docs/mutation_testing_plan.md` (classification updates)

#### Agent prompt

````
You are a senior test-quality engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11.

CURRENT PHASE: 7 (mutation-hardening-release), Task 7.2 of 5

PRECONDITIONS
- Task 7.1 done: baseline score and survivor catalog exist in docs/mutation_testing_plan.md.

REQUIRED READING (only these):
- docs/mutation_testing_plan.md (survivor catalog).
- The specific source and spec files named by each survivor (load only those).

TASK
Kill or classify every surviving mutant in one concentrated pass.

DELIVERABLES
1. For each survivor: reproduce the mutant's behavioral effect mentally; add or sharpen a
   behavioral test that kills it (assert observable outcomes: thrown error contents, returned
   values, frozen-ness, report lines). If no behavioral difference exists, mark it
   candidate-equivalent in the plan doc with the technical reason.
2. Re-run pnpm mutation (bounded concurrency); update the catalog with kill/equivalent status
   per mutant and the interim score.
3. Keep pnpm test:cov:all green at 100% throughout.

Constraints:
- Behavioral assertions only; never assert private internals or mutant-specific trivia.
- Test comments explain scenario + protected rule (timeless, English).
- No blanket Stryker disables in this task.
- No em dashes. Never add Co-Authored-By, "Generated with", or any AI-attribution line
  anywhere.

Verification:
- `pnpm mutation` expected: score >= 95 excluding candidate equivalents.
- `pnpm test:cov:all` expected: green, 100%.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 7.2 ✅ <YYYY-MM-DD> hardened, interim score <score>%`.
5. Update the P7 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `test(config): harden suites against surviving mutants (7.2)`.
````

---

### Task 7.3: Equivalents documentation + final run

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 7.2

#### Description

Document every genuine equivalent mutant with its technical reason in `docs/mutation_testing_results.md`, apply narrow justified inline disables only where the sibling convention prefers them, and produce the final run at or above the break threshold.

#### Acceptance criteria

- [ ] `docs/mutation_testing_results.md` lists final score, per-file scores, and every equivalent with file, line, mutator, and reason.
- [ ] Final `pnpm mutation` score >= 95 with `break: 95` active (build fails below).
- [ ] Any inline `// Stryker disable` is narrow (next-line), justified in the comment, and counted in the results document.

#### Files to create / modify

- `docs/mutation_testing_results.md`, source files (narrow disables only if justified)

#### Agent prompt

````
You are a senior test-quality engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11.

CURRENT PHASE: 7 (mutation-hardening-release), Task 7.3 of 5

PRECONDITIONS
- Task 7.2 done: survivors killed or classified candidate-equivalent.

REQUIRED READING (only these):
- docs/mutation_testing_plan.md (candidate equivalents).
- ../nest-logger/docs/mutation_testing_results.md (results document structure).

TASK
Document equivalents and land the final gated run.

DELIVERABLES
1. docs/mutation_testing_results.md: final score, per-file table, equivalents section (file,
   line, mutator, technical reason each), decisions on inline disables (narrow next-line with
   justification comment) versus documentation-only.
2. Final pnpm mutation run with break: 95 enforced; attach the score to the results doc.

Constraints:
- An equivalent needs a technical argument (no observable behavioral difference), not
  convenience. Anything killable by a behavioral test goes back to hardening.
- English-only, timeless content. No em dashes.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line anywhere.

Verification:
- `pnpm mutation` expected: exits green with score >= 95.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 7.3 ✅ <YYYY-MM-DD> final score <score>%`.
5. Update the P7 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commit: `docs(config): record mutation results and equivalents (7.3)`.
````

---

### Task 7.4: Release readiness: repository public, publish dry run, tag and provenance release

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: M
- **Depends on**: 7.3

#### Description

Make the repository public (precondition for effective provenance, CodeQL, and Scorecard), run the npm publish dry run against the public registry, finalize the changelog date, and cut `v0.1.0`: tag push triggers the CI release with `--provenance` via OIDC.

#### Acceptance criteria

- [ ] Repository visibility is public; CodeQL and Scorecard workflows run.
- [ ] `pnpm publish --dry-run` resolves against `registry.npmjs.org` and packs only `dist`, `LICENSE`, `README.md`, `CHANGELOG.md`.
- [ ] `CHANGELOG.md` 0.1.0 dated; version confirmed `0.1.0` in `package.json`.
- [ ] Tag `v0.1.0` pushed; `release.yml` publishes `@bymax-one/nest-config@0.1.0` with provenance; npm page shows the provenance badge.

#### Files to create / modify

- `CHANGELOG.md` (release date), git tag `v0.1.0`

#### Agent prompt

````
You are a senior release engineer working on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config, typed environment configuration for NestJS 11. First public
release: v0.1.0 to public npm with provenance from CI via OIDC.

CURRENT PHASE: 7 (mutation-hardening-release), Task 7.4 of 5

PRECONDITIONS
- Task 7.3 done: mutation gate green. pnpm prepublishOnly green.
- Repository owner authorizes flipping visibility to public (confirm with the operator if the
  gh command fails on permissions).

REQUIRED READING (only these):
- .github/workflows/release.yml; package.json (version, files, publishConfig).

TASK
Take the package through dry run to the provenance release.

DELIVERABLES
1. Make the repository public: `gh repo edit --visibility public` (this activates CodeQL and
   Scorecard; verify both workflows run afterward).
2. `pnpm publish --dry-run`: confirm registry resolution, tarball contents (dist, LICENSE,
   README.md, CHANGELOG.md only), and no warnings that would block CI publish.
3. Set the 0.1.0 date in CHANGELOG.md; commit `chore(config): date 0.1.0 changelog (7.4)`
   (this lands via the phase PR before tagging; coordinate with task 7.5 so the tag is cut
   from main after merge).
4. After the phase PR merges (task 7.5 opens it; tagging may be executed post-merge as the
   final step of this task recorded there): create and push the tag v0.1.0 from main; watch
   gh run for release.yml; confirm the npm page shows 0.1.0 with provenance.

Constraints:
- OIDC only; never configure an npm token secret.
- If any gate is red, stop and reopen the corresponding phase; never force a release.
- English-only. No em dashes. Never add Co-Authored-By, "Generated with", or any
  AI-attribution line anywhere.

Verification:
- `pnpm publish --dry-run` expected: success, correct file list.
- `npm view @bymax-one/nest-config version` expected (post-release): 0.1.0.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Bump the phase Progress counter (X / 5).
4. Append a Completion log entry: `- 7.4 ✅ <YYYY-MM-DD> v0.1.0 published with provenance`.
5. Update the P7 row in docs/development_plan.md §1 and the folder index in
   docs/tasks/README.md.
6. Commits as described in the deliverables (changelog date via the phase PR; tag from main).
````

---

### Task 7.5: Phase close: post-publish smoke, dashboards, PR with Copilot review

- **Status**: 📋 ToDo
- **Priority**: P0
- **Size**: S
- **Depends on**: 7.4

#### Description

Open and drive the phase PR (mutation docs, changelog date) through Copilot review and merge, coordinate the tag-based release, run the post-publish smoke (scratch consumer installs the released version and boots the fixture), and close every dashboard including the plan's overall status.

#### Acceptance criteria

- [ ] Phase PR merged with CI green and Copilot review fully addressed.
- [ ] Tag `v0.1.0` released via CI; post-publish smoke green: a scratch consumer (`pnpm init` + install `@bymax-one/nest-config@0.1.0`) boots the spec §13 fixture successfully.
- [ ] All dashboards final: phase file ✅ 5/5, plan P7 ✅, overall progress 8/8 (100%).

#### Files to create / modify

- `docs/tasks/phase-07-mutation-hardening-release.md`, `docs/development_plan.md`, `docs/tasks/README.md`

#### Agent prompt

````
You are a senior release engineer closing the final phase on @bymax-one/nest-config.

PROJECT: @bymax-one/nest-config. This task closes Phase 7 (mutation-hardening-release) and
the 0.1.0 release cycle.

CURRENT PHASE: 7 (mutation-hardening-release), Task 7.5 of 5 (LAST, phase close)

PRECONDITIONS
- Tasks 7.1 through 7.3 ✅ on branch feat/phase-07-mutation-hardening-release; task 7.4 dry
  run done, tag pending post-merge.

REQUIRED READING (only these):
- docs/development_plan.md §5 "P7" (Definition of Done).
- docs/tasks/phase-07-mutation-hardening-release.md (task index and completion log).

TASK
Drive the phase PR to merge, execute the tag release, run the post-publish smoke, and close
all dashboards.

DELIVERABLES
1. Update dashboards (phase file 👀, plan P7 row, README index); commit
   `docs(config): close phase 7 dashboards (7.5)`.
2. `gh pr create --title "test(config): mutation hardening and 0.1.0 release readiness"`
   with body sections Summary / What changed / Verification (mutation score, dry-run output)
   / Follow-ups. No attribution footer.
3. Request a GitHub Copilot code review; address EVERY finding; re-request until clean.
4. `gh pr merge --squash --delete-branch` with CI green; then from main: create and push tag
   v0.1.0; watch release.yml to success; verify npm shows 0.1.0 with provenance.
5. Post-publish smoke in a scratch directory outside the repo: minimal consumer installing
   @bymax-one/nest-config@0.1.0 plus NestJS 11 peers, booting the spec §13 fixture (compile
   + TestingModule boot). Record the result in the PR thread or the completion log.
6. Final dashboards on main: phase ✅ 5/5, plan P7 ✅, overall 8/8 (100%), active phase none.

Constraints:
- Never bypass a red gate. OIDC only. English-only. No em dashes.
- Never add Co-Authored-By, "Generated with", or any AI-attribution line to commits, PR
  titles, PR bodies, or comments.

Verification:
- `npm view @bymax-one/nest-config version` expected: 0.1.0.
- Scratch consumer boot expected: success.

Completion Protocol (after you finish):
1. Set this task's Status to ✅ in the per-task block and the Task index row.
2. Tick the satisfied acceptance-criteria checkboxes.
3. Set the phase header Progress to 5 / 5 and Status ✅.
4. Append a Completion log entry: `- 7.5 ✅ <YYYY-MM-DD> v0.1.0 released, smoke green`.
5. Update the P7 row and overall progress (8/8, 100%) in docs/development_plan.md §1 and the
   folder index in docs/tasks/README.md.
6. Final commit on main: `docs(config): mark phase 7 and release complete (7.5)`.
````

---

## Completion log

<!-- Append one line per completed task: - <id> ✅ YYYY-MM-DD <summary> -->
