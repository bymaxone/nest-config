# Mutation Testing Results: @bymax-one/nest-config

> **Last run:** 2026-11-13
> **Command:** `pnpm mutation:full` (Stryker 9, jest runner, `coverageAnalysis: perTest`, `ignoreStatic: true`, `break: 100`) — the cold command, which the release gate requires; `pnpm mutation` reuses stored verdicts and cannot establish it
> **Report:** [`../reports/mutation/mutation.html`](../reports/mutation/mutation.html)
> **Plan:** [`mutation_testing_plan.md`](./mutation_testing_plan.md)

## Summary

| Metric                                             | Value                      |
| -------------------------------------------------- | -------------------------- |
| **Global mutation score**                          | **100.00 %**               |
| Break threshold (`thresholds.break`)               | 100 % -> **PASS (exit 0)** |
| Aspirational target (`thresholds.high`)            | 100 % -> **reached**       |
| Killed                                             | 444                        |
| Survived                                           | 0                          |
| Timeout (counts as detected)                       | 2                          |
| Type-invalid mutants (checker-discarded, excluded) | 249                        |

Score = `(killed + timeout) / (killed + timeout + survived)` = `446 / 446` = **100.00 %**, up
from **95.74 %** and a **89.11 %** baseline. `pnpm mutation` exits green against `break: 100`,
which is also the `high` and `low` target.

The moves that produced that number are different in kind.

**95.74 % -> 99.59 % was not new tests.** The equivalents were already argued here and
left to survive. Most now carry their reason as an inline directive, so Stryker excludes
them from the denominator instead of counting them as failures to kill. The one that could not
carry a directive is dealt with below. There were no genuine coverage gaps, before or after.

**99.59 % -> 99.61 % is new code with new tests.** The `v1.1.1` fix generated 17 mutants in
`env-validator.ts`: 14 that count toward the score, all killed, and 3 the type checker discards
(the type-invalid total moves 168 -> 171). So the denominator grew by 14 while the survivor count
held at one. Nothing was silenced to get there — see the dated re-run at the end.

**99.61 % -> 99.62 % is the open-namespace opt-out, again denominator growth.** The feature
added 5 counted mutants, all killed, while the type-invalid total moved 171 -> 174. The survivor
count held at one. See the dated re-run at the end.

**99.62 % -> 99.69 % is the code added for `1.2.2`, and it first scored lower.** The new code
brought 59 counted mutants, so the denominator grew from 260 to 319. The first cold run on the
release commit scored **96.87 %** with ten survivors: the nine in the new code were genuine
coverage gaps, not equivalents, and tests killed them; the tenth is the counted survivor below.
Nothing was silenced to get there. See the dated re-run at the end.

**99.69 % -> 99.71 % is the collision check added for `1.2.3`, again denominator growth.** The
new code added 21 counted mutants, all in `env-validator.ts`, all killed, while the type-invalid
total moved 204 -> 207. The survivor count held at one.

**99.71 % -> 100.00 % removed the last survivor by changing the code, not the tests.** The
acronym boundary in `toScreamingSnake` is now a zero-width lookaround, so there is no capturing
group left whose quantifier could shrink unobserved. Every derived name is unchanged: a spec
compares the converter with an independent two-regex definition on every string up to seven
characters over `a`, `B`, `C`, `1` and `_`. Nothing was silenced, and `thresholds.break` moved
from 95 to 100 once a cold run on `main` read 341 of 341. See the dated re-run at the end.

## Approach to equivalents: documented in the source

Equivalent mutants carry their reason on the line they apply to, as
`// Stryker disable next-line <Mutator>: <reason>`, which is the convention shared across
the `@bymax-one/nest-*` libraries — see `mutation_testing_plan.md §Suppression policy`.
The argument for each is reproduced below, because the entries here carry context an
inline note cannot: what the supported two-level convention rules out, and what was
verified by running the mutant rather than reading it.

The one in `toScreamingSnake` could not carry a directive, so it stayed a counted survivor until
the converter was rewritten without the construct that made it equivalent; it is no longer in the
source.

## Hardening performed

The baseline pass added targeted behavioral assertions that killed all 17
non-equivalent survivors:

- **`errors.ts`** - the aggregated error's `name`, `code`, and `issues` are
  asserted non-configurable by proving that `delete` throws in strict mode, which
  the earlier non-writable assertions did not cover.
- **`source-mapping.ts`** - an `oldAPIKey` leaf pins the acronym-to-word boundary
  (`SERVICE_OLD_API_KEY`), killing both the blank-replacement and the
  following-character-class regex mutants.
- **`env-validator.ts`** - two same-named leaves in different namespaces prove the
  per-namespace grouping (killing the dropped-grouping and always-true-filter
  mutants); a leaf failing two checks pins the deterministic first-issue message.
- **`testing/placeholder-synthesizer.ts`** - inclusive URL and email length bounds
  at the canonical lengths (25 and 19), the lone in-range integer of an exclusive
  two-sided range, the exact `true` boolean token, and an exact length winning
  over a redundant minimum all pin the deterministic synthesized values.

## Per-file scores

| File                                 | Score    | Survivors (equivalent) |
| ------------------------------------ | -------- | ---------------------- |
| `config.module.ts`                   | 100.00 % | 0                      |
| `config.providers.ts`                | 100.00 % | 0                      |
| `config.service.ts`                  | 100.00 % | 0                      |
| `errors.ts`                          | 100.00 % | 0                      |
| `report-formatter.ts`                | 100.00 % | 0                      |
| `testing/create-test-config.ts`      | 100.00 % | 0                      |
| `testing/placeholder-synthesizer.ts` | 100.00 % | 0                      |
| `env-validator.ts`                   | 100.00 % | 0                      |
| `deep-freeze.ts`                     | 100.00 % | 0                      |
| `source-mapping.ts`                  | 100.00 % | 0                      |

`config.module-definition.ts`, `config.options.ts`, `config.tokens.ts`,
`define-env.ts`, `types.ts`, and `testing/config-testing.module.ts` produce only
type-invalid or type-guarded mutants (the checker discards them), so they carry no
runtime mutants to score.

## Equivalent mutants

Each of the following is an equivalent mutant: no test can observe a behavioral
difference, so it is silenced with an inline reason and is not a coverage gap.

Four entries that stood here were measured on 2026-11-24 by applying every mutant of the named
mutators by hand and running the specs of the file, and they did not hold. They were removed
together with their directives:

- **`deep-freeze.ts` guard.** The directive covered five mutants, not four, and three of them
  (the guard forced to `true`, `&&` turned into `||`, `typeof value === 'object'` forced to
  `true`) admit a function, which `Object.isFrozen` does not short-circuit, so it was frozen.
  A function held by the configuration is now asserted to stay unfrozen. A fourth, the guard forced to
  `false`, was already killed by the suite. Only `value !== null` forced to `true` was equivalent
  (`Object.isFrozen(null)` is `true`), and the helper that held it is gone: the guard is
  `typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)`.
- **Longest-prefix tie.** `>` to `>=` is not equivalent: two namespaces whose names derive the same
  prefix (`appCache` and `app_cache`) are accepted, and the one declared first decides whether a
  stray variable is waived. A row now states that behaviour. The directive also covered `>` to `<=`
  and `===` to `!==`, which are killable; the first is now killed by a row with an open namespace
  nested inside a closed one, in both orders.
- **Unknown-key sort comparator.** Four of its eight mutants made the comparator constant, so
  nothing was sorted, and the suite had no row with the keys out of order. The comparator is gone:
  the source keys are sorted before the loop with the engine's own `sort` and no comparator, which
  orders by UTF-16 code unit as the old comparator did, and a row supplies them out of order.
- **Plain-string clamp.** The `>` to `<=` mutant under that directive was killable and was already
  killed. The clamp now reuses `clampLength`, so there is no conditional left to silence.

## Residual survivors

None. The mutants once argued equivalent now carry an inline directive with their reason, except
the one in `toScreamingSnake`, which was removed by rewriting the converter.

---

## Re-run — 2026-08-06

| Metric             | Value        |
| ------------------ | ------------ |
| **Mutation score** | **95.74 %**  |
| Surviving mutants  | 11           |
| Break threshold    | 95 % -> PASS |

The surviving set is unchanged: all eleven are the documented equivalents above, so there was
no coverage gap left to close. The percentage moves only because the mutant total differs
slightly between runs. Three of them were re-verified during this pass by RUNNING the mutants rather
than by reading them — `toScreamingSnake` produces identical output for httpServer, HTTPServer,
HTTPSProxy, XMLHttpRequest, URLPath and IOError whether it matches one capital or a run of them;
the synthesizer's upper bound picks the same value from both arms at the point its operator
distinguishes; and `Object.isFrozen` answers true for every primitive and for null, so a value
`isFreezable` wrongly admits is returned unchanged one line later.

Inline `// Stryker disable` directives were added during this pass and then removed, because the
convention at the time was to document here instead. That convention has since been replaced by
the one in `mutation_testing_plan.md §Suppression policy`, shared across the libraries, and the
directives are back — the reason belongs on the line it explains.

Every equivalence claim in this section was checked by running the mutant, not by reading it.
Where a `// Stryker disable next-line` directive was found not to apply — above a `} catch {`, a
`.replace()` inside a method chain, a multi-line `sort(...)` argument, or anywhere inside a
builder chain — it was replaced with the block `disable`/`restore` form, or, where that does not
work either, with a plain comment at the line so the reasoning is visible rather than silently
ineffective.

---

## Re-run — 2026-08-07

| Metric             | Value           |
| ------------------ | --------------- |
| **Mutation score** | **99.59 %**     |
| Killed             | 240             |
| Surviving mutants  | 1               |
| Break threshold    | 95 % -> PASS    |
| High target        | 99 % -> reached |

No test changed and no production logic changed. Ten of the eleven equivalents argued above
now carry their reason as an inline `// Stryker disable next-line <Mutator>: <reason>`, so
Stryker excludes them from the denominator rather than counting them as mutants the suite
failed to kill. That is the whole of the move from 95.74 % to 99.59 %.

Two of the ten needed the block `disable`/`restore` form, because `next-line` binds to the
following statement and the mutants do not sit on one: the unknown-key sort comparator is a
multi-line `sort` argument, and the `restore` for it sits after the enclosing function's
closing brace so the rule cannot leak into the next declaration.

The eleventh — the acronym regex in `toScreamingSnake` (`source-mapping.ts`) — is a counted survivor and stays one.
A directive placed on the line above it was measured, not assumed, to have no effect: the
mutant still reported as surviving, because a directive does not attach to a `.replace()`
inside a method chain. The only way to silence it would be a block directive spanning the
neighbouring `.replace()`, whose own regex mutants the suite does kill, and a killable
mutant is never disabled to raise a number.

## Re-run — 2026-08-14

Measured as the release gate for `v1.1.1` (the authored `custom` message fix), on `main` at
`dd30e04`.

| Metric             | Value           |
| ------------------ | --------------- |
| **Mutation score** | **99.61 %**     |
| Killed             | 254             |
| Surviving mutants  | 1               |
| Break threshold    | 95 % -> PASS    |
| High target        | 99 % -> reached |

The score moved 99.59 % -> 99.61 % because the denominator grew, not because anything was
silenced: the fix added 14 killed mutants, all in `env-validator.ts` — the only file the
release changed executably, since the edits to `errors.ts`, `report-formatter.ts`,
`config.options.ts` and `config.providers.ts` are comments, which carry no mutants. The
survivor count did not change. `env-validator.ts` — the file the
release changed — scores **100.00 %** with **0 survivors**, including the whitespace-collapsing
regex and the reserved-default comparison, which the new tests kill by asserting the rendered
report line rather than the issue object.

The single counted survivor is unchanged: the acronym regex in `toScreamingSnake`
(`source-mapping.ts`), argued above and left in the denominator because a directive cannot
attach inside a method chain.

---

## Re-run — 2026-08-29

Measured as the gate for the open-namespace strict opt-out (`meta({ open: true })` on a
namespace), on `feat/open-namespace-strict-opt-out`.

| Metric             | Value           |
| ------------------ | --------------- |
| **Mutation score** | **99.62 %**     |
| Killed             | 259             |
| Surviving mutants  | 1               |
| Break threshold    | 95 % -> PASS    |
| High target        | 99 % -> reached |

The score moved 99.61 % -> 99.62 % by denominator growth, not by silencing: the change added 5
counted mutants, all killed, while the type-invalid total moved 171 -> 174. Both touched files
are covered — `env-validator.ts` stays at **100.00 %**, and `source-mapping.ts` rises
93.33 % -> 94.74 % (18 killed of 19 counted) because its denominator grew while its single
survivor did not move.

Read from the report rather than inferred, the five sit on the two new lines. `if (match.open)
continue` in `detectUnknownKeys` carries one counted `ConditionalExpression` (a second is
type-invalid and discarded); the suite constrains it from both sides, since a namespace declared
open must skip `OTEL_EXPORTER_OTLP_ENDPOINT` while a closed one declared beside it must still
report `DATABASE_TYPO`. `readOpenFlag`'s `meta()?.open === true` carries the other four — two
`ConditionalExpression`, one `EqualityOperator` and one `BooleanLiteral` — killed by the pair of
tests that open a namespace on the literal `true` and leave it closed on the string `'true'`,
which is what pins the flag to the literal rather than to truthiness.

The single counted survivor is unchanged: the acronym regex in `toScreamingSnake`
(`source-mapping.ts`), argued above and left in the denominator because a directive cannot
attach inside a method chain.

---

## Re-run — 2026-09-04

The release gate for `v1.2.0`. Command: **`pnpm mutation:full`** — cold, with
`reports/stryker-incremental.json` (1502091 bytes) deleted before the run, so every
mutant was executed rather than replayed. Measured on the tree that gets tagged: no
file under `src/` differs between this run and the tagged commit.

An earlier attempt used `pnpm mutation` and finished in 59 seconds. It reported the
same score and could not clear this gate: `incremental: true` meant it reused stored
verdicts, and the bar asks for the survivor's argument to have been checked by
_executing_ the mutant. Recording the command beside the score is what makes the
difference legible — a score without one is not evidence, and duration does not
substitute, since this cold run took 3m02s against incremental runs of 3m06s and 59s.

| Metric                       | Value           |
| ---------------------------- | --------------- |
| **Mutation score**           | **99.62 %**     |
| Killed                       | 259             |
| Surviving mutants            | 1               |
| Timeout                      | 0               |
| Break threshold              | 95 % -> PASS    |
| High target                  | 99 % -> reached |
| Ignored — `ignoreStatic`     | 19              |
| Ignored — directive          | 18              |
| CompileError (type-invalid)  | 174             |
| RuntimeError (unadjudicated) | **0**           |

The last three are listed separately because collapsing them would hide what they
are. `CompileError` is the type checker discarding a mutant and is a property of the
toolchain. `RuntimeError` is a mutant the harness could not adjudicate at all, and
there are none here.

**`Ignored` is two categories wearing one label, and only one of them is a human
decision.** 19 are static mutants dropped by `ignoreStatic: true` — a configuration
property, closer to `CompileError` than to a judgement, and outside what
`pnpm check:mutants` can see. The other 18 come from four `// Stryker disable`
directives, each carrying an inline reason the check fails the build without.
Counting them together would credit a config flag with the scrutiny the directives
get.

**Neither kind is executed, and the directive kind can rot.** An ignored mutant is
excluded before the run, so a cold run does not re-adjudicate it: if a later test
change makes one of those 18 killable, the directive keeps suppressing it and
nothing reports the drift. `check:mutants` enforces that a reason exists and
reaches the report; it cannot tell whether the reason is still true. So
"re-verified by running the mutant" in the release gate means the argument was
checked by execution **when it was written** — recorded in the entries above —
rather than re-checked on every release. Re-establishing it means removing the
directive and running, which is a deliberate audit rather than something a gate
performs.

Unchanged in every respect from the previous run, which is the result the release
needed: the ESLint 10 migration, three dependency waves and a test-file split moved
no production source, and the mutant set moved with it. Every file scores 100.00
except `source-mapping.ts` at 94.74 — 18 killed of 19 — for the single documented
survivor, the acronym-quantifier regex argued above.

The gate this clears is stated in `CONTRIBUTING.md`: 100%, or every survivor a
documented, re-verified equivalent. One survivor, argued here, and the argument
checked by running the mutant rather than reading it. A survivor that appeared
without such an argument would block the release regardless of the percentage.

Two things measured alongside it, because a score alone does not establish either.

**The score is not bounded by double fidelity here.** A clean score cannot detect an
over-permissive fake, since the mutant that would expose one dies against the same
fake that hides it. The suite carries three `jest.fn()`, all in
`config.providers.spec.ts` for `onValidationError` — a caller-supplied callback the
code _invokes_, not a collaborator whose fabricated response the code consumes, so
there is no faked behaviour able to hide a defect. The assertions discriminate on
the argument rather than the call: `toHaveBeenCalledWith` pins the exact issue list
taken from the real thrown error. Every other spec declares `Mocks: none`.

**Run duration is not a stable figure, and it does not identify the command.** The
cold run took **3m02s**, against a recorded 6-minute cold figure and incremental
runs of 3m06s and 59s on this same tree; sibling repositories measured spreads near
2x on an identical command. So elapsed time neither predicts the next run nor tells
you whether the last one was cold — only the script invoked and the presence of
`reports/stryker-incremental.json` do. Schedule against the outlier and finish
early; a duration read off one run is not a budget, and it is not evidence.

---

## Re-run — 2026-10-31

The release gate for `v1.2.2`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by
the `Mutation (full)` workflow dispatched on `main` (the reusable workflow refuses any other ref,
because it saves the shared incremental baseline).

**First run, on the release commit `bc82461`: 96.87 %, ten survivors.** Run
[41245343949](https://github.com/bymaxone/nest-config/actions/runs/41245343949): 308 killed, 1
timeout, 10 survived. One was the counted survivor below. Nine were in code added since `1.2.1`:
the format lookup and three wrapper cases of the placeholder synthesizer, the `cause` descriptor
flags in the provider, and the namespace decision in the validator. Each was reproduced by
applying the mutant to the real source and running the covering spec, which passed, so each was a
missing test rather than an equivalence.

**Second run, after tests killed them, on `4e26166`.** Run
[41246881772](https://github.com/bymaxone/nest-config/actions/runs/41246881772). Before it, each
of the nine mutants was applied by hand against the new tests and each made one fail.

| Metric                       | Value           |
| ---------------------------- | --------------- |
| **Mutation score**           | **99.69 %**     |
| Killed                       | 317             |
| Surviving mutants            | 1               |
| Timeout                      | 1               |
| Break threshold              | 95 % -> PASS    |
| High target                  | 99 % -> reached |
| Ignored — `ignoreStatic`     | 32              |
| Ignored — directive          | 18              |
| CompileError (type-invalid)  | 204             |
| RuntimeError (unadjudicated) | **0**           |

The single survivor is the acronym regex in `toScreamingSnake` (`source-mapping.ts:65`), still
equivalent: a brute force over 5,380,839 strings (alphabet `a b A B C Z 1 _ z`, length up to 7)
comparing the whole function with the regex as written and with the mutant gave no differing
output. The 18 directive-ignored mutants come from four directives.

---

## Re-run — 2026-10-31 (1.2.3)

The release gate for `v1.2.3`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by
the `Mutation (full)` workflow dispatched on `main` at `59cbbaa`, the commit that merged the
collision check. Run [41250741481](https://github.com/bymaxone/nest-config/actions/runs/41250741481);
the job concluded `success`, and the run did not need a second pass.

| Metric                      | Value           |
| --------------------------- | --------------- |
| **Mutation score**          | **99.71 %**     |
| Killed                      | 338             |
| Surviving mutants           | 1               |
| Timeout                     | 1               |
| Break threshold             | 95 % -> PASS    |
| High target                 | 99 % -> reached |
| CompileError (type-invalid) | 207             |

`env-validator.ts` went from 90 killed to 111, 100.00 % with no survivor: the 21 added mutants
are the check itself, `assertDistinctVariables`. The change touched no other file's mutants.

The single survivor is unchanged: the acronym regex in `toScreamingSnake`
(`source-mapping.ts:65`, `[A-Z]+` -> `[A-Z]`), argued above and left in the denominator because a
directive cannot attach inside a method chain.

## Re-run — 2026-11-01

The gate for `thresholds.break: 100`. Command: **`pnpm mutation:full`**, run cold on a hosted runner
by the `Mutation (full)` workflow dispatched on `main`, which only runs on the default branch. Two
runs bound the result.

Run [41311571756](https://github.com/bymaxone/nest-config/actions/runs/41311571756) on `488b5d9`,
the commit that rewrote `toScreamingSnake`, scored **99.13 %** (344 of 347): the survivor in
`source-mapping.ts` was gone, and three new ones appeared, `StringLiteral` mutants on the
module-level message constants of `env-validator.ts`. In the previous run the same three were
`Ignored` as static. The README Quick Start spec required the library inside its test, so the
module was first evaluated during a test and the report recorded those constants as covered by that
one test, which never reads them. The library is now imported at the top of the spec, and a spec
pins the three message constants by value, so mutating any of them fails a test whatever the
classification.

Run [41314000750](https://github.com/bymaxone/nest-config/actions/runs/41314000750) on `b9680fe`
concluded `success`:

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 340           |
| Surviving mutants           | 0             |
| Timeout                     | 1             |
| Ignored                     | 50            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 207           |

Score = `341 / 341`.

## Re-run — 2026-11-01 (1.2.4)

The release gate for `v1.2.4`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `9659132`. Run
[41345796905](https://github.com/bymaxone/nest-config/actions/runs/41345796905); the job
concluded `success`.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 402           |
| Surviving mutants           | 0             |
| Timeout                     | 2             |
| Ignored                     | 50            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 236           |

Score = `404 / 404`.

## Re-run — 2026-11-01 (1.2.5)

The release gate for `v1.2.5`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `9a64d2d`. Run
[41358217705](https://github.com/bymaxone/nest-config/actions/runs/41358217705); the job
concluded `success`.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 444           |
| Surviving mutants           | 0             |
| Timeout                     | 2             |
| Ignored                     | 51            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 249           |

Score = `446 / 446`.

## Re-run — 2026-11-13 (1.2.6)

The release gate for `v1.2.6`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `1b3f4ce`. Run
[43084916520](https://github.com/bymaxone/nest-config/actions/runs/43084916520); the job
concluded `success`. No runtime source changed between that commit and the release commit.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 444           |
| Surviving mutants           | 0             |
| Timeout                     | 2             |
| Ignored                     | 51            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 249           |

Score = `446 / 446`.

## Re-run — 2026-11-14 (1.2.7)

The release gate for `v1.2.7`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `a539799`. Run
[43572655628](https://github.com/bymaxone/nest-config/actions/runs/43572655628); the job concluded
`success`, and the inventory check reported that all 379 unit tests ran in the mutation run, with
5 exempt spec files left out. No runtime source changed between that commit and the release commit.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 481           |
| Surviving mutants           | 0             |
| Timeout                     | 3             |
| Ignored                     | 57            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 281           |

Score = `484 / 484`.

## Re-run — 2026-11-17 (1.2.8)

The release gate for `v1.2.8`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `ecca9a6`. Run
[44074040252](https://github.com/bymaxone/nest-config/actions/runs/44074040252); the job concluded
`success`, and the inventory check reported that all 384 unit tests ran in the mutation run, with
7 exempt spec files left out. No runtime source changed between that commit and the release commit.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 491           |
| Surviving mutants           | 0             |
| Timeout                     | 3             |
| Ignored                     | 57            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 287           |

Score = `494 / 494`.

## Re-run — 2026-11-17 (1.2.9)

The release gate for `v1.2.9`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `e85ea46`. Run
[44082801271](https://github.com/bymaxone/nest-config/actions/runs/44082801271); the job concluded
`success`, and the inventory check passed. No runtime source changed between that commit and the release commit.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 491           |
| Surviving mutants           | 0             |
| Timeout                     | 3             |
| Ignored                     | 57            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 285           |

Score = `494 / 494`.

## Re-run — 2026-11-17 (1.2.10)

The release gate for `v1.2.10`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `47c0a49`. Run
[44144374494](https://github.com/bymaxone/nest-config/actions/runs/44144374494); the job concluded
`success`, and the inventory check passed: all 425 unit tests ran in the mutation run, with 11 exempt spec
files left out.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 501           |
| Surviving mutants           | 0             |
| Timeout                     | 3             |
| Ignored                     | 57            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 288           |

Score = `504 / 504`.

## Re-run — 2026-11-17 (1.2.11)

The release gate for `v1.2.11`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `6020c4b`. Run
[44181206230](https://github.com/bymaxone/nest-config/actions/runs/44181206230); the job concluded
`success`, and the inventory check passed: all 482 unit tests ran in the mutation run, with 11 exempt spec
files left out.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 539           |
| Surviving mutants           | 0             |
| Timeout                     | 2             |
| Ignored                     | 57            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 302           |

Score = `541 / 541`.

## Re-run — 2026-11-17 (1.2.12)

The release gate for `v1.2.12`. Command: **`pnpm mutation:full`**, run cold on a hosted runner by the
`Mutation (full)` workflow dispatched on `main` at `bf73484`. Run
[44191190926](https://github.com/bymaxone/nest-config/actions/runs/44191190926); the job concluded
`success`, and the inventory check passed: all 521 unit tests ran in the mutation run, with 11 exempt spec
files left out.

| Metric                      | Value         |
| --------------------------- | ------------- |
| **Mutation score**          | **100.00 %**  |
| Killed                      | 558           |
| Surviving mutants           | 0             |
| Timeout                     | 3             |
| Ignored                     | 59            |
| Break threshold             | 100 % -> PASS |
| CompileError (type-invalid) | 299           |

Score = `561 / 561`.
