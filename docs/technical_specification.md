# @bymax-one/nest-config: Complete Technical Specification

> **Version:** 1.0.0
> **Last updated:** 2026-07-06
> **Status:** Draft for implementation
> **Type:** Public npm package (`@bymax-one/nest-config`)

---

## Table of Contents

1. [Vision and Value Proposition](#1-vision-and-value-proposition)
2. [Architecture](#2-architecture)
3. [Package Structure](#3-package-structure)
4. [Configuration API](#4-configuration-api)
5. [Typed Accessor: `ConfigService`](#5-typed-accessor-configservice)
6. [Validation Pipeline and Error Model](#6-validation-pipeline-and-error-model)
7. [Testing Subpath](#7-testing-subpath)
8. [What is NOT in the package](#8-what-is-not-in-the-package)
9. [Dependencies and Packaging](#9-dependencies-and-packaging)
10. [Quality Gates](#10-quality-gates)
11. [Repository Standard](#11-repository-standard)
12. [Known Limitations](#12-known-limitations)
13. [Example Integration](#13-example-integration)
14. [Implementation Phases](#14-implementation-phases)

---

## 1. Vision and Value Proposition

### 1.1 What it is

`@bymax-one/nest-config` is a public npm package that gives a NestJS application a single, typed, validated entry point for environment configuration. It validates `process.env` exactly once at bootstrap against a [Zod](https://zod.dev) v4 schema, fails fast with one aggregated, human-readable error report, and exposes the result as a deep-frozen, fully typed configuration object available anywhere in the application through dependency injection.

The library replaces three recurring anti-patterns:

1. Scattered `process.env.X` reads across services, each with its own ad-hoc parsing and defaults.
2. Lazy validation, where a missing variable only explodes on the first request that needs it, hours after deploy.
3. Untyped config access (`config.get('port') as number`), where the type system is bypassed exactly where mistakes are most expensive.

### 1.2 Why it exists

Every backend repeats the same bootstrap chore: read the environment, coerce strings into numbers and booleans, validate presence and format, group values into logical namespaces, and hand the result to the rest of the application. Done ad hoc, this code is duplicated across services, drifts between projects, and produces the worst failure mode in operations: a process that starts successfully with a broken configuration.

`@bymax-one/nest-config` centralizes that responsibility in a single audited package. It is also the designated configuration boundary of the `@bymax-one` family: sibling libraries (`nest-auth`, `nest-logger`, `nest-cache`, `nest-queue`, `nest-storage`, `nest-notification`, `nest-realtime`) never read `process.env` themselves; the host application validates the environment with this package and injects plain option objects into each of them.

### 1.3 Who uses it

- **NestJS applications** that want fail-fast, typed configuration with zero boilerplate.
- **Consumers of other `@bymax-one/nest-*` libraries**, which expect their options to be injected rather than read from the environment.
- Any Node.js 24+ project with NestJS 11+ that wants schema-driven configuration with full type inference.

### 1.4 Distribution Model

| Aspect               | Detail                                      |
| -------------------- | ------------------------------------------- |
| Registry             | Public npm (`@bymax-one/nest-config`)       |
| License              | MIT                                         |
| Runtime              | Node.js 24+                                 |
| Framework            | NestJS 11+                                  |
| Subpaths             | `.` (server) + `./testing` (test utilities) |
| Main peer dependency | `zod ^4`                                    |

### 1.5 Design Principles

1. **Validate once, at bootstrap.** The environment is parsed and validated a single time, before the application starts serving traffic. There is no lazy validation at first access, ever.
2. **Fail fast, fail complete.** A misconfigured process must not boot. All violations are reported together in one aggregated error, so an operator fixes the environment in one round trip instead of one variable at a time.
3. **Never echo values.** Validation errors report variable names, paths, and constraint descriptions only. Raw values never appear in the error output, so secrets cannot leak into logs or crash reports.
4. **Typed end to end.** The configuration type is inferred from the schema. `get('database.url')` returns `string`, `get('server.port')` returns `number`, with no casts and no `any` anywhere in the chain.
5. **Immutable by construction.** The validated object is deep-frozen before it enters the DI container. Configuration is a fact about the process, not a mutable bag.
6. **The environment is injectable.** The raw source defaults to `process.env` but is a plain injectable record, so tests validate any input without touching the real environment.
7. **Configuration over convention.** Everything goes through `forRoot`/`forRootAsync`. No file discovery, no magic paths, no hidden precedence rules.
8. **Zero runtime dependencies.** `dependencies` is empty; `zod` and the NestJS platform are peer dependencies controlled by the consumer.

### 1.6 Position in the `@bymax-one` family

```
process.env ──► @bymax-one/nest-config ──► typed AppConfig (frozen)
                                              │
                       ┌──────────────────────┼──────────────────────┐
                       ▼                      ▼                      ▼
              nest-logger options     nest-cache options     nest-auth options
              (injected via           (injected via          (injected via
               forRootAsync)           forRootAsync)          forRootAsync)
```

This package is the only member of the family that touches the environment, and it does so exactly once.

---

## 2. Architecture

### 2.1 NestJS Dynamic Module Pattern

`@bymax-one/nest-config` is a global dynamic module (`isGlobal: true` by default), built on `ConfigurableModuleBuilder` with the `isGlobal` extra mapped to `DynamicModule.global` via `setExtras`. The application imports it once in `AppModule`; `ConfigService` and the raw frozen config become available in every feature module without re-importing.

```
┌────────────────────────────────────────────────────────────┐
│                 Host Application (NestJS)                  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           @bymax-one/nest-config module              │  │
│  │                                                      │  │
│  │   source (default: process.env)                      │  │
│  │        │                                             │  │
│  │        ▼                                             │  │
│  │   EnvValidator ──► Zod v4 schema (defineEnv)         │  │
│  │        │                                             │  │
│  │        ├── failure ──► BymaxConfigValidationError    │  │
│  │        │               (aggregated report, no values)│  │
│  │        ▼                                             │  │
│  │   deepFreeze(parsed) ──► BYMAX_CONFIG (provider)     │  │
│  │                              │                       │  │
│  │                              ▼                       │  │
│  │                      ConfigService<T>                │  │
│  │                      get(path) / getAll()            │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Boot Sequence

1. **`forRoot` / `forRootAsync`** receives `BymaxConfigModuleOptions` (schema, optional source, optional error hook).
2. **Validation** runs inside the provider factory for `BYMAX_CONFIG`, which NestJS resolves during application bootstrap, before any consumer provider is instantiated.
3. **On failure**, `BymaxConfigValidationError` is thrown. Module resolution aborts, `NestFactory.create` rejects, and the process exits before binding a port. The optional `onValidationError` hook runs first (for custom reporting), then the error propagates; the hook cannot swallow the failure.
4. **On success**, the parsed output is deep-frozen and registered under the `BYMAX_CONFIG` token. `ConfigService` wraps it for path-based access.

### 2.3 Dependency Injection Tokens

All tokens are `Symbol`s, never strings, and every constructor parameter and factory `inject` entry uses an explicit `@Inject(...)` (implicit class-type resolution is not relied upon in the published bundle).

| Token                  | Provides                                 | Scope     |
| ---------------------- | ---------------------------------------- | --------- |
| `BYMAX_CONFIG_OPTIONS` | Resolved `BymaxConfigModuleOptions`      | Singleton |
| `BYMAX_CONFIG`         | The deep-frozen, validated config object | Singleton |

`ConfigService` itself is exported by class and is the recommended consumption surface; injecting `BYMAX_CONFIG` directly is supported for factory-style wiring of other dynamic modules.

---

## 3. Package Structure

### 3.1 Directory Tree

```
@bymax-one/nest-config/
├── package.json
├── tsconfig*.json
├── tsup.config.ts
├── eslint.config.mjs
├── jest*.config.ts
├── stryker.config.json
├── README.md / CHANGELOG.md / LICENSE / SECURITY.md
├── CONTRIBUTING.md / CODE_OF_CONDUCT.md / CLAUDE.md / AGENTS.md
├── docs/
│   ├── technical_specification.md
│   ├── development_plan.md
│   ├── mutation_testing_plan.md
│   └── mutation_testing_results.md
├── scripts/
│   ├── check-size.mjs
│   └── dogfood-smoke-test.mjs
└── src/
    ├── index.ts                    # public barrel for "."
    ├── config.module.ts            # BymaxConfigModule (ConfigurableModuleBuilder)
    ├── config.module-definition.ts # builder, extras, option types
    ├── config.service.ts           # typed accessor
    ├── config.tokens.ts            # Symbol DI tokens
    ├── define-env.ts               # defineEnv(shape) helper
    ├── env-validator.ts            # parse + aggregate + freeze
    ├── deep-freeze.ts              # recursive Object.freeze utility
    ├── errors.ts                   # BymaxConfigValidationError + codes
    ├── types.ts                    # Path/PathValue inference utilities
    └── testing/
        ├── index.ts                # public barrel for "./testing"
        ├── create-test-config.ts   # valid config builder for tests
        └── config-testing.module.ts
```

### 3.2 Subpath Exports

| Subpath      | Content                                             | Environment |
| ------------ | --------------------------------------------------- | ----------- |
| `.`          | Module, service, `defineEnv`, tokens, errors, types | Node server |
| `./testing`  | `createTestConfig`, `configTestingModule`           | Test only   |
| `./internal` | The shared runtime the two above are built on       | Not for use |

The first two are the public API. `./internal` is listed because it is a real subpath in the `exports` map, not because it is meant to be imported: it carries no compatibility promise, and everything it exposes is reachable from `.` or `./testing`.

It exists because each entry point is a separate bundle, so a module both reach by a relative path is copied into each — and a copied class is a different injection token and a different `instanceof` target. Owning the shared graph in one bundle that both import by package specifier gives it a single identity in CommonJS as well as ESM; code splitting cannot substitute, since esbuild splits ESM only.

Every subpath ships ESM + CJS + type declarations, with `types` declared per condition so a `require()` consumer resolves `.d.cts` rather than `.d.ts`. Deep imports into `dist` internals are not part of the public API and are not supported.

---

## 4. Configuration API

### 4.1 `defineEnv(shape)`

`defineEnv` is a thin, typed factory over `z.object(...)` that establishes the two-level convention of the package: top-level keys are namespaces, leaves are environment-derived values.

```typescript
import { defineEnv } from '@bymax-one/nest-config'
import { z } from 'zod'

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
  auth: z.object({
    jwtSecret: z.string().min(32),
    accessTtlSeconds: z.coerce.number().int().positive().default(900)
  })
})

export type AppConfig = typeof envSchema.infer
```

Contract:

- Input values arrive as strings (the shape of `process.env`), so leaves use `z.coerce.*` for numbers and booleans; `defineEnv` documents and encourages this, it does not rewrite schemas behind the caller's back.
- Environment variable names map to leaves through the schema's own key mapping: each leaf declares its source variable explicitly via the standard Zod pipeline (see 4.2), keeping the mapping visible and greppable.
- `defineEnv` returns the Zod schema augmented with an `infer` phantom property for ergonomic type extraction; at runtime it is the schema itself.

### 4.2 Source Mapping

The validator receives a flat `Record<string, string | undefined>` (the source) and a nested schema. Mapping between flat variable names and nested paths follows one deterministic rule: `SCREAMING_SNAKE_CASE` of the joined path (`database.url` reads `DATABASE_URL`, `auth.jwtSecret` reads `AUTH_JWT_SECRET`). A leaf can override its variable name through schema metadata when a legacy name must be preserved:

```typescript
database: z.object({
  // Reads DB_CONNECTION_STRING instead of the derived DATABASE_URL.
  url: z.url().meta({ env: 'DB_CONNECTION_STRING' }),
}),
```

### 4.3 Module Options

```typescript
export interface BymaxConfigModuleOptions<TSchema extends EnvSchema = EnvSchema> {
  /** Schema produced by defineEnv. Required. */
  schema: TSchema

  /** Raw source record. Defaults to process.env. Injectable for tests and tooling. */
  source?: Record<string, string | undefined>

  /**
   * Observability hook invoked with the structured issue list before the
   * validation error is thrown. Cannot suppress the failure.
   */
  onValidationError?: (issues: ReadonlyArray<ConfigIssue>) => void

  /**
   * When true, source variables that match the schema's namespace prefixes
   * but no declared leaf produce BYMAX_CONFIG_UNKNOWN_KEY issues.
   * Defaults to false.
   */
  strict?: boolean
}
```

### 4.4 Registration

```typescript
// Synchronous, the common case: the schema is a static import.
BymaxConfigModule.forRoot({ schema: envSchema })

// Asynchronous, for sources resolved through other providers.
BymaxConfigModule.forRootAsync({
  useFactory: (secrets: SecretsSnapshot) => ({
    schema: envSchema,
    source: { ...process.env, ...secrets.asEnvRecord() }
  }),
  inject: [SECRETS_SNAPSHOT]
})
```

`isGlobal` defaults to `true` and can be disabled through the standard extras when an application intentionally scopes configuration to a submodule.

---

## 5. Typed Accessor: `ConfigService`

`ConfigService<T>` is a generic wrapper around the frozen config with compile-time path inference:

```typescript
@Injectable()
export class InvoiceService {
  public constructor(@Inject(ConfigService) private readonly config: ConfigService<AppConfig>) {}

  public buildConnection(): Connection {
    // Inferred as string, no cast.
    const url = this.config.get('database.url')
    // Inferred as number.
    const port = this.config.get('server.port')
    return connect(url, port)
  }
}
```

API surface:

| Method      | Signature                                         | Notes                                         |
| ----------- | ------------------------------------------------- | --------------------------------------------- |
| `get(path)` | `<P extends Path<T>>(path: P) => PathValue<T, P>` | Dot-path access, type inferred from schema    |
| `getAll()`  | `() => Readonly<T>`                               | The deep-frozen root object                   |
| `has(path)` | `(path: Path<T>) => boolean`                      | True when the resolved value is not undefined |

`Path<T>` and `PathValue<T, P>` are internal template-literal type utilities limited to the two-level namespace convention (namespace and leaf), which keeps compiler cost flat even for large schemas. Invalid paths are compile-time errors, not runtime lookups.

Because validation completed at bootstrap, `get` never throws for declared paths: every leaf either passed validation, received its default, or the process did not start.

---

## 6. Validation Pipeline and Error Model

### 6.1 Aggregated Report

All schema violations are collected in a single pass and reported together:

```
BymaxConfigValidationError: environment validation failed (3 issues)

  DATABASE_URL          missing required value (expected: url)
  AUTH_JWT_SECRET       too short (expected: string, minimum 32 characters)
  SERVER_PORT           invalid value (expected: integer between 1 and 65535)

Fix the variables above and restart the process.
```

Formatting rules:

1. One line per issue: variable name, constraint description, expected shape.
2. **Raw values are never printed.** Not truncated, not masked, absent. This is a hard guarantee of the package, verified by tests.
3. Variable names are the resolved source names (after `meta({ env })` overrides), so the report matches what the operator must edit.
4. **A `custom` issue is described by its author's message.** A `.check`, `.refine` or `.superRefine` carries no structural constraint to translate, so the message written in the schema is the description, whether the variable is absent or present-but-invalid; `code` still classifies it as missing or invalid. Whitespace runs collapse to single spaces to preserve rule 1, and a `custom` issue with no message of its own falls back to `invalid value`. Rule 2 covers this library's generated text; a value interpolated into an authored message is printed as written.

### 6.2 `BymaxConfigValidationError`

```typescript
export class BymaxConfigValidationError extends Error {
  public readonly code = 'BYMAX_CONFIG_VALIDATION'
  public readonly issues: ReadonlyArray<ConfigIssue>
}

export interface ConfigIssue {
  /** Nested config path, e.g. "database.url". */
  readonly path: string
  /** Resolved environment variable name, e.g. "DATABASE_URL". */
  readonly variable: string
  /** Stable machine-readable code. */
  readonly code: ConfigIssueCode
  /** Human-readable constraint description, value-free. */
  readonly message: string
}
```

### 6.3 Error Code Catalog

| Code                       | Meaning                                               |
| -------------------------- | ----------------------------------------------------- |
| `BYMAX_CONFIG_VALIDATION`  | One or more schema violations (top-level error code)  |
| `BYMAX_CONFIG_MISSING`     | Required variable absent from the source (issue code) |
| `BYMAX_CONFIG_INVALID`     | Present but failed its constraint (issue code)        |
| `BYMAX_CONFIG_UNKNOWN_KEY` | Strict mode: source variable matches no declared leaf |

---

## 7. Testing Subpath

`@bymax-one/nest-config/testing` removes every excuse for touching `process.env` in tests.

```typescript
import { createTestConfig, configTestingModule } from '@bymax-one/nest-config/testing'

// A valid, typed, frozen config with selective overrides.
const config = createTestConfig(envSchema, {
  database: { url: 'postgres://localhost:5432/test' }
})

// A ready-to-import testing module for Nest TestingModule graphs.
const moduleRef = await Test.createTestingModule({
  imports: [configTestingModule(envSchema, { server: { port: 0 } })],
  providers: [InvoiceService]
}).compile()
```

Contract:

- `createTestConfig` synthesizes a complete valid source from the schema (defaults where declared, deterministic placeholder values elsewhere), applies overrides, then runs the exact production pipeline (validate, freeze). Tests exercise the same code path users run.
- Placeholder synthesis never fabricates values that could pass secret-strength constraints accidentally weak; length and format constraints are honored.
- The subpath has no Jest dependency and works with any runner, though the family standard is Jest.

---

## 8. What is NOT in the package

| Excluded                       | Rationale                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env` file loading            | Process environment population is the platform's job: Node's native `--env-file`, container orchestrators, or CI secrets. Bundling a loader (dotenv) would add a dependency and a second source-of-truth. |
| Remote / dynamic configuration | Feature-flag services and remote config imply polling, caching, and partial updates, a different problem with different failure modes.                                                                    |
| Secrets-manager integrations   | Vault, AWS Secrets Manager, and similar belong in deployment tooling or a dedicated provider that materializes values into the source record before validation (supported via `source`).                  |
| Hot reload of configuration    | Config is immutable per process by design; changed environment means a new deployment.                                                                                                                    |
| Feature flags                  | Flags are runtime product state, not process configuration.                                                                                                                                               |

---

## 9. Dependencies and Packaging

### 9.1 `package.json` Essentials

```jsonc
{
  "name": "@bymax-one/nest-config",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "files": ["dist"],
  "dependencies": {},
  "peerDependencies": {
    "@nestjs/common": "^11.0.16",
    "@nestjs/core": "^11.1.18",
    "reflect-metadata": "^0.2.0",
    "zod": "^4.0.0"
  }
}
```

- **All peers are required.** None are marked optional: optional peers are not auto-installed by package managers and break subpath resolution in consumers.
- The same versions appear in `devDependencies` so the package builds and tests in isolation.
- `exports` maps `.` and `./testing` to ESM (`.mjs`), CJS (`.cjs`), and `.d.ts`/`.d.cts` artifacts produced by tsup. No deep imports.

### 9.2 Build

tsup produces both module formats without `emitDecoratorMetadata`; therefore every injection site uses explicit `@Inject(token)`, a family-wide invariant. Bundles ship unminified with JSDoc intact: these are server-side artifacts where readable stack traces outweigh byte counts.

### 9.3 Publishing

Public npm, `--provenance`, released from CI via OIDC (no long-lived npm tokens). Versioning follows semver strictly: patch for fixes, minor for backward-compatible features, major for breaking changes with a migration section in the changelog.

---

## 10. Quality Gates

| Gate              | Tool / Threshold                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Type safety       | TypeScript strict; `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; zero `any`                          |
| Lint              | ESLint flat config; restricted imports ban `dotenv`, bare `crypto`, and other non-`node:` builtins                                |
| Unit coverage     | Jest, **100%** line / branch / function / statement, enforced via `coverageThreshold` in both jest configs                        |
| Test discipline   | Every `it()` carries a comment stating the scenario and the rule it protects                                                      |
| Mutation testing  | Stryker as a pre-release gate: thresholds `high: 99, low: 95, break: 95`                                                          |
| Bundle size       | `scripts/check-size.mjs`, budgets in KiB (brotli), calibrated to the real artifact as a bloat tripwire                            |
| Package integrity | `scripts/dogfood-smoke-test.mjs`: resolves and imports every subpath in both ESM and CJS from a packed tarball before any release |

A release is blocked unless every gate is green.

---

## 11. Repository Standard

The repository ships the full `@bymax-one` open-source baseline:

- `README.md` with badges (CI, coverage, npm version, license, and security posture), quick start, and API reference.
- `LICENSE` (MIT), `SECURITY.md` (private vulnerability reporting), `CHANGELOG.md` (Keep a Changelog format), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, by reference).
- `.github/workflows/`: `ci.yml` (lint, typecheck, build, tests with coverage), `codeql.yml`, `scorecard.yml`, `release.yml` (npm publish with provenance via OIDC), plus `dependabot.yml` and issue templates. CodeQL and OpenSSF Scorecard activate once the repository is public.
- Local governance: husky (`pre-commit` running lint-staged, `commit-msg` running commitlint), Conventional Commits enforced locally and in CI.

---

## 12. Known Limitations

1. **Two-level namespace convention.** The path-inference utilities target `namespace.leaf` schemas. Deeper nesting validates correctly but is not covered by `get()` path inference; `getAll()` remains fully typed for arbitrary depth.
2. **String-shaped sources only.** The source record is `Record<string, string | undefined>` by design (the shape of a process environment). Structured sources must be serialized into that shape before validation.
3. **Boot-time cost is schema-proportional.** Very large schemas add milliseconds to bootstrap. This is a deliberate trade: the cost is paid once, before traffic.
4. **No multi-source precedence.** One source record per module registration. Precedence between layers (defaults, env, secrets) is the caller's composition (`{ ...a, ...b }`), kept explicit on purpose.

---

## 13. Example Integration

```typescript
// src/config/env.schema.ts
import { defineEnv } from '@bymax-one/nest-config'
import { z } from 'zod'

export const envSchema = defineEnv({
  server: z.object({
    port: z.coerce.number().int().default(3000),
    env: z.enum(['development', 'test', 'production']).default('development')
  }),
  database: z.object({ url: z.url() }),
  redis: z.object({ url: z.url() }),
  log: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info')
  })
})

export type AppConfig = typeof envSchema.infer
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common'
import { BymaxConfigModule, ConfigService } from '@bymax-one/nest-config'
import { BymaxLoggerModule } from '@bymax-one/nest-logger'
import { BymaxCacheModule } from '@bymax-one/nest-cache'
import { envSchema, type AppConfig } from './config/env.schema'

@Module({
  imports: [
    BymaxConfigModule.forRoot({ schema: envSchema }),

    // Sibling libraries never read the environment: they receive
    // validated values through their forRootAsync factories.
    BymaxLoggerModule.forRootAsync({
      useFactory: (config: ConfigService<AppConfig>) => ({
        level: config.get('log.level'),
        pretty: config.get('server.env') !== 'production'
      }),
      inject: [ConfigService]
    }),

    BymaxCacheModule.forRootAsync({
      useFactory: (config: ConfigService<AppConfig>) => ({
        url: config.get('redis.url'),
        namespace: 'my-service'
      }),
      inject: [ConfigService]
    })
  ]
})
export class AppModule {}
```

A process started with an incomplete environment exits immediately with the aggregated report from section 6.1; a process that boots is guaranteed to hold a complete, typed, frozen configuration.

---

## 14. Implementation Phases

High-level sequencing for the initial release (details tracked in `docs/development_plan.md`):

1. **Schema engine**: `defineEnv`, source mapping, coercion conventions, `deepFreeze`.
2. **Validation pipeline**: aggregated issue collection, value-free reporting, error model and codes.
3. **Module and DI**: `ConfigurableModuleBuilder` wiring, tokens, `forRoot`/`forRootAsync`, global extras.
4. **Typed accessor**: `Path`/`PathValue` inference, `ConfigService`.
5. **Testing subpath**: `createTestConfig`, `configTestingModule`.
6. **Hardening and release**: mutation testing to threshold, bundle budgets, dogfood smoke test, provenance publish.
