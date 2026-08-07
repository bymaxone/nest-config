# Mutation Testing Plan: @bymax-one/nest-config

> **Purpose:** the release-gate plan for Stryker mutation testing. It records the
> thresholds, the mutated surface, the known-risk areas, the session strategy,
> and the baseline survivor catalog that drove the hardening pass.
> **Final results:** [`mutation_testing_results.md`](./mutation_testing_results.md)

---

## Thresholds

`stryker.config.json`:

```json
"thresholds": { "high": 99, "low": 95, "break": 95 }
```

| Threshold   | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `break: 95` | `pnpm mutation` exits non-zero when the score drops below 95 % |
| `low: 95`   | Score between low and high renders yellow in the HTML report   |
| `high: 99`  | Aspirational target; a score at or above 99 % renders green    |

Mutation testing is a **release gate, not a per-commit gate**: a full run is
slow and memory-heavy, so it runs in concentrated sessions and in the dedicated
`mutation.yml` workflow (weekly cron plus manual dispatch), never inside
`prepublishOnly` or the per-PR `ci.yml`. Per-PR CI already enforces 100 % line,
branch, function, and statement coverage.

---

## Setup

Everything is in place; no install or config steps are needed.

| File                                  | Purpose                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `stryker.config.json`                 | Thresholds, mutate globs, concurrency cap, reporters      |
| `jest.stryker.config.ts`              | Jest config used by Stryker (`perTest` coverage analysis) |
| `@stryker-mutator/core`               | Core, in `devDependencies`                                |
| `@stryker-mutator/jest-runner`        | Jest test-runner plugin                                   |
| `@stryker-mutator/typescript-checker` | Type-checker plugin that discards type-invalid mutants    |

### Running

```bash
# Full run. Writes reports/mutation/mutation.html and mutation.json
pnpm mutation

# Faster re-run using the cached results from the last full run
pnpm mutation:incremental

# Validate the config without running any mutants
pnpm mutation:dry-run
```

Concurrency is capped at 2 in `stryker.config.json` so a run stays within bounded
resources and never has to compete with a parallel test workload.

---

## Mutated surface

`stryker.config.json` mutates `src/**/*.ts` and excludes specs, test folders,
type declarations, and public barrels (`index.ts`). That leaves 16 files:

- `config.module-definition.ts`, `config.module.ts`, `config.options.ts`,
  `config.providers.ts`, `config.service.ts`, `config.tokens.ts`
- `define-env.ts`, `deep-freeze.ts`, `env-validator.ts`, `errors.ts`,
  `report-formatter.ts`, `source-mapping.ts`, `types.ts`
- `testing/config-testing.module.ts`, `testing/create-test-config.ts`,
  `testing/placeholder-synthesizer.ts`

`disableTypeChecks` and the TypeScript checker discard mutants that cannot type
check (the large "errors" bucket in the report), so the score reflects only
mutants that produce runnable, type-valid programs.

---

## Known-risk areas

- **Validator branch density (`env-validator.ts`).** The single-pass validator
  concentrates the branching: per-namespace candidate framing, missing-versus-
  invalid classification, the deterministic first-issue collapse, the
  longest-prefix unknown-key attribution, and the stable unknown-key sort. These
  boundaries need behavioral assertions on the observable issue list, not on
  intermediate structures.
- **Formatter string and boundary mutants (`report-formatter.ts`).** The report
  is part of the public contract, so column-width and pluralization boundaries
  are pinned by asserting the rendered lines.
- **Deep-freeze guard (`deep-freeze.ts`).** The `isFreezable` guard is followed
  by an `Object.isFrozen` short-circuit; several guard mutants are equivalent
  because the short-circuit reaches the same early return (see the catalog).
- **Placeholder synthesizer boundaries (`testing/placeholder-synthesizer.ts`).**
  The synthesizer picks constraint-boundary values (canonical-versus-resized
  strings, exclusive integer edges, exact lengths). Inclusive bounds and the
  deterministic canonical placeholders are pinned by asserting the exact
  synthesized value, which is part of the `./testing` contract.

---

## Session strategy

1. **Baseline.** Full run, score and survivor catalog recorded here.
2. **Hardening pass.** For each survivor, add or sharpen one behavioral assertion
   that kills it, or classify it as a candidate equivalent with a technical
   reason.
3. **Equivalents documentation.** Every genuine equivalent is documented in
   `mutation_testing_results.md`; narrow, justified inline disables only where a
   mutant is a proven equivalent.
4. **Final gated run.** `pnpm mutation` with `break: 95` enforced must exit green.

---

## Baseline run

- **Date:** 2026-07-16
- **Command:** `pnpm mutation`
- **Score:** 89.11 % (229 killed, 28 survived, 0 timeout; 167 type-invalid
  mutants discarded by the checker and excluded from the score).
- **Result:** below the `break: 95` gate; drove the hardening pass below.

### Survivor catalog

Classification: **kill** means a behavioral assertion was added in the hardening
pass; **equivalent** means no observable behavioral difference exists within the
supported two-level convention (documented in `mutation_testing_results.md`).

| File                                 | Line | Mutator                                          | Classification | Note                                                                 |
| ------------------------------------ | ---- | ------------------------------------------------ | -------------- | -------------------------------------------------------------------- |
| `env-validator.ts`                   | 91   | MethodExpression                                 | kill           | Dropping the per-namespace grouping breaks the parse candidate       |
| `env-validator.ts`                   | 92   | ConditionalExpression                            | kill           | Filter-always-true places a leaf under the wrong namespace           |
| `env-validator.ts`                   | 186  | ConditionalExpression                            | kill           | First-issue collapse: pin the minimum-length message                 |
| `env-validator.ts`                   | 218  | EqualityOperator                                 | equivalent     | Equal-length distinct prefixes cannot both match one key             |
| `env-validator.ts`                   | 261  | ConditionalExpression (x2)                       | equivalent     | Half-mutated comparator still sorts ascending for any realistic size |
| `env-validator.ts`                   | 261  | EqualityOperator (x2)                            | equivalent     | Compared variables are always distinct, so `>`/`>=` agree            |
| `testing/placeholder-synthesizer.ts` | 121  | ConditionalExpression                            | kill           | Exact length must win over a redundant minimum                       |
| `testing/placeholder-synthesizer.ts` | 182  | EqualityOperator                                 | kill           | URL min bound is inclusive at the canonical length                   |
| `testing/placeholder-synthesizer.ts` | 183  | EqualityOperator                                 | kill           | URL max bound is inclusive at the canonical length                   |
| `testing/placeholder-synthesizer.ts` | 202  | ConditionalExpression                            | kill           | Email canonical is used when it fits the bounds                      |
| `testing/placeholder-synthesizer.ts` | 203  | EqualityOperator                                 | kill           | Email min bound is inclusive at the canonical length                 |
| `testing/placeholder-synthesizer.ts` | 204  | EqualityOperator                                 | kill           | Email max bound is inclusive at the canonical length                 |
| `testing/placeholder-synthesizer.ts` | 205  | BlockStatement                                   | kill           | Email canonical return must not be skipped                           |
| `testing/placeholder-synthesizer.ts` | 220  | EqualityOperator                                 | equivalent     | `target > max` and `target >= max` yield the same clamped value      |
| `testing/placeholder-synthesizer.ts` | 258  | ArithmeticOperator                               | kill           | Exclusive integer upper edge: pin the lone in-range value            |
| `testing/placeholder-synthesizer.ts` | 339  | StringLiteral                                    | kill           | Boolean leaf must resolve to the `true` token, not the filler        |
| `deep-freeze.ts`                     | 17   | ConditionalExpression (x2), LogicalOperator (x2) | equivalent     | `Object.isFrozen` short-circuit reaches the same early return        |
| `errors.ts`                          | 117  | BooleanLiteral                                   | kill           | `name` must be non-configurable (delete throws)                      |
| `errors.ts`                          | 125  | BooleanLiteral                                   | kill           | `code` must be non-configurable (delete throws)                      |
| `errors.ts`                          | 126  | BooleanLiteral                                   | kill           | `issues` must be non-configurable (delete throws)                    |
| `source-mapping.ts`                  | 45   | StringLiteral                                    | kill           | Acronym-boundary replacement must not blank the match                |
| `source-mapping.ts`                  | 45   | Regex (`[^a-z]`)                                 | kill           | Acronym boundary uses the following lowercase word start             |
| `source-mapping.ts`                  | 45   | Regex (`[A-Z]+`)                                 | equivalent     | Underscore position is fixed by the group-2 boundary                 |

Total: 28 survivors. 17 targeted for killing behavioral assertions, 11 classified
as candidate equivalents.

### Hardening result

- **Date:** 2026-07-16
- **Score after the hardening pass:** 95.72 % (246 killed, 11 survived), exit 0.
- Every one of the 17 kill targets was closed by a behavioral assertion; the 11
  remaining survivors are exactly the classified equivalents above. Full per-file
  scores and equivalent reasons are in
  [`mutation_testing_results.md`](./mutation_testing_results.md).

---

## Suppression policy

An equivalent mutant — one no test can kill because the mutation preserves observable
behaviour — is documented **in the source**, on the line it applies to:

```ts
// Stryker disable next-line <Mutator>[,<Mutator>]: <why the mutant is equivalent>
```

The reason belongs next to the code it explains, where it cannot drift away from it. A
separate report can, and does: line references rot after a reformatting, and a report can
claim a score the branch no longer measures.

Four rules keep that documentation real rather than decorative:

- **The reason goes after the colon, on one line.** Stryker parses a directive with
  `/^\s?Stryker (disable|restore)(?: (next-line))? ([a-zA-Z, ]+)(?::(.+)?)?/`. The mutator
  list accepts letters, commas and spaces only, and the reason is captured exclusively
  after the colon and only to the end of that line. Written after `--`, or wrapped onto a
  second comment line, the reason is silently dropped and the report shows Stryker's
  fallback text, `Ignored using a comment`.
- **A directive that does not attach uses the block form.** `next-line` does not reach a
  catch-clause body, a multi-line call argument, or anything inside a builder chain. Those
  take `// Stryker disable <Mutator>` … `// Stryker restore <Mutator>` around the whole
  statement.
- **The reason must be true.** Where a mutant is not equivalent but Stryker fails to
  attribute the killing test to it, the directive says exactly that. Calling it equivalent
  would be false, and a false justification is worth less than a lower score.
- **A mutant a test could kill is never disabled.** Strengthen the test instead. The break
  threshold is never lowered to accommodate a survivor.

`pnpm check:mutants` enforces the first rule mechanically, and also rejects a mutator name
Stryker does not know — which matches nothing, so the directive silences nothing while
looking like it does. Stryker warns about that case, but only during a mutation run, which
is too late to block the change that introduced it.

These comments ship in the unminified bundle. The measured cost is small — seven directives
cost 0.10 kB brotli in a server subpath of roughly 13 kB — because brotli compresses their
repeated prefixes almost for free. Where a bundle budget is genuinely tight, the budget is
raised deliberately in the same change with the measurement recorded beside it, rather than
the documentation being dropped: a budget exists to catch code bloat, and the reason a
mutant survives is not bloat.

This policy is identical across the `@bymax-one/nest-*` libraries.
