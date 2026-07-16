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
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" /></a>
</p>

---

## Overview

`@bymax-one/nest-config` gives a NestJS application a single, typed, validated
entry point for environment configuration. It validates `process.env` exactly
once at bootstrap against a [Zod](https://zod.dev) v4 schema, fails fast with
one aggregated, human-readable error report, and exposes the result as a
deep-frozen, fully typed configuration object available anywhere in the
application through dependency injection.

The library replaces three recurring anti-patterns: scattered `process.env.X`
reads with ad-hoc parsing scattered across services, lazy validation where a
missing variable only explodes on the first request that needs it, and
untyped config access (`config.get('port') as number`) that bypasses the type
system exactly where mistakes are most expensive.

## Features

- **Validate once, at bootstrap.** The environment is parsed and validated a
  single time, before the application starts serving traffic. No lazy
  validation at first access, ever.
- **Fail fast, fail complete.** A misconfigured process does not boot. Every
  violation is reported together in one aggregated error, so an operator
  fixes the environment in one round trip instead of one variable at a time.
- **Never echo values.** Validation errors report variable names, paths, and
  constraint descriptions only. Raw values never appear in the error output,
  so secrets cannot leak into logs or crash reports.
- **Typed end to end.** The configuration type is inferred from the schema.
  `get('database.url')` returns `string`, `get('server.port')` returns
  `number`, with no casts and no `any` anywhere in the chain.
- **Immutable by construction.** The validated object is deep-frozen before it
  enters the DI container. Configuration is a fact about the process, not a
  mutable bag.
- **The environment is injectable.** The raw source defaults to
  `process.env` but is a plain injectable record, so tests validate any input
  without touching the real environment.
- **Zero runtime dependencies.** `dependencies` is empty; NestJS, `zod`, and
  `reflect-metadata` are peer dependencies controlled by the consumer.

## Installation

```bash
pnpm add @bymax-one/nest-config @nestjs/common @nestjs/core reflect-metadata zod
```

### Peer requirements

| Package            | Version    |
| ------------------ | ---------- |
| Node.js            | `>=24.0.0` |
| `@nestjs/common`   | `^11.0.0`  |
| `@nestjs/core`     | `^11.0.0`  |
| `reflect-metadata` | `^0.2.0`   |
| `zod`              | `^4.0.0`   |

## Quick start

Define a schema with `defineEnv`. Top-level keys are namespaces, leaves are
environment-derived values; each leaf reads a `SCREAMING_SNAKE_CASE` variable
derived from its path (`database.url` reads `DATABASE_URL`).

<!-- Source: test/e2e/fixtures/env.schema.ts -->

```typescript
import { z } from 'zod'
import { defineEnv } from '@bymax-one/nest-config'

export const envSchema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    env: z.enum(['development', 'test', 'production']).default('development')
  }),
  database: z.object({
    url: z.url()
  }),
  redis: z.object({
    url: z.url()
  }),
  log: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info')
  })
})

export type AppConfig = typeof envSchema.infer
```

Register `BymaxConfigModule` once in the root module (it is global by
default):

```typescript
import { Module } from '@nestjs/common'
import { BymaxConfigModule } from '@bymax-one/nest-config'
import { envSchema } from './config/env.schema'

@Module({
  imports: [BymaxConfigModule.forRoot({ schema: envSchema })]
})
export class AppModule {}
```

Inject the typed `ConfigService` wherever configuration is needed, no casts:

<!-- Source: test/e2e/fixtures/feature.provider.ts -->

```typescript
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@bymax-one/nest-config'
import type { AppConfig } from './config/env.schema'

@Injectable()
export class FeatureProvider {
  public constructor(@Inject(ConfigService) private readonly config: ConfigService<AppConfig>) {}

  public describeConnection(): string {
    return `${this.config.get('database.url')}::${this.config.get('server.port')}`
  }
}
```

A process started with an incomplete environment exits immediately with the
aggregated report, never one violation at a time:

```
BymaxConfigValidationError: environment validation failed (3 issues)

  DATABASE_URL          missing required value (expected: url)
  AUTH_JWT_SECRET        too short (expected: string, minimum 32 characters)
  SERVER_PORT            invalid value (expected: integer between 1 and 65535)

Fix the variables above and restart the process.
```

Raw values are never printed, not truncated, not masked, absent. This is a
hard guarantee of the package, verified by tests.

## API reference

### `defineEnv(shape)`

A thin, typed factory over `z.object(...)` that establishes the two-level
namespace convention: top-level keys are namespaces, leaves are
environment-derived values. It composes the caller's schemas as-is, never
rewriting, cloning, or wrapping them, so coercion and defaults stay explicit
consumer choices. Leaves use `z.coerce.*` because the source arrives as
strings (the shape of `process.env`).

A leaf can override its derived variable name through schema metadata when a
legacy name must be preserved:

```typescript
database: z.object({
  // Reads DB_CONNECTION_STRING instead of the derived DATABASE_URL.
  url: z.url().meta({ env: 'DB_CONNECTION_STRING' })
})
```

### `BymaxConfigModule`

| Method                  | Signature                                                         |
| ----------------------- | ----------------------------------------------------------------- |
| `forRoot(options)`      | `(options: BymaxConfigModuleOptions) => DynamicModule`            |
| `forRootAsync(options)` | `(options: ConfigurableModuleAsyncOptions<...>) => DynamicModule` |

`BymaxConfigModuleOptions`:

| Field               | Type                                           | Required | Notes                                                                                                                               |
| ------------------- | ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `schema`            | `EnvSchema`                                    | yes      | Produced by `defineEnv`.                                                                                                            |
| `source`            | `Record<string, string \| undefined>`          | no       | Defaults to `process.env` in the provider factory. Injectable for tests.                                                            |
| `onValidationError` | `(issues: ReadonlyArray<ConfigIssue>) => void` | no       | Observability hook invoked before the fail-fast throw. Cannot suppress the failure.                                                 |
| `strict`            | `boolean`                                      | no       | When true, source variables matching a namespace prefix but no declared leaf raise `BYMAX_CONFIG_UNKNOWN_KEY`. Defaults to `false`. |

`forRootAsync` resolves the source through another provider, for example a
secrets-manager client composed with `process.env`:

<!-- Source: test/e2e/fixtures/secrets.provider.ts, secrets.module.ts, config-boot-async.e2e-spec.ts -->

```typescript
BymaxConfigModule.forRootAsync({
  imports: [SecretsModule],
  useFactory: (secrets: SecretsProvider) => ({
    schema: envSchema,
    source: { ...process.env, ...secrets.asEnvRecord() }
  }),
  inject: [SecretsProvider]
})
```

`isGlobal` defaults to `true` and can be set to `false` through the standard
extras when an application intentionally scopes configuration to a submodule.

### `ConfigService<TConfig>`

The typed, injectable accessor over the frozen configuration object.

| Method      | Signature                                                     | Notes                                            |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `get(path)` | `<P extends Path<TConfig>>(path: P) => PathValue<TConfig, P>` | Dot-path access, type inferred from the schema.  |
| `getAll()`  | `() => Readonly<TConfig>`                                     | The deep-frozen root object.                     |
| `has(path)` | `(path: Path<TConfig>) => boolean`                            | True when the resolved value is not `undefined`. |

Because validation completed at bootstrap, `get` never throws for a declared
path: every leaf either passed validation, received its default, or the
process did not start.

### `BymaxConfigValidationError` and `ConfigIssue`

```typescript
export class BymaxConfigValidationError extends Error {
  public readonly code: ConfigValidationCode // 'BYMAX_CONFIG_VALIDATION'
  public readonly issues: ReadonlyArray<ConfigIssue>
}

export interface ConfigIssue {
  readonly path: string // e.g. "database.url"
  readonly variable: string // e.g. "DATABASE_URL"
  readonly code: ConfigIssueCode
  readonly message: string // value-free constraint description
}
```

`ConfigErrorCode` is the frozen catalog backing `ConfigValidationCode` (the
error's own `code`) and `ConfigIssueCode` (each issue's `code`); see the
error catalog below for every value.

### Injection tokens

`BYMAX_CONFIG` and `BYMAX_CONFIG_OPTIONS` are module-local `Symbol` tokens,
exported for advanced factory-style wiring that needs the raw frozen config
or the resolved options directly instead of going through `ConfigService`:

```typescript
import { Inject, Injectable } from '@nestjs/common'
import { BYMAX_CONFIG } from '@bymax-one/nest-config'
import type { AppConfig } from './config/env.schema'

@Injectable()
export class RawConfigConsumer {
  public constructor(@Inject(BYMAX_CONFIG) private readonly config: Readonly<AppConfig>) {}
}
```

### Type utilities

`EnvSchema`, `EnvShape`, `EnvOutput`, `EnvLeaf`, and `EnvNamespace` type the
two-level schema shape produced by `defineEnv`; `Path<T>` and `PathValue<T, P>`
are the template-literal utilities behind `ConfigService.get`'s compile-time
dot-path inference, limited to the two-level namespace convention. All five
are exported for advanced generic code (custom decorators, typed wrappers)
that needs to reference the schema shape directly.

## Error catalog

| Code                       | Meaning                                                |
| -------------------------- | ------------------------------------------------------ |
| `BYMAX_CONFIG_VALIDATION`  | One or more schema violations (top-level error code).  |
| `BYMAX_CONFIG_MISSING`     | Required variable absent from the source (issue code). |
| `BYMAX_CONFIG_INVALID`     | Present but failed its constraint (issue code).        |
| `BYMAX_CONFIG_UNKNOWN_KEY` | Strict mode: source variable matches no declared leaf. |

## Testing

`@bymax-one/nest-config/testing` removes every excuse for touching
`process.env` in tests. `createTestConfig` synthesizes a complete valid
source from the schema (defaults where declared, deterministic placeholder
values elsewhere), applies selective overrides, then runs the exact
production pipeline (validate, freeze), so a test exercises the same code
path a running application does.

```typescript
import { createTestConfig } from '@bymax-one/nest-config/testing'
import { envSchema } from './config/env.schema'

const config = createTestConfig(envSchema, {
  database: { url: 'postgres://localhost:5432/test' }
})
```

`configTestingModule` registers the production `BymaxConfigModule` with a
synthesized source, ready to drop into a Nest `TestingModule` graph:

```typescript
import { Test } from '@nestjs/testing'
import { configTestingModule } from '@bymax-one/nest-config/testing'
import { envSchema } from './config/env.schema'
import { FeatureProvider } from './feature.provider'

const moduleRef = await Test.createTestingModule({
  imports: [configTestingModule(envSchema, { server: { port: 0 } })],
  providers: [FeatureProvider]
}).compile()
```

Placeholder synthesis never fabricates values that could accidentally pass a
secret-strength constraint; length and format constraints are honored. The
subpath has no Jest dependency and works with any runner, though the family
standard is Jest.

## Design principles

1. **Validate once, at bootstrap.** No lazy validation at first access.
2. **Fail fast, fail complete.** All violations are reported together in one
   aggregated error.
3. **Never echo values.** Validation errors report variable names, paths, and
   constraint descriptions only, never raw values.
4. **Immutable by construction.** The validated configuration is deep-frozen
   before it enters the DI container.
5. **Configuration over convention.** Everything goes through
   `forRoot`/`forRootAsync`. No file discovery, no magic paths, no hidden
   precedence rules.

## Known limitations

1. **Two-level namespace convention.** The path-inference utilities
   (`Path<T>`, `PathValue<T, P>`) target `namespace.leaf` schemas. Deeper
   nesting validates correctly but is not covered by `get()` path inference;
   `getAll()` remains fully typed for arbitrary depth.
2. **String-shaped sources only.** The source record is
   `Record<string, string | undefined>` by design, the shape of a process
   environment. Structured sources must be serialized into that shape before
   validation.
3. **No `.env` file loading.** Process environment population is the
   platform's job: Node's native `--env-file`, container orchestrators, or CI
   secrets. Bundling a loader would add a dependency and a second
   source-of-truth.
4. **No multi-source precedence.** One source record per module
   registration. Precedence between layers (defaults, env, secrets) is the
   caller's composition (`{ ...a, ...b }`), kept explicit on purpose.

## Releasing

Publishing is driven entirely from CI through the `release.yml` workflow, which
uses npm OIDC trusted publishing (no long-lived npm token) and attaches build
provenance. Provenance and the security workflows (CodeQL, Scorecard, dependency
review) require a public repository, so the publish job is gated on repository
visibility and stays inactive while the repository is private.

Go-live is a deliberate, manual sequence performed by a maintainer:

1. **Verify the gates locally.** `pnpm mutation` (score at or above the break
   threshold of 95), `pnpm prepublishOnly`, `pnpm build && pnpm test:e2e`, and
   `pnpm publish --dry-run` (confirm the tarball packs only `dist/`, `LICENSE`,
   `README.md`, and `CHANGELOG.md`).
2. **Confirm the version.** `package.json` `version` and the top dated
   `CHANGELOG.md` heading must both read the version being released.
3. **Make the repository public.** This activates the provenance publish job and
   the CodeQL, Scorecard, and dependency-review gates.
4. **Tag from `main`.** Push an annotated `vX.Y.Z` tag matching the manifest
   version. The tag push triggers `release.yml`, which verifies the tag against
   `package.json`, re-runs the release gates, and publishes with provenance.
5. **Post-publish smoke.** In a scratch directory outside the repository, install
   the freshly published version alongside the NestJS 11 peers and boot a minimal
   fixture to confirm the shipped artifact resolves and starts.

## License

[MIT](./LICENSE)
