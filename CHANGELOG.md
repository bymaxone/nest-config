# Changelog

All notable changes to `@bymax-one/nest-config` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `release.yml` workflow extracts the section matching the pushed `vX.Y.Z` tag
as the GitHub Release body, so each released version needs a matching
`## [X.Y.Z]` heading here.

## [Unreleased]

## [0.1.0] - 2026-08-03

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

[0.1.0]: https://github.com/bymaxone/nest-config/releases/tag/v0.1.0
[Unreleased]: https://github.com/bymaxone/nest-config/compare/v0.1.0...HEAD
