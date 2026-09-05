# Changelog

All notable changes to `@bymax-one/nest-config` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `release.yml` workflow extracts the section matching the pushed `vX.Y.Z` tag
as the GitHub Release body, so each released version needs a matching
`## [X.Y.Z]` heading here.

## [Unreleased]

### Documentation

- **`strict` names the two prefixed-variable sources a search will not find.** Both came
  from an adopter enabling it in a real deployment. A container's own `environment:` block
  assigns a variable whose host-side name is a different one, so a search over
  interpolations misses it — and it fails on the default path, because Compose assigns an
  unset interpolation the empty string rather than absent, and validation skips only
  `undefined`. Kubernetes service links appear in no file at all: at the default
  `enableServiceLinks`, a Service named `redis` supplies `REDIS_PORT`,
  `REDIS_SERVICE_HOST`, `REDIS_SERVICE_PORT` and the `REDIS_PORT_6379_TCP*` family into a
  closed `redis` namespace — a crash loop in production that never appears in CI.

  The cost of an open namespace is also stated in its sharpest form rather than its
  general one: the typo it cannot catch may be in that namespace's own declared variable,
  so `OTEL_ENABLE` is waived, the leaf falls back to its default, and the feature stays
  off with nothing reported.

## [1.2.0] - 2026-09-04

### Added

- **A namespace can declare itself open, so `strict` is usable next to a library that
  reads its own environment.** `strict` claims a declared namespace's entire variable
  prefix: a namespace named `otel` rejects the OpenTelemetry SDK's own
  `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_TRACES_SAMPLER`, and one named `redis` rejects a
  `REDIS_PORT` only a compose file reads. A prefix matching no declared namespace
  (`POSTGRES_*` with no `postgres` namespace) is never inspected, so the failure lands
  hardest exactly where a schema shares a prefix with another program — which is the common
  case. `OTEL_` is an open standard; a consumer cannot rename around it.

  `z.object({ ... }).meta({ open: true })` on the namespace waives unknown-key detection
  for the remainder of that prefix. The waiver is narrow by construction: declared leaves
  stay bound and validated (an open `otel` still reads and coerces `OTEL_ENABLED`), it
  applies per namespace rather than per schema, and a more specific closed namespace still
  claims its own variables (`otelExporter` beside an open `otel` still reports
  `OTEL_EXPORTER_TYPO`). Only the literal `true` opens a namespace.

  **The cost is stated rather than designed away:** an open namespace cannot distinguish a
  foreign variable from a misspelled local one, so a typo of `OTEL_ENABLED` passes and the
  leaf falls back to its default. The two cases are indistinguishable by name. Open the
  namespaces whose prefix genuinely belongs to another program, and leave the rest closed.

  Filtering the foreign names out of `source` is not an equivalent workaround and is worse
  in a way that is easy to miss: removing `OTEL_*` from the source also unbinds the declared
  `OTEL_ENABLED`, whose `.default()` then manufactures a plausible value while the variable
  silently stops being read.

### Security

- **Development-only advisories cleared; the published package was never affected.** Eight
  advisories landed against transitive development dependencies across this cycle:
  `browserslist` (GHSA-73wf-gq98-2v4g, GHSA-c83g-rgw3-j3cx, CVSS 7.5 each), `fast-uri`
  (GHSA-5jgf-p345-68v8, GHSA-jqff-g426-hqxp — host confusion; GHSA-f65p-4m7j-42xc,
  GHSA-fph4-wmhf-6fwf — server-side request forgery; CVSS 7.5 each) and `qs`
  (GHSA-4mjr-xmp4-gh2g, GHSA-x5fp-wj9c-mxmx, CVSS 6.3 each). All three are reached through
  the mutation-testing and commit-tooling chains, none is a runtime dependency, and this
  package ships `dist` alone — so no consumer resolved a vulnerable version through it.

  Recorded here rather than omitted as internal because a consumer reading an advisory feed
  needs to know whether a library in their tree pulled one in, and "it did not" is an answer
  only the maintainer can give. The floors now sit above every affected range and the
  lockfile resolves `browserslist@4.28.8`, `fast-uri@3.1.6` and `qs@6.16.0`.

### Documentation

- **`strict` now documents what it claims before you enable it.** The option read as an
  unambiguous improvement and gave no warning that a declared namespace claims its whole
  prefix — the behaviour was measured by a consumer only after enabling it broke a boot on
  five correct variables. The API reference gains a `Strict mode and shared prefixes`
  section covering the claim, the open-namespace opt-out, and its cost.

## [1.1.3] - 2026-08-18

**Documentation.** The runtime bundles are byte-identical to `1.1.2`. Five files differ: the
two `./internal` declaration files, by the JSDoc noted below; `README.md` and `CHANGELOG.md`;
and `package.json`, by its `version` field alone. Verified by hashing every file in the
published `1.1.2` tarball against this build.

### Documentation

- **How to report the failure is documented, because the two obvious ways are not
  equivalent.** `onValidationError` said what the hook is and nothing about logging what it
  hands you, which left the choice at the call site with no way to know the cost. `code` and
  `issues` are the only two own enumerable properties of `BymaxConfigValidationError`,
  while `name`, `message` and `stack` are non-enumerable as on any `Error`. That splits the
  outcome three ways by representation: an error object keeps everything when the serializer
  extracts the standard fields and copies the own enumerables, which are two separate steps; `error.stack` keeps the report and drops `code` and `issues`;
  and a plain `JSON.stringify(error)` keeps `code` and `issues` and drops the report.
  Which representation reaches the sink is decided by the logging call, and that call is
  library-specific — Pino serializes an error only as the merging object or under `err`,
  and drops it entirely when it is passed as a trailing argument. The machine-readable half is the easy one to
  lose, precisely because the report keeps arriving — `code` separates a configuration
  failure from any other boot failure, and `issues` is what an alert keys on per variable.

  Wrapping the error as a `cause` also keeps all of it, wherever the serializer walks the
  chain the same way. Measured against `@bymax-one/nest-logger` 1.2.7 and 1.2.9 rather
  than assumed: a fifteen-issue report crosses the chain with every issue and the full multi-line
  `message` intact.

  Versions 1.2.6 through 1.2.9 carry a defect the README states in full: handed this error
  **directly**, the redactor dropped the whole `err` field, leaving `_redactionFailed: true`
  and no report at all. The trigger was `issues` rather than `code`, and the property
  definition rather than freezing: this error is not frozen — it defines `code` and `issues`
  as non-writable, non-configurable own properties and freezes the issue list, while the
  instance stays extensible. Only the locked object property failed, because the redactor's
  clone inherited the locked descriptors and redefining a non-configurable property fails
  exactly when the value differs, which a structurally copied object does and an identical
  string does not.

  **Fixed upstream in `1.3.0`**, measured against the published package rather than taken on
  report: a real failure logged directly now arrives with `type, message, stack, code,
issues`, the full issue array and the multi-line report intact, and this error is left
  untouched. On an affected version the workaround stands, and it is something a consumer
  writes: a `catch` receives this error unchanged, since the module rethrows the instance it
  caught, so wrapping is an explicit `new Error(message, { cause: error })`.

  The rule also covers the call site where this failure usually lands: a `catch` in
  `main.ts` runs before any logging module is registered, so it reports through
  `console.error`. Node's inspector appends an error's own enumerables after the stack,
  so `console.error(message, error)` prints the report, the `code` and the expanded `issues`, while
  `console.error(message, error.stack)` prints the report alone — the same split, one layer
  earlier.

  The same fact is now stated on `BymaxConfigValidationError` itself, so it reaches a
  consumer through the published types and not only through the README.

## [1.1.2] - 2026-08-14

**Documentation only.** `dist/` is byte-identical to `1.1.1`, verified by hashing every file in
the published tarball against a local build. Inside the package only `README.md`, `CHANGELOG.md`
and the `version` field of `package.json` differ.

### Documentation

- **The `1.1.1` apply-note understated the work for a consumer with a mutation gate.** It said
  a derived backend has nothing to change, which is true for correctness and wrong as an
  estimate. Under Stryker, a message string literal is a mutant: authoring messages for rules
  that had none converts operator-facing prose into tested behavior, and a repo gating at
  `break: 100` fails until an assertion pins each message. Reported by a consumer adopting
  `1.1.1`, which added one assertion per message to keep its gate green.

  The honest version of the note: **upgrading changes nothing** — a rule that carries no
  message renders exactly as it did before, verified byte-for-byte on a real boot. **Writing
  the messages the release makes worth writing is real work**: wherever mutation testing is a
  gate, every message needs an assertion that covers it — one assertion on the rendered report
  can cover several — and that is the work the release exists to enable.

  Also worth knowing before writing them: a rule whose variable is _absent_ rendered
  `missing required value` on `1.1.0`, not `invalid value`. For a conditionally-required
  variable that is the more misleading of the two — nothing was forgotten, another variable
  made it required — so the before/after is larger than the `invalid value` case suggests.

- The mutation badge read **99.59%**; the score measured as the `v1.1.1` release gate is
  **99.61%**. The denominator grew with the new code — 14 more killed mutants in
  `env-validator.ts`, the only file the release changed executably, and the same single
  counted survivor — so the badge, the README claim and `docs/mutation_testing_results.md`
  now state the measured number, with a dated re-run entry recording it.

## [1.1.1] - 2026-08-14

### Fixed

- **A `custom` issue is reported with the message its author wrote.** `.check`, `.refine`
  and `.superRefine` all raise Zod's `custom` code, which carries no structural constraint
  to translate, so every one of them rendered as the literal `invalid value` and the rule's
  own explanation was discarded. Built-in codes were unaffected, which is what made it easy
  to miss: the report looked correct until a rule stopped being trivial. A conditional
  requirement, a cross-field rule or a security floor states itself only through that
  message, and the aggregated report is the one artifact an operator gets for a failure that
  stops the process.

  The message is used whether the variable is absent or present-but-invalid — "required
  when `X` is enabled" explains an absent variable better than `missing required value`
  does — while `issue.code` still classifies it as `BYMAX_CONFIG_MISSING` or
  `BYMAX_CONFIG_INVALID`, so machine consumers are unaffected. Whitespace runs collapse to
  single spaces to keep the one-line-per-variable layout; the column layout and the
  resolved `variable` name are unchanged.

  A `custom` issue raised without a message of its own still reads `invalid value`. Zod
  fills a message-less `custom` issue with its locale default before the validator sees it,
  so "no authored message" is recognized by matching that default (`Invalid input`) rather
  than by absence. Two consequences, both deliberate: the string is reserved, so a schema
  that authors it verbatim reports `invalid value`; and under a configured non-English Zod
  locale or a global custom error map the localized default does not match and is reported
  as written.

  Value-free stays a contract for the text this library generates. An authored message is
  schema text and is printed as written, including a value interpolated into it. The
  exception is now stated everywhere the guarantee is made: the `ConfigIssue`,
  `BymaxConfigValidationError` and `onValidationError` contracts, `env-validator`'s own
  contract, the README (including the security table) and spec 6.1.

  **Apply to a derived backend:** nothing to change. A schema that already raises `custom`
  issues with messages starts reporting them on the next boot.

## [1.1.0] - 2026-08-11

Coordinated ecosystem release aligning every `@bymax-one/*` package after the ioredis 6 /
bullmq 6 migration. **No source, runtime, or public-API change in this package** — the
published `dist/` is byte-identical to `1.0.3`; the changes below are development
and CI tooling only.

### Changed

- Bumped the `dev-dependencies` group with 3 updates. None of these reaches the published bundle.
- Bumped the pinned `pnpm/action-setup` CI action from 6.0.9 to 6.0.10.
- Bumped the pinned `github/codeql-action/upload-sarif` CI action from 4.37.4 to 4.37.6 in the
  codeql group.
- Reworked the mutation workflow to run incrementally on each push and to measure cold once a week.

## [1.0.3] - 2026-08-07

**Documentation and tooling.** `dist/` differs from `1.0.2` only in the text of the comments
described below; no runtime code changed.

### Changed

- **Equivalent mutants are documented in the source instead of only in the report.** Ten of
  the eleven now carry `// Stryker disable next-line <Mutator>: <reason>` on the line they
  apply to, which is the convention now shared across the `@bymax-one/nest-*` libraries. The
  measured score moves from **95.74%** to **99.59%** — no test and no production logic
  changed; Stryker excludes an ignored mutant from the denominator instead of counting it as
  one the suite failed to kill.

  Two needed the block `disable`/`restore` form, because `next-line` binds to the following
  statement and those mutants do not sit on one.

  The eleventh stays a **counted survivor**. A directive on the line above it was measured,
  not assumed, to do nothing — one does not attach to a `.replace()` inside a method chain,
  and the mutant still reported as surviving. Silencing it would take a block directive
  spanning the neighbouring `.replace()`, whose own regex mutants the suite does kill, and a
  killable mutant is never disabled to raise a number. It is argued in a plain comment at the
  line and counted in the report.

- The README claimed **Zero suppressions** as a rule. It states what is true now: every
  suppression carries its reason, in the grammar Stryker parses.

### Security

- **`js-yaml` is floored at the patched release** (GHSA-5p4m-2wfm-xmqj, CVSS 7.5), which was
  open as a Dependabot alert. It reaches this repo only through `jest` ->
  `babel-plugin-istanbul` -> `@istanbuljs/load-nyc-config`; this package declares
  `"dependencies": {}`, so `js-yaml` is never installed beside it and no consumer was
  exposed. `dist/` is unaffected. (Landed separately, recorded here because it ships in this
  version.)

### Added

- `check:mutants` gate (`scripts/check-mutation-directives.mjs`) — validates every
  `// Stryker` comment against the parser's own regular expression, rejecting a reason
  written after `--` instead of a colon, a reason wrapped onto a second comment line, a
  stray comma in the mutator list, and a mutator name Stryker does not know, which matches
  nothing and so silences nothing. Wired into CI and `prepublishOnly`.

## [1.0.2] - 2026-08-06

**Documentation only.** `dist/` is byte-identical to `1.0.1`.

### Documentation

- The mutation badge said **95.72%**; the re-measured score is **95.74%**. The report gains a
  dated re-run recording that three of the eleven documented equivalents were re-verified by
  running the mutants rather than by reading them.

## [1.0.1] - 2026-08-04

### Security

- `ConfigService` no longer discloses configured values when an instance is serialized.
  The validated root and its flattened lookup moved from TypeScript `private` properties —
  which are erased at runtime, leaving enumerable own properties — to ECMAScript private
  fields. `JSON.stringify`, `Object.entries`, object spread and `util.inspect` (including
  `showHidden`) previously emitted every secret the application declared in plaintext,
  which is what code that renders an injected provider incidentally does: a logger
  formatting its arguments, an error reporter capturing the scope of a throw.
- `ConfigService.toJSON` reports the declared namespace names and nothing else, so a
  serialized instance stays informative for debugging without carrying values.

Reading on purpose is unchanged. `get`, `has` and `getAll` return the same values as
before; only incidental serialization is affected. No API was removed.

## [1.0.0] - 2026-08-03

First published release. Everything below ships in it.

The `Fixed` and `Security` entries record defects found and corrected before
publication, not regressions any consumer saw — there is no earlier release to
have regressed from. They are kept because the reasoning is worth having.

### Added

- `defineEnv`: a thin, typed factory over `z.object(...)` establishing the
  two-level namespace convention, with deterministic `SCREAMING_SNAKE_CASE`
  source-variable mapping and a `meta({ env })` override for legacy names.
- Validation pipeline: a single aggregated pass over the source that never
  echoes raw values, exposed through `BymaxConfigValidationError`,
  `ConfigIssue`, and the frozen `ConfigErrorCode` catalog
  (`BYMAX_CONFIG_VALIDATION`, `BYMAX_CONFIG_MISSING`, `BYMAX_CONFIG_INVALID`,
  `BYMAX_CONFIG_UNKNOWN_KEY`).
- `BymaxConfigModule`: a global NestJS dynamic module with `forRoot` and
  `forRootAsync` registration, the `BYMAX_CONFIG` and `BYMAX_CONFIG_OPTIONS`
  Symbol injection tokens, and deep-freezing of the validated configuration
  before it enters the DI container.
- `ConfigService<TConfig>`: a typed accessor with compile-time dot-path
  inference (`get`, `getAll`, `has`) limited to the two-level namespace
  convention.
- `./testing` subpath: `createTestConfig` and `configTestingModule`,
  synthesizing a complete, schema-compliant source with selective overrides
  and running the exact production validation and freeze pipeline.
- Repository scaffold: package manifest with the two-subpath exports map,
  build tooling, lint and test configuration, mutation testing configuration,
  commit governance, and the open-source baseline files.

- **`pnpm check:exports`** runs `attw --pack . --profile strict` against the packed
  tarball, which is what surfaced both resolution defects above.
- **`pnpm check:runtime`** packs the tarball, lays it out the way npm would, and
  boots NestJS against it in ESM _and_ CommonJS, registering `configTestingModule`
  and resolving the root's tokens through it. Every other gate reads the source or
  the declarations, so a defect in how the entry points are bundled was invisible
  to all of them. Both run in CI, as their own release steps — they pack a
  tarball, and a pack nested inside a publish fails, so they cannot live in
  `prepublishOnly`.
- **An end-to-end spec for the `./testing` subpath**, run against `dist`. The e2e
  harness already resolved the built artifact but never exercised the two entry
  points together, which is the gap the defect lived in.

### Fixed

- **`configTestingModule()` provided tokens no consumer could inject.** Registering
  it from `@bymax-one/nest-config/testing` and then resolving `ConfigService` or
  `BYMAX_CONFIG` imported from the package root failed with
  `UnknownElementException` — the flow `configTestingModule`'s own documentation
  describes. `createTestConfig` rejected with a `BymaxConfigValidationError` that
  did not satisfy `instanceof` against the class the root exports, so a consumer
  narrowing on it silently reported an unexpected failure instead of a
  configuration one.

  Each entry point is a separate bundle, so `BymaxConfigModule`,
  `BymaxConfigValidationError` and the validation helpers the testing subpath
  reached by a relative path were copied into it. A copied class is a different
  injection token and a different `instanceof` target. The shared runtime now
  lives in one bundle, `./internal`, which both entry points import by package
  specifier — one identity in CommonJS as well as ESM, which code splitting could
  not give, since esbuild splits ESM only. The testing bundle drops from 20.7 KB
  to 6.2 KB, the duplicate being all of the difference.

- **CommonJS consumers resolved ESM type declarations.** The `exports` map
  declared a single `types` condition, so `require()` landed on `.d.ts` instead of
  `.d.cts` — `attw` reports it as _Masquerading as ESM_ on both subpaths. Types
  are now declared per condition.

- **`node10` type resolution failed outright** for both subpaths: the manifest
  carried no `main`, `module` or `types`, and no `typesVersions`. All four are now
  present.

### Security

- **Peer floors raised to exclude known-vulnerable NestJS versions.** The declared
  ranges were `@nestjs/common ^11.0.0` and `@nestjs/core ^11.0.0`, and both
  admitted versions carrying published advisories:

  | Peer             | Advisory                                                                                                                                    | Vulnerable                    | New floor  |
  | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------- |
  | `@nestjs/common` | [GHSA-cj7v-w2c7-cp7c](https://github.com/advisories/GHSA-cj7v-w2c7-cp7c) — remote code execution via the `Content-Type` header              | `>= 11.0.0-next.1, < 11.0.16` | `^11.0.16` |
  | `@nestjs/core`   | [GHSA-36xv-jgw5-4q75](https://github.com/advisories/GHSA-36xv-jgw5-4q75) — improper neutralization of special elements in downstream output | `<= 11.1.17`                  | `^11.1.18` |

  A peer range is a statement about which versions this library supports. A floor
  below a published advisory tells a consumer that a vulnerable install is a
  supported one, and nothing in their tooling contradicts it — the install resolves
  cleanly and silently. Corrected before the first publish, so no released version
  ever carried the permissive range. No runtime behaviour changed.

[1.0.0]: https://github.com/bymaxone/nest-config/releases/tag/v1.0.0
[1.0.2]: https://github.com/bymaxone/nest-config/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/bymaxone/nest-config/compare/v1.0.0...v1.0.1
[1.0.3]: https://github.com/bymaxone/nest-config/compare/v1.0.2...v1.0.3
[1.1.0]: https://github.com/bymaxone/nest-config/compare/v1.0.3...v1.1.0
[1.1.1]: https://github.com/bymaxone/nest-config/compare/v1.1.0...v1.1.1
[1.1.2]: https://github.com/bymaxone/nest-config/compare/v1.1.1...v1.1.2
[1.1.3]: https://github.com/bymaxone/nest-config/compare/v1.1.2...v1.1.3
[1.2.0]: https://github.com/bymaxone/nest-config/compare/v1.1.3...v1.2.0
[Unreleased]: https://github.com/bymaxone/nest-config/compare/v1.2.0...HEAD
