# AGENTS.md

`@bymax-one/nest-config` is a **published library**: the typed and validated environment
configuration entry point for NestJS 11 applications, built on Zod v4. It validates the process
environment exactly once at bootstrap, aggregates every violation into a single error, and hands
the DI container a deep-frozen configuration object. Anything merged here reaches consumers as an
npm release, so the public surface and the error output are the two things a change is most likely
to break.

This repository has no `CLAUDE.md`. The contract is spread across `CONTRIBUTING.md`, `README.md`
(the API reference, the security model and the error catalog) and `docs/technical_specification.md`.
This file does not restate them. What follows is the review layer.

## Code Review Rules

<!-- shared:begin -->
<!--
  CANONICAL COPY: bymaxone/.github → agents/code-review-rules.md
  Do not edit this block in a consuming repository. It is replaced wholesale by
  the `agents-sync` reusable workflow, so a local edit is reverted on the next
  run. Change it here, cut a release, and every repository is offered the update.

  Repository-specific rules go OUTSIDE this block, below the closing marker.
-->

These rules hold in every Bymax repository. What is specific to this one is written after this
block, and the two are read together.

The pipeline already enforces formatting, linting, dependency policy, coverage and — where the
repository has one — the mutation gate. Do not spend a review on a **violation** of one of those: it
is a red check, not a comment. What follows is what CI cannot see.

**A change to the enforcing configuration is the opposite case, and it is in scope.** Every gate runs
the configuration from the branch under review — that branch's lint config, its coverage thresholds,
its mutation thresholds. So a pull request that deletes a rule, lowers a threshold or widens an
ignore glob turns the check **green**, because a gate reports on the rules it was handed. For those
diffs the review is the only independent check there is, and a weakened gate needs the same
justification a suppression does.

### A finding names what it read

Every factual claim in a review — about a library's API, about this repository's history, about what
a file contains — has to come from something read in the tree under review, and the finding should
say which. A claim assembled from recollection is likely to describe a previous version of whatever
it is about.

**Safe path**, by the kind of claim:

| Claim about                         | Read this                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| A library's API **shape**           | `node_modules/<pkg>/dist/**/*.d.ts` in this tree                               |
| A library's **runtime behaviour**   | that version's changelog entry, its documentation, or a test that exercises it |
| Commit authorship, dates or history | `git log --format='%an <%ae> / %cn <%ce>' <sha>`                               |
| What a file contains                | the file at the revision under review, not an earlier one                      |

The first two rows are separate on purpose, and the rule below says why: a field can stay optional
in the published type while becoming mandatory in behaviour. A `.d.ts` settles what a signature
accepts and nothing about what the implementation does with it, so a behavioural claim resting on
one is unfounded.

Weight the checking by what acting on the finding would cost. A comment that asks for a reworded
sentence is cheap to be wrong about; one that asks for history to be rewritten, a merge reverted, or
a release pulled is not — verify that class before raising it, and raise it at the severity the
evidence supports rather than the severity the consequence would deserve if true.

### A dependency upgrade migrates every call site, not only the ones that fail to compile

When an upgrade tightens a contract, the compiler catches only the call sites whose **shape**
changed. A field that stays optional in the published type while becoming mandatory in behaviour
compiles, passes the unit suite, and fails in production.

A `@bymax-one/*` version number carries **no compatibility information** while the libraries are
pre-stable: breaking changes ship in minor and patch releases by explicit policy, so `^` and `~`
protect against nothing. The migration note under **Apply to a derived backend** in the library's own
changelog is the compatibility contract.

**Safe path:** read **every** changelog entry from the version being replaced up to the proposed
one, not only the proposed one's, and check every call site they name — not only the ones the
compiler rejected. Upgrades routinely skip releases, and the entry that matters is often not the
last one: adopting `@bymax-one/nest-cache` 1.1.0 → 1.2.1 skipped 1.2.0, where a namespace-validation
security fix lives; 1.2.1's own entry is a field rename. Diff the `.d.ts` of the **previously adopted** version against
the **proposed** one — `npm pack` both, and name the two versions. Reaching for "the installed
declarations" is the trap: in a checkout of the branch under review the installed tree is already
the new version, so that diff compares a release with itself and shows nothing.

### Settled decisions are not review findings

Both are settled deliberately, and reopening either costs a round trip and changes nothing:

- **Do not propose a major version bump** for a breaking change in a `@bymax-one/*` library, and do
  not assert that this ecosystem follows strict SemVer. Until an API is declared stable, breaking
  changes ship in minor and patch releases; the migration note carries the compatibility information
  the number does not. If a document claims strict SemVer, the finding is that the claim is wrong —
  not that the version should be raised.
- **Do not propose pinning `bymaxone/.github` reusable workflows to a commit SHA.** They are
  referenced by the `@v1` alias on purpose: a fix has to land once and reach every repository, the
  tag is immutable and the alias moves only on a release, and pinning was measured to cost ~58
  dependency pull requests to propagate one change. Third-party actions are the opposite case and
  **are** pinned by SHA.

**Safe path:** if you believe a settled decision is now wrong, say so as a question in the pull
request rather than as a finding.

### Suppressions are refusals, not exceptions

`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable` in any form,
`as unknown as` laundering a real type error, `istanbul ignore`, and in Rust `#[allow(...)]` over a
lint gate or `unsafe` without a `// SAFETY:` comment are blocking findings.

Anything a configured gate already reports belongs to the gate, not to a review: where a repository
lints `no-explicit-any` as an error — most do — an `as any` is a red check, and raising it here only
duplicates it. Check the repository's lint configuration before reporting a suppression rather than
assuming the list is exhaustive in either direction.

A failing gate means the code is wrong, the type is wrong, or the rule is wrong. **Safe path:** fix
whichever it is. Changing a rule's configuration with a stated reason is legitimate; scattering
per-call-site silencers is not.

### Comments state constraints, never history

A comment must read as true for whoever opens the file next. Flag any comment that narrates what a
previous version did, names a phase, task, ticket or review round, or explains a change rather than
the code. **Safe path:** state the constraint that still holds, and let `git log` carry the history.

### Size and layering

Functions over **50 lines** and nesting deeper than four levels are findings in the repository's own
source and test directories. Every non-trivial source file opens with a header stating its purpose
and its layer, and every exported symbol carries a doc comment.

**The 800-line file limit applies to what a change introduces, not to what it inherits.** A
repository that already carries a file past the line — a generator, a long end-to-end suite — would
otherwise produce a finding on every pull request touching three lines of it, which the author
cannot act on and did not cause. Raise it for a **new** file over the limit, or when a change pushes
a file past it or materially grows one already over.

Markdown, generated output and lockfiles are **out of scope**: a changelog is an append-only log that
only grows, a lockfile is generated, and neither has layers. Reporting their length is a false
positive on every dependency bump and every release note.

**Safe path:** extract by responsibility rather than by line count — the limit is a symptom, and one
file doing two jobs is the defect.

### No placeholders for empty directories

`.gitkeep`, `.keep` and pre-created empty directory skeletons do not belong in the tree. A directory
exists when there is a real file to put in it. **Safe path:** document the intended structure in a
plan or README, and let the first real file create the path.

### Language and attribution

Everything published is English — source, comments, tests, commit messages, pull request titles and
bodies, `README.md`, `CHANGELOG.md` and everything under `.github/`. Bymax projects keep `docs/` in
**Portuguese** by explicit decision; do not report Portuguese there as a finding.

No commit, pull request, comment or code may attribute authorship to an AI assistant or coding tool,
in any form. **This governs text a change introduces** — a trailer, a "generated with" line, a
signature in a comment or a description.

Git's own author and committer fields are set by the contributor's git configuration rather than by
anything in the diff. Before reporting one as a violation, read it:
`git log -1 --format='%an <%ae> / %cn <%ce>' <sha>`. The claim is trivially checkable and expensive
to act on — it asks for history to be rewritten.

<!-- shared:end -->

## Where this repository narrows a shared rule

The block above holds across every Bymax repository. What follows is the sharper form five of its
rules take here, plus the one thing about this library a reviewer cannot infer from the tree.

### The public surface is `src/index.ts`, and `./internal` is not it

The package publishes three entry points. `./internal` resolves at runtime and appears in the
`exports` map because it has to — the entry points are separate bundles, and a class copied into
two of them is two different injection tokens — but it promises nothing and is covered by no
compatibility guarantee. `src/index.ts` decides what is public; an export missing from it is not
API even though `@bymax-one/nest-config/internal` imports it successfully.

Two findings follow, in opposite directions. Treating a change to an `./internal`-only export as a
breaking change is **wrong** — `resolveSourceNames`, `createValidatedConfig` and the
`SourceBinding` shape are reachable there and are free to move, and a name that reaches neither
barrel (`NamespacePrefix`, `resolveNamespacePrefixes`) is module-private and freer still. Adding a
name to `src/index.ts` is the real finding: it is new public surface, it is permanent, and it is
raised with the maintainer before a version number is written rather than absorbed into a release.

### The 50-line limit is the `it()` callback, not the `describe()` group

`describe` is a grouping construct, not a unit of work: it holds a shared fixture and the cases that
read it. Measuring it against the function limit flags the file's structure rather than anything a
change did, and it does so retroactively — the pre-existing groups in `src/env-validator.spec.ts`
run to 89, 149 and 189 lines, so the reading produces findings on suites nobody touched.

The unit that has to stay small is the `it()` callback, and it does: the largest in
`src/env-validator.spec.ts` is 40 lines, and every case added with the open-namespace opt-out is
between 16 and 29. One is genuinely over — the inline-snapshot contract test in
`src/source-mapping.spec.ts`, at 60 lines — and it is over because the snapshot is the assertion.

**Safe path**, and it is the shared rule's own: extract by responsibility. A new behaviour gets its
own `describe` beside the existing ones, which is what growth looks like here; splitting a cohesive
group into sub-groups to reach a line count is the extraction-by-line-count the shared rule names as
the wrong move.

### A `// Stryker disable` directive is not a suppression

The shared suppression policy is zero-tolerance for `eslint-disable`, `@ts-ignore`, `as any` and
their kin, and that holds here. A Stryker directive is a different thing and is **required** by this
repository's mutation policy: an equivalent mutant carries its reason on the line it applies to, in
the form `// Stryker disable next-line <Mutator>: <reason>`, and `pnpm check:mutants` fails the
build when one parses without a reason. `docs/mutation_testing_results.md` argues every equivalence
in the repository.

What **is** a finding: a directive without a reason, a reason that asserts equivalence without
saying how it was checked, or a directive placed over a mutant the suite could kill. The last one is
the rule that matters — a killable mutant is never disabled to raise a number, which is why
`toScreamingSnake`'s acronym regex stays a counted survivor in the denominator instead of being
silenced.

### The version number carries no compatibility information, and a major is not on the table

This library is pre-stable under the interim policy shared across the `@bymax-one/*` libraries:
breaking changes ship in minor and patch releases, the migration note in `CHANGELOG.md` is the
compatibility contract, and the number is the maintainer's call. A review that proposes a major
version bump, or that asserts the repository adheres to strict SemVer, is stating something the
project has decided against — correct the assertion rather than escalating the number.

### `docs/` is English in this repository

The shared rule notes that Bymax projects keep `docs/` in Portuguese by explicit decision. This one
does not: every file under `docs/` is English, as are `README.md`, `CHANGELOG.md` and every comment,
JSDoc, test name and error message. There is no Portuguese carve-out here to defend.

### A new namespace claims its entire variable prefix

Under `strict`, a declared namespace rejects every source variable starting with its
SCREAMING_SNAKE_CASE prefix that matches no declared leaf — including variables this application
never reads because another program does. A namespace named `otel` claims `OTEL_*` and would reject
the OpenTelemetry SDK's own variables; one named `redis` claims `REDIS_*` and would reject a
`REDIS_PORT` that only a compose file reads.

So a change that adds a namespace whose prefix belongs to a library, an SDK or a tool is incomplete
without either `meta({ open: true })` on that namespace or a stated reason for claiming the prefix
whole. The trade-off the flag makes — an open namespace cannot tell a foreign variable from a
misspelled local one — is documented under **Strict mode and shared prefixes** in `README.md`, and
a review that proposes closing that hole should read it first.
