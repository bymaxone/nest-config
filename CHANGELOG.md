# Changelog

All notable changes to `@bymax-one/nest-config` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `release.yml` workflow extracts the section matching the pushed `vX.Y.Z` tag
as the GitHub Release body, so each released version needs a matching
`## [X.Y.Z]` heading here.

## [Unreleased]

## [0.1.0] - TBD

Initial public release: a typed, validated environment-configuration entry
point for NestJS 11 applications, built on Zod v4.

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
