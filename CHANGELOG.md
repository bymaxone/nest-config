# Changelog

All notable changes to `@bymax-one/nest-config` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `release.yml` workflow extracts the section matching the pushed `vX.Y.Z` tag
as the GitHub Release body, so each released version needs a matching
`## [X.Y.Z]` heading here.

## [Unreleased]

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
[Unreleased]: https://github.com/bymaxone/nest-config/compare/v1.0.3...HEAD
