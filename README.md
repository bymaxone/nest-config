<h1 align="center">@bymax-one/nest-config</h1>

<p align="center">
  <strong>Typed and validated environment configuration for NestJS</strong><br />
  <sub>Zod v4 · Fail-fast · Value-free errors · Zero runtime dependencies</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bymax-one/nest-config"><img src="https://img.shields.io/npm/v/@bymax-one/nest-config?style=flat-square&colorA=000000&colorB=000000" alt="npm version" /></a>
  <a href="https://github.com/bymaxone/nest-config/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bymaxone/nest-config/ci.yml?branch=main&style=flat-square&colorA=000000&label=CI" alt="CI status" /></a>
  <a href="https://github.com/bymaxone/nest-config/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square&colorA=000000" alt="coverage" /></a>
  <a href="https://github.com/bymaxone/nest-config/blob/main/LICENSE"><img src="https://img.shields.io/github/license/bymaxone/nest-config?style=flat-square&colorA=000000&colorB=000000" alt="license" /></a>
</p>

---

## Overview

`@bymax-one/nest-config` gives NestJS 11 applications a single, typed entry
point for environment configuration. It validates `process.env` exactly once
at bootstrap against a Zod v4 schema, fails fast with one aggregated report
that never echoes raw values, and exposes a deep-frozen typed configuration
object through dependency injection. The library ships zero runtime
dependencies: NestJS, `reflect-metadata`, and `zod` are required peers, so the
consuming application controls every version on the dependency tree.

## Installation

```bash
pnpm add @bymax-one/nest-config @nestjs/common @nestjs/core reflect-metadata zod
```

## Quick start

Define a schema with `defineEnv`, register `BymaxConfigModule` in the root
module, and inject the typed `ConfigService` wherever configuration is needed.
Full usage examples are published as the schema engine and dynamic module
ship their public exports.

## API

`defineEnv`, `BymaxConfigModule`, and `ConfigService` form the public surface
of the `.` subpath. Reference documentation is published as each export
lands.

## Error catalog

Every validation failure resolves to a `BymaxConfigValidationError` carrying
an aggregated, value-free report keyed by error code. The catalog is
documented once the validation pipeline ships.

## Testing

The `./testing` subpath exposes `createTestConfig` and `configTestingModule`
for exercising consumers without a real environment. Documentation follows
once the testing subpath ships.

## License

[MIT](./LICENSE)
