<p align="center">
  <img src="https://img.shields.io/badge/%40bymax--one-nest--config-000000?style=for-the-badge&logo=nestjs&logoColor=E0234E" alt="@bymax-one/nest-config" />
</p>

<h1 align="center">@bymax-one/nest-config</h1>

<p align="center">
  <strong>Typed and validated environment configuration for NestJS</strong><br />
  <sub>Zod v4 · Fail-fast at bootstrap · Value-free errors · Typed dot-path access · Testing helpers · Zero Runtime Dependencies</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bymax-one/nest-config"><img src="https://img.shields.io/npm/v/@bymax-one/nest-config?style=flat-square&colorA=000000&colorB=000000" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@bymax-one/nest-config"><img src="https://img.shields.io/npm/dm/@bymax-one/nest-config?style=flat-square&colorA=000000&colorB=000000" alt="npm downloads" /></a>
  <a href="https://github.com/bymaxone/nest-config/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/bymaxone/nest-config/ci.yml?branch=main&style=flat-square&colorA=000000&label=CI" alt="CI status" /></a>
  <a href="https://github.com/bymaxone/nest-config/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/coverage-100%25-brightgreen?style=flat-square&colorA=000000" alt="coverage" /></a>
  <a href="https://github.com/bymaxone/nest-config/blob/main/docs/mutation_testing_results.md"><img src="https://img.shields.io/badge/mutation-95.72%25-brightgreen?style=flat-square&colorA=000000" alt="mutation score" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/bymaxone/nest-config"><img src="https://api.scorecard.dev/projects/github.com/bymaxone/nest-config/badge?style=flat-square" alt="OpenSSF Scorecard" /></a>
  <a href="https://github.com/bymaxone/nest-config/blob/main/LICENSE"><img src="https://img.shields.io/github/license/bymaxone/nest-config?style=flat-square&colorA=000000&colorB=000000" alt="license" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" /></a>
</p>

<p align="center">
  <a href="https://github.com/bymaxone/nest-config">GitHub</a> ·
  <a href="https://github.com/bymaxone/nest-config/issues">Issues</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-api-reference">API Reference</a> ·
  <a href="https://github.com/bymaxone/nest-config-example">Example App</a>
</p>

---

## ✨ Overview

`@bymax-one/nest-config` gives a NestJS application a single, typed, validated entry point
for environment configuration. It validates `process.env` exactly once at bootstrap against a
[Zod](https://zod.dev) v4 schema, fails fast with one aggregated report, and exposes the
result as a frozen object reached through typed dot paths.

The library has **zero direct dependencies** — `zod`, `reflect-metadata` and `@nestjs/*`
arrive as peer dependencies, so you control exact versions and the supply-chain surface stays
minimal.

### Why nest-config?

- **A misconfigured process does not boot.** Validation runs before the application context
  finishes building, so a service that is missing a secret never accepts the first request
  that would need it.
- **One round trip to fix the environment.** Every violation is collected and reported
  together, not the first one that fails.
- **Errors are value-free by contract.** Configuration is where the secrets are, and the
  report is the artifact that gets logged and pasted into issues — so messages carry the
  expected constraint and the schema's own enum options, never the received value.
- **The schema is the type.** `get('database.url')` is `string` and `get('server.port')` is
  `number` because the schema says so; a typo in a path is a build error, not a runtime
  `undefined`.

---

## 🔥 Features

### ✅ Validation

- ✅ **Validate once, at bootstrap** — parsed and validated a single time, before the
  application serves traffic; there is no lazy path that could discover a problem later
- ✅ **Fail fast, fail complete** — every violation reported together in one aggregated
  error, so an operator fixes the environment in one round trip
- ✅ **Never echo values** — messages carry variable names, paths and constraint
  descriptions only, so a secret cannot reach a log or a crash report through this library
- ✅ **Zod v4 schemas** — the full type language, including coercion, refinements and
  defaults, with `defineEnv` shaping namespaces and leaves

### 🔒 The Validated Object

- ✅ **Immutable by construction** — deep-frozen before it enters the DI container;
  configuration is a fact about the process, not a mutable bag
- ✅ **Typed dot-path access** — `get('database.url')` is `string`, `get('server.port')` is
  `number`, with no casts and no `any` in the chain
- ✅ **Injectable environment** — the raw source defaults to `process.env` but is a plain
  injectable record, so a test validates any input without touching the real environment

### 🧩 Developer Experience

- ✅ **Zero runtime dependencies** — `zod`, `reflect-metadata` and `@nestjs/*` all arrive as
  peers, so you pin the versions
- ✅ **Testing entry point** — `./testing` builds the same validated object from an explicit
  record, so a test never passes because a variable happened to be set on the machine
- ✅ **One class identity** — the module and its testing entry share a single `./internal`
  bundle, so `ConfigService` is the same injection token from either, in ESM and CommonJS
- ✅ **Dual-format output** — ESM + CJS with declarations for each format, verified against
  the packed tarball on every run
- ✅ **Typed end to end** — TypeScript `strict` with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`; zero `any`

---

## 📦 Subpath Exports

| Subpath      | Contents                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | `BymaxConfigModule`, `ConfigService`, `defineEnv`, the DI tokens, `BymaxConfigValidationError` and every option type                                                       |
| `./testing`  | `configTestingModule`, `createTestConfig` — a validated config for a test without booting the application's own                                                            |
| `./internal` | The shared runtime both entry points build on. **Not public API**: it is in the `exports` map because it has to resolve at runtime, not because it is meant to be imported |

`.` and `./testing` are separate bundles, and a module reached from both by a
relative path would be _copied_ into each — a copied class is a different injection
token and a different `instanceof` target. `./internal` is the one bundle they both
import by package specifier, which is what gives `ConfigService` a single identity in
ESM and CommonJS alike.

### Install

```bash
pnpm add @bymax-one/nest-config @nestjs/common @nestjs/core reflect-metadata zod
```

### Peer requirements

| Package            | Version    |
| ------------------ | ---------- |
| Node.js            | `>=24.0.0` |
| `@nestjs/common`   | `^11.0.16` |
| `@nestjs/core`     | `^11.1.18` |
| `reflect-metadata` | `^0.2.0`   |
| `zod`              | `^4.0.0`   |

## 🚀 Quick Start

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

## 📖 API Reference

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

## 🚨 Error Catalog

| Code                       | Meaning                                                |
| -------------------------- | ------------------------------------------------------ |
| `BYMAX_CONFIG_VALIDATION`  | One or more schema violations (top-level error code).  |
| `BYMAX_CONFIG_MISSING`     | Required variable absent from the source (issue code). |
| `BYMAX_CONFIG_INVALID`     | Present but failed its constraint (issue code).        |
| `BYMAX_CONFIG_UNKNOWN_KEY` | Strict mode: source variable matches no declared leaf. |

## 🏗️ Architecture

```
                          process.env
                     (or the record you inject)
                                │
                                ▼
            ┌───────────────────────────────────────┐
            │              defineEnv                │
            │  namespaces at the top, Zod v4 leaves │
            └───────────────────┬───────────────────┘
                                │
                                ▼
            ┌───────────────────────────────────────┐
            │        createValidatedConfig          │
            │   runs ONCE, at bootstrap, and        │
            │   collects EVERY failure first        │
            └─────────┬─────────────────┬───────────┘
                      │                 │
                 all valid          any invalid
                      │                 │
                      ▼                 ▼
              deep-frozen        BymaxConfigValidationError
              BYMAX_CONFIG       one aggregated, value-free report
                      │                 │
                      ▼                 ▼
               ConfigService     the process does not start
          get('db.host') typed          │
          from the schema itself   no request is ever served
                      │                 with a missing secret
                      ▼
        ┌─────────────────────────────┐
        │  ./testing                  │
        │  same pipeline, explicit    │
        │  source — a test cannot     │
        │  pass because a variable    │
        │  happened to be set         │
        └─────────────────────────────┘
```

Validation happens at bootstrap and nowhere else. There is no lazy read, no cache to
invalidate, and no path where a request-time lookup can discover that an environment
variable was missing — by then the process would already have refused to start.

### Design Principles

| Principle                            | Description                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 💥 **Refuse to start**               | A misconfigured process is stopped before it serves a request, rather than discovering the gap at the first call that needs the value                                                      |
| 🤐 **Value-free by contract**        | `errors.ts`, `env-validator.ts` and `report-formatter.ts` each state it for themselves: the message carries the expected constraint and the schema's own options, never the received value |
| 📋 **Report everything at once**     | Validation collects every failure before throwing, so fixing an environment is one cycle instead of one per variable                                                                       |
| 🧊 **Frozen after validation**       | Nothing in the running process rewrites configuration under a component that already read it                                                                                               |
| 🔤 **The schema is the type**        | Dot paths are checked against the schema at compile time, so a typo is a build error rather than a runtime `undefined`                                                                     |
| ⚙️ **Configuration over convention** | Everything goes through `forRoot`/`forRootAsync`. No file discovery, no magic paths, no hidden precedence rules                                                                            |
| 🧩 **One class identity**            | The module and `./testing` import the shared runtime by package specifier, so `ConfigService` is one injection token in ESM and CommonJS alike                                             |

---

## 🔐 Security Model

Configuration is where the secrets are, and a validation report is the one artifact
guaranteed to be printed, logged, and pasted into an issue. That shapes the whole contract.

### Errors are value-free by contract

Every message states the _expected_ constraint — the type, the allowed enum options taken
from the schema, the bound — and never the received value. `env-validator` and
`report-formatter` each say so in their own contracts, and property-based tests hold them
to it.

### Failing fast is the security property

A service that starts with a missing `JWT_SECRET` and discovers it at the first login is a
service that has already accepted traffic it cannot authenticate. The whole schema is
validated before the application context finishes building, so a misconfigured deployment
does not serve one request.

### The validated object is frozen

It is deep-frozen before it enters the container, so nothing in the running process
rewrites configuration under a component that already read it.

### Nothing is read from anywhere but the source you name

`process.env` by default, or the injectable record you provide. No file, no network, no
remote provider — there is no path by which configuration arrives from somewhere you did
not choose.

### Your own messages are yours

Value-free applies to this library's reports. If a `.refine` or a custom message in your
schema includes a value, that message is printed as written.

---

## 🛡️ Security Table

| Layer          | Implementation                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Error messages | Expected constraint only — type, schema-declared enum options, bounds; never the received value                            |
| Failure mode   | Refuse to start; the whole schema is validated before the context finishes building                                        |
| Aggregation    | Every failure reported at once, so a fix cycle is one restart rather than one per variable                                 |
| Immutability   | The validated result is frozen before it is provided                                                                       |
| Sources        | `process.env` only — no file, no network, no remote provider                                                               |
| Type surface   | Dot paths checked against the schema at compile time; a typo is a build error, not a runtime `undefined`                   |
| Supply chain   | `dependencies: {}`; third-party Actions pinned by commit SHA (org-internal reusables by tag); CodeQL and OpenSSF Scorecard |

> [!IMPORTANT]
> **Value-free applies to this library's own reports.** If your schema's `.refine`
> or a custom message includes a value, that message is printed as written.

---

## 🧱 Tech Stack

- **Runtime:** Node.js 24+
- **Framework:** NestJS 11 (`ConfigurableModuleBuilder`, `@Global()`, `Symbol()` tokens)
- **Validation:** Zod `^4` (peer) — the schema language, the coercion and the error source
- **Build:** tsup — ESM + CJS per subpath, with `.d.ts` _and_ `.d.cts` declarations,
  and one shared `./internal` bundle so the module and its testing entry point hold
  a single class identity
- **Tests:** Jest, including property-based tests over the report formatter + Stryker (mutation)
- **TypeScript:** 5.x strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), zero `any`

---

## 🧪 Testing & Quality

Configuration decides whether a process may start at all, so the suite is held to a bar
beyond "the tests pass".

- ✅ **100% line coverage** — statements, branches, functions and lines, enforced as a gate
- ✅ **95.72% mutation score** — verified with [Stryker](https://stryker-mutator.io/) at
  `break: 95`; the eleven survivors are provable equivalents, documented in the
  [report](./docs/mutation_testing_results.md)
- ✅ **The value-free guarantee is tested, not assumed** — a sentinel secret is placed in a
  source and the assertion is that it appears nowhere in the rendered report or in the thrown
  error, because a guarantee about what is _absent_ is the one thing an ordinary assertion
  about output does not cover
- ✅ **Published-artifact gates** — `check:exports` resolves the types the way each module
  system does, `check:runtime` loads every subpath from the packed tarball in ESM and
  CommonJS, and `check:published` compiles this README's snippets against `dist/`
- ✅ **Zero suppressions** — no coverage or mutation directives in the production source

```bash
pnpm test          # unit suite
pnpm test:cov      # unit suite with the 100% coverage gate
pnpm mutation      # Stryker mutation testing (break: 95)
pnpm typecheck     # tsc strict check
pnpm lint          # ESLint
```

### Testing helpers

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

## 🚫 Known Limitations

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

## 🤝 Contributing

Pull requests are welcome. Please open an issue first for significant changes.

- Read [`docs/technical_specification.md`](./docs/technical_specification.md) for architecture decisions.
- Run the full gate listed in [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR.
- Conventional Commits are enforced by `commitlint.config.cjs`.

---

## 🔒 Security Policy

If you discover a security vulnerability, please **do not** open a public
issue. Instead, email us at **support@bymax.one** with `[security]
@bymax-one/nest-config` in the subject. We take security seriously and will
respond promptly. See [`SECURITY.md`](./SECURITY.md) for the full policy.

---

## 📄 License

[MIT](./LICENSE) © [Bymax One](https://github.com/bymaxone)

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/bymaxone">Bymax One</a></sub>
</p>
