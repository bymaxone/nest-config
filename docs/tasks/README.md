# Development Tasks: @bymax-one/nest-config

> **Last updated:** 2026-07-06
> **Source roadmap:** [`../development_plan.md`](../development_plan.md) · **Spec:** [`../technical_specification.md`](../technical_specification.md)

Tasks live **one file per phase** in this folder (`phase-NN-<slug>.md`). Each phase file is self-contained: context, rules-of-phase, reference docs, a task index, the tasks (each with an executable 4-backtick **Agent prompt**), and a completion log.

> **Canonical phase status lives in the plan's [Progress Dashboard](../development_plan.md#1-progress-dashboard).** This folder index mirrors it for convenience: when a phase or task changes state, update the plan dashboard first, then this table.

---

## Phase files (folder index)

| Phase | File                                                                                 | Tasks       | Status         |
| ----- | ------------------------------------------------------------------------------------ | ----------- | -------------- |
| 0     | [`phase-00-repository-scaffold.md`](./phase-00-repository-scaffold.md)               | 6 / 6       | ✅ Done        |
| 1     | [`phase-01-schema-engine.md`](./phase-01-schema-engine.md)                           | 5 / 5       | ✅ Done        |
| 2     | [`phase-02-validation-pipeline.md`](./phase-02-validation-pipeline.md)               | 5 / 5       | ✅ Done        |
| 3     | [`phase-03-dynamic-module-di.md`](./phase-03-dynamic-module-di.md)                   | 4 / 5       | 🔄 In Progress |
| 4     | [`phase-04-typed-accessor.md`](./phase-04-typed-accessor.md)                         | 0 / 4       | 📋 ToDo        |
| 5     | [`phase-05-testing-subpath.md`](./phase-05-testing-subpath.md)                       | 0 / 4       | 📋 ToDo        |
| 6     | [`phase-06-integration-docs-dogfood.md`](./phase-06-integration-docs-dogfood.md)     | 0 / 5       | 📋 ToDo        |
| 7     | [`phase-07-mutation-hardening-release.md`](./phase-07-mutation-hardening-release.md) | 0 / 5       | 📋 ToDo        |
|       | **Total**                                                                            | **20 / 39** | 🔄 In Progress |

---

## Status legend

| Symbol | Meaning     |
| ------ | ----------- |
| 📋     | ToDo        |
| 🔄     | In Progress |
| 👀     | Review      |
| ✅     | Done        |
| ⛔     | Blocked     |
| 🟡     | Partial     |

Task sizes: **S** (< ~100 LoC), **M** (~100 to 250), **L** (~250+). Priorities: **P0** (blocking), **P1** (important), **P2** (nice-to-have).

---

## Execution guidance for AI agents

> **Read this before executing any task.**

### Token economy

1. **Do not load a whole phase file**: jump to your task's block; use `Read` with `offset`/`limit`.
2. **Do not load the plan or spec entirely**: each task lists REQUIRED READING with exact sections; read only those.
3. **Do not load sibling libraries entirely** (`nest-logger`, `nest-cache`, `nest-auth`): copy only the specific file a task references.

### Branch and PR flow (mandatory, one PR per phase)

1. The FIRST task of every phase creates the working branch with `git switch -c feat/phase-NN-<slug>` (never `git checkout -b`).
2. All tasks of the phase commit to that branch with Conventional Commits: `<type>(config): <subject> (<phase>.<task>)`.
3. The LAST task of every phase (phase close) opens the PR via `gh pr create`, requests a **GitHub Copilot code review**, addresses every finding, and merges only with CI green and the review resolved (`gh pr merge --squash --delete-branch`).
4. **Never** add `Co-Authored-By`, "Generated with", or any AI-attribution line to commits, PR titles, PR bodies, or comments.

### Phase execution mode

Resolve the phase's tasks in dependency order (the `Depends on` column), execute sequentially, and after each task confirm `Status: ✅` was applied. The phase closes when all its tasks are done, the roadmap's Definition of Done holds, and the phase PR is merged.

### Self-update protocol (mandatory at the end of each task)

1. The task block's **Status** + tick its acceptance criteria.
2. The phase file's **Task index** row + the header **Progress** counter (`X / Y`).
3. The phase file's **Completion log** (append `- <id> ✅ <YYYY-MM-DD> <summary>`).
4. The phase row in the **[plan dashboard](../development_plan.md#1-progress-dashboard)** (canonical) and this README's folder index; recompute the plan's overall progress.
5. Commit with Conventional Commits, no attribution trailers.

### Blocked / review

- Blocked: set `Status: ⛔`, add `> **Blocker:** ...` under the task header, no destructive commit.
- Acceptance fails after 2 red-green cycles: set `Status: 👀` plus an inline note.

---

## Project-wide constraints (apply to every task)

- **Zero `dependencies`**: `package.json` ships `"dependencies": {}`. `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `zod` are required **peer** deps.
- **Value-free errors are a hard contract**: no raw source value ever appears in any error message, report, or serialized output; tests assert it with sentinel values.
- **Explicit DI only**: `@Inject(token)` everywhere, tokens are `Symbol`s, no `emitDecoratorMetadata` in the build.
- **Code-Craft Standard**: TS strict (no `any`, no suppressions); **100% coverage in both jest configs**; mutation **break 95** (high 99 / low 95) pre-release; functions <= 50 lines, files <= 800; `@fileoverview` + `@layer` header per file; official-docs-first (confirm Zod v4 and NestJS 11 APIs against current docs, never memory); English-only, timeless comments (no Phase/Task references in committed code).
- **CI green from the first PR**: the four workflows (`ci`/`codeql`/`scorecard`/`release`) are created in Phase 0; every gate is incremental-safe; mutation is a pre-release gate only; `release.yml` is tag-driven with OIDC provenance.
- **Bounded test execution**: jest `maxWorkers: '50%'`; suites run sequentially; never run this package's tests in parallel with another package's suites.
- **No placeholder files**: never create `.gitkeep` or pre-create empty directories.
- **No em dashes** anywhere in code or docs.
