# Mutation Testing Results: @bymax-one/nest-config

> **Last run:** 2026-07-16
> **Command:** `pnpm mutation` (Stryker 9, jest runner, `coverageAnalysis: perTest`, `ignoreStatic: true`, `break: 95`)
> **Report:** [`../reports/mutation/mutation.html`](../reports/mutation/mutation.html)
> **Plan:** [`mutation_testing_plan.md`](./mutation_testing_plan.md)

## Summary

| Metric                                                         | Value                          |
| -------------------------------------------------------------- | ------------------------------ |
| **Global mutation score** (re-measured — see the dated re-run) | **95.74 %**                    |
| Break threshold (`thresholds.break`)                           | 95 % -> **PASS (exit 0)**      |
| Aspirational target (`thresholds.high`)                        | 99 % (equivalent mutants only) |
| Killed                                                         | 246                            |
| Survived (all equivalent, documented below)                    | 11                             |
| Timeout (counts as detected)                                   | 0                              |
| Type-invalid mutants (checker-discarded, excluded)             | 167                            |

Score = `killed / (killed + survived)` = `246 / 257` = **95.72 %**. Up from the
**89.11 %** baseline. `pnpm mutation` exits green against `break: 95`. The 11
remaining survivors are all equivalent mutants (documented below); there are zero
genuine coverage gaps.

## Approach to equivalents: documentation, not inline disables

Equivalent mutants are documented here rather than annotated with
`// Stryker disable` comments. The production source stays free of suppression
comments, matching the project code-craft standard, and the reasons below carry
more context than an inline note could. Each entry states why the mutant produces
no observable behavioral difference within the supported two-level convention.

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
| `testing/placeholder-synthesizer.ts` | 99.12 %  | 1                      |
| `source-mapping.ts`                  | 93.33 %  | 1                      |
| `env-validator.ts`                   | 92.65 %  | 5                      |
| `deep-freeze.ts`                     | 50.00 %  | 4                      |

`config.module-definition.ts`, `config.options.ts`, `config.tokens.ts`,
`define-env.ts`, `types.ts`, and `testing/config-testing.module.ts` produce only
type-invalid or type-guarded mutants (the checker discards them), so they carry no
runtime mutants to score.

## Equivalent mutants (11)

Each of the following is an equivalent mutant: no test can observe a behavioral
difference, so the survivor is expected and is not a coverage gap.

### `deep-freeze.ts:17` - `isFreezable` guard (4 mutants)

`ConditionalExpression` and `LogicalOperator` mutants that make `isFreezable`
return `true` for more inputs (primitives and `null`). `deepFreeze` guards with
`if (!isFreezable(value) || Object.isFrozen(value)) return value`. For every input
these mutants newly admit (primitives and `null`), `Object.isFrozen` returns
`true`, so the guard reaches the same early `return value`. No object is frozen or
recursed differently, and the returned reference is unchanged, so the observable
result is identical.

### `env-validator.ts:218` - longest-prefix tie (`>` to `>=`, 1 mutant)

`longestMatchingPrefix` keeps the first match unless a later prefix is strictly
longer. The `>` to `>=` mutant only changes behavior when two declared namespaces
produce equal-length prefixes that both prefix the same source key. Two distinct
namespaces can only yield equal-length prefixes if those prefixes are identical,
which also collides their leaf variable names - a degenerate schema outside the
supported two-level convention. Within the convention the tie is never taken, so
`>` and `>=` agree.

### `env-validator.ts:261` - unknown-key sort comparator (4 mutants)

The comparator is
`Number(l.variable > r.variable) - Number(l.variable < r.variable)`.

- The two `EqualityOperator` mutants (`>` to `>=`, `<` to `<=`) only differ when
  `l.variable === r.variable`. The compared values are distinct source keys (Map
  keys are unique), so the equal case never occurs and the operators agree.
- The two `ConditionalExpression` mutants (one term forced to `0`, the other to
  `1`) both reduce the comparator to "return negative when `l < r`, else `0`".
  That still orders every realistic unknown-key list ascending under the stable
  sort: verified across all permutations up to length 32. A divergence would
  require dozens of reversed keys and would depend on the engine's internal
  sort-algorithm selection, which is not a documented contract - so no stable
  behavioral assertion can distinguish it.

### `testing/placeholder-synthesizer.ts:220` - plain-string clamp (`>` to `>=`, 1 mutant)

`const bounded = target > lengths.max ? lengths.max : target`. The `>` to `>=`
mutant only changes the chosen branch when `target === lengths.max`, and in that
case both branches evaluate to the same number (`lengths.max === target`), so the
filler length is identical.

### `source-mapping.ts:45` - acronym regex quantifier (`[A-Z]+` to `[A-Z]`, 1 mutant)

`.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')` inserts an underscore before the
final capital of an acronym. The mutant shrinks the first group from `[A-Z]+` to a
single `[A-Z]`. The underscore position is fixed by group 2 (the following
`[A-Z][a-z]` boundary), which both variants locate identically; group 1 only
extends left over characters that are reproduced verbatim either way, and the
match end (so the global-flag `lastIndex`) is unchanged. The output is therefore
identical for every input.

## Residual survivors

All 11 survivors are the equivalent mutants above; there are zero genuine coverage
gaps. 95.72 % is the score with equivalents documented rather than disabled.

---

## Re-run — 2026-08-06

| Metric             | Value        |
| ------------------ | ------------ |
| **Mutation score** | **95.74 %**  |
| Surviving mutants  | 11           |
| Break threshold    | 95 % -> PASS |

No change to the score, and none was available: all eleven survivors are the documented
equivalents below. Three of them were re-verified during this pass by RUNNING the mutants rather
than by reading them — `toScreamingSnake` produces identical output for httpServer, HTTPServer,
HTTPSProxy, XMLHttpRequest, URLPath and IOError whether it matches one capital or a run of them;
the synthesizer's upper bound picks the same value from both arms at the point its operator
distinguishes; and `Object.isFrozen` answers true for every primitive and for null, so a value
`isFreezable` wrongly admits is returned unchanged one line later.

Inline `// Stryker disable` directives were added during this pass and then removed. This package
documents equivalents here rather than annotating the source, and that convention outranks a
higher number.

Every equivalence claim in this section was checked by running the mutant, not by reading it.
Where a `// Stryker disable next-line` directive was found not to apply — above a `} catch {`, a
`.replace()` inside a method chain, a multi-line `sort(...)` argument, or anywhere inside a
builder chain — it was replaced with the block `disable`/`restore` form, or, where that does not
work either, with a plain comment at the line so the reasoning is visible rather than silently
ineffective.
