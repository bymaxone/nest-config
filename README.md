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
  <a href="https://github.com/bymaxone/nest-config/blob/main/docs/mutation_testing_results.md"><img src="https://img.shields.io/badge/mutation-100.00%25-brightgreen?style=flat-square&colorA=000000" alt="mutation score" /></a>
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

- **A misconfigured process does not boot**, so no request meets a missing secret.
- **One round trip fixes the environment**: every violation is reported together.
- **The report is safe to log and paste**: generated messages never carry a received value.
- **The schema is the type**: a typo in a path is a build error, not a runtime `undefined`.

---

## 🔥 Features

### ✅ Validation

- ✅ **Validate once, at bootstrap** — parsed and validated a single time, before the
  application serves traffic; there is no lazy path that could discover a problem later
- ✅ **Fail fast, fail complete** — every violation reported together in one aggregated
  error, so an operator fixes the environment in one round trip
- ✅ **Never echo values** — generated messages carry variable names, paths and constraint
  descriptions only, so a secret cannot reach a log or a crash report through this library;
  a `custom` message you write yourself is printed as written and is yours to keep value-free
- ✅ **Zod v4 schemas** — the full type language, including coercion, refinements and
  defaults, with `defineEnv` shaping namespaces and leaves

### 🔒 The Validated Object

- ✅ **Immutable by construction** — plain objects and arrays are deep-frozen before the
  object enters the DI container; configuration is a fact about the process, not a mutable
  bag (a `Date`, `Map` or `Set` leaf is frozen as an object but keeps its own mutators, see
  [The validated object is frozen](#the-validated-object-is-frozen))
- ✅ **Typed dot-path access** — `get('database.url')` is `string`, `get('server.port')` is
  `number`, with no casts and no `any` in the chain
- ✅ **Injectable environment** — the raw source defaults to `process.env` but is a plain
  injectable record, so a test validates any input without touching the real environment

### 🧩 Developer Experience

- ✅ **Zero runtime dependencies** — `zod`, `reflect-metadata` and `@nestjs/*` all arrive as
  peers, so you pin the versions
- ✅ **Testing entry point** — `./testing` builds the same validated object from a source it
  synthesizes from the schema and your overrides, so a test never passes because a variable
  happened to be set on the machine
- ✅ **One class identity** — the module and its testing entry share a single `./internal`
  bundle, so `ConfigService` is the same injection token from either, in ESM and CommonJS
- ✅ **Dual-format output** — ESM + CJS with declarations for each format, verified against
  the packed tarball on every run
- ✅ **Typed end to end** — TypeScript `strict` with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`; zero `any`

---

## 📦 Subpath Exports

| Subpath      | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | `BymaxConfigModule`, `ConfigService`, `defineEnv`, `resolveSourceNames`, the DI tokens, `BymaxConfigValidationError`, `ConfigErrorCode` and every option type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `./testing`  | `configTestingModule`, `createTestConfig` — a validated config for a test without booting the application's own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `./internal` | The shared runtime both entry points build on. **Not public API**: it is in the `exports` map because it has to resolve at runtime, not because it is meant to be imported, and it carries no compatibility promise: any export can change in any release. Besides the root's exports it holds `createValidatedConfig`, `assertNamespaces`, `assertDistinctVariables`, `guarded`, `libraryError` and `unusableOverrideIssues`, the validation steps the entry points share. `libraryError` builds the errors the guards pass through unchanged, so code that imports it can forge them: the brand protects against an ordinary throw of the public error class, not against code that deliberately imports this subpath |

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
| `zod`              | `^4.6.6`   |

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

  DATABASE_URL          missing required value
  AUTH_JWT_SECRET       too short (expected: string, minimum 32 characters)
  SERVER_PORT           out of range (expected: number <= 65535)

Fix the variables above and restart the process.
```

The report has one line per violation: when a leaf fails several rules, the line shows the first
one Zod lists, and fixing it can reveal the next on the following start. A `meta({ env })` that
cannot name a variable adds its own line for that leaf, before the line about its value, because it
is a different mistake: merging the two would hide the one that explains the other.

In a message this package generates, raw values are never printed — not
truncated, not masked, absent. That is a hard guarantee, verified by tests. The
one exception is a message you write yourself, described next.

A rule you write yourself — a `.check`, `.refine` or `.superRefine` raising a
`custom` issue — has no structural constraint to describe, so its own message is
what the report prints:

```
BymaxConfigValidationError: environment validation failed (2 issues)

  STORAGE_ENDPOINT      STORAGE_ENDPOINT is required when STORAGE_ENABLED is true.
  LOG_PRETTY            LOG_PRETTY must be false when NODE_ENV is production.

Fix the variables above and restart the process.
```

The message is used whether the variable is absent or present-but-invalid — a
conditional rule explains an absent variable better than "missing required
value" does — while `issue.code` still classifies it as
`BYMAX_CONFIG_MISSING` or `BYMAX_CONFIG_INVALID`. Whitespace runs collapse to
single spaces so a message wrapped across source lines keeps the one-line
layout.

A `custom` issue raised without a message falls back to `invalid value`. Zod
fills a message-less `custom` issue with its own default text before the
validator sees it, so "no message" is recognized by matching that default
(`Invalid input`) rather than by its absence. Two consequences, both deliberate:
that exact string is reserved — a schema that authors it verbatim reports
`invalid value` — and under a configured non-English Zod locale (or a global
custom error map) the default no longer matches, so the localized default is
reported as written instead.

A rule on a namespace as a whole, such as a `.check` that compares two of its leaves, names no
leaf unless its issue sets a `path`. Without one it is reported against the namespace: the
`path` is the namespace key, the variable column shows its prefix followed by `*`
(`STORAGE_*`), and the message is the one the rule wrote. A rule on the whole schema is reported
with the variable column `(schema)` and an empty `path`. Zod does not run a namespace's own rule
once one of that namespace's leaves has failed, so such a rule appears once the leaves are valid.

## ⚙️ Configuration

### `BymaxConfigModule`

| Method                  | Signature                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `forRoot(options)`      | `(options: BymaxConfigModuleOptions & { isGlobal?: boolean \| null \| undefined }) => DynamicModule`                                           |
| `forRootAsync(options)` | `(options: ConfigurableModuleAsyncOptions<BymaxConfigModuleOptions, 'create'> & { isGlobal?: boolean \| null \| undefined }) => DynamicModule` |

`BymaxConfigModuleOptions`:

| Field               | Type                                                        | Required | Notes                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`            | `EnvSchema`                                                 | yes      | Produced by `defineEnv`. A top-level key that is not a `z.object` namespace, a namespace named `toJSON` and two leaves that read one variable are reported at boot as `BYMAX_CONFIG_INVALID` issues.                                                                |
| `source`            | `Record<string, string \| undefined>`                       | no       | Defaults to `process.env` when the key is omitted; a key present with the value `undefined` or `null` throws a `TypeError` at boot. Injectable for tests.                                                                                                           |
| `onValidationError` | `((issues: ReadonlyArray<ConfigIssue>) => unknown) \| null` | no       | Observability hook invoked before the fail-fast throw; a promise it returns is awaited. Cannot suppress the failure. `undefined` or `null` means no hook.                                                                                                           |
| `strict`            | `boolean \| null`                                           | no       | When true, source variables matching a namespace prefix but no declared leaf raise `BYMAX_CONFIG_UNKNOWN_KEY`. Defaults to `false`, and so does `undefined` or `null`. Read [Strict mode and shared prefixes](#strict-mode-and-shared-prefixes) before enabling it. |

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

`forRootAsync` takes Nest's configurable-module options: `useFactory` with
`inject` and `imports`, shown above; `useClass`, a class whose `create()` returns the options; and
`useExisting`, which reuses a provider that is already registered (import its module through
`imports`):

```typescript
class ConfigOptionsFactory {
  public create(): { schema: typeof envSchema; source: Record<string, string | undefined> } {
    return { schema: envSchema, source: { ...process.env } }
  }
}

BymaxConfigModule.forRootAsync({ useClass: ConfigOptionsFactory })
```

`isGlobal` defaults to `true`; `false` scopes the module to a submodule, through the standard extras.
`isGlobal` and `strict` must be booleans: any other value except `undefined` and `null` (the default)
throws a `TypeError` that names the method, the option and the type received, never the value, at
registration, or for a `strict` that `forRootAsync` resolves through a factory, a class or an existing
provider, when the options provider resolves.

An optional option key set to `undefined` or `null` means its default. `source` is the exception, as its
row in the options table says, because a source that failed to load must not become `process.env`.

The options are read by property access, so an object whose options are accessors, such as a class
instance, works like a literal. `forRoot` and `forRootAsync` hand the `BYMAX_CONFIG_OPTIONS` token only
`schema`, `source`, `onValidationError` and `strict`, whichever of `forRoot`, `useFactory`, `useClass` or
`useExisting` produced them. A plain object that lists a key its entry point does not read is refused with a
`BymaxConfigValidationError` that names the key (code `BYMAX_CONFIG_UNKNOWN_KEY`), so a misspelled `strict`
cannot leave validation laxer without a word. **Only a plain object is key-checked**: a literal, or an
object with no prototype. An options object that is not plain, an instance of a class or an object created
with `Object.create` on an ordinary object, boots with a misspelled key silently ignored, because its own keys
are its fields. Its `schema`, `source`, `onValidationError` and `strict` are still read by name, and its
`strict` and `onValidationError` are checked by kind like those of a literal.
`onValidationError`, when it is not `undefined` or `null`, must be a function, or the
registration throws a `TypeError` that names the type received.
The same holds for a plain object that a `useFactory`, `useClass` or `useExisting` provider returns, such as
one with `isGlobal` or `{ ...process.env, schema }`: it fails when the options provider resolves, with each
extra key listed by name and never a value.

Code of yours that runs while the module reads these values is refused when it throws. That covers an
accessor or a Proxy among the options, in `schema` or in `source`, and the object an options factory or a
`useClass` provider returns, including a `then` that throws while it is awaited. A factory that throws or
rejects is refused the same way. The refusal is a `BymaxConfigValidationError` of one issue that names the
step (`reading the options of forRoot`, `reading the schema`, `reading the source`, `reading what the
options factory returned`) and the class of what was thrown, never its message. The original is the
non-enumerable `cause`: read it from there, and note that `util.inspect` and an uncaught-exception report
print it. A `BymaxConfigValidationError` that your own code builds and throws is refused like any other
error, with it as the `cause`; only one the library raised itself, inside a call your factory makes to it,
passes unchanged. `source` and `strict` are read once.

Two things are not covered. A factory result, or a `then`, that never settles holds the boot, like a
factory that never resolves: the module sets no timeout, so give such a call its own. And a rule of your
schema that throws is reported as one issue for the whole schema (`a rule threw <class>`) with no
`cause`, on purpose: what a rule throws can quote the value it received, and the cause is printed with
the error.

The library captures the built-ins it calls directly when it is imported: `String.prototype.codePointAt`,
`String.fromCodePoint`, `RegExp.prototype.exec`, `Reflect.get` and `Reflect.set`, which copy and escape the
issues of an error, and `Object.hasOwn` and `Object.getPrototypeOf`, which the option reader walks with. It does not defend its dependencies, or the built-ins it reads live, against a
replacement made after the import: code that does that is already running with the process's authority.
A name planted on `Object.prototype` is a different case and is handled: it is never taken for an option,
nor for a `meta({ open })` or `meta({ env })` of a schema. The rule is: an option is read unless the first
object that holds it, other than the options object itself, has no prototype. The trade-off is that an option
held only by a parent you built with `Object.create(null)` is not read; put it on the options object, or on a
parent that has a prototype. The names the library reads from the objects zod builds for a schema
follow the same rule; what zod itself reads from its own objects when it parses is zod's, and is not covered.

At load the library records the built-ins it calls. Every entry point that starts a validation compares each
with the one it recorded, by identity. One that was replaced is refused
with a `BymaxConfigValidationError` that carries the number replaced and nothing else, and nothing throws at
import. Load order matters: a polyfill that replaces a built-in after the library is imported is refused at
boot, so load polyfills first. The import checks that the global `Promise` is the constructor of the promises of an async function: a stand-in in its place stops the import and names the cause, while one that also replaced `Promise.prototype.constructor` is not told apart. A replacement made before the import is outside what the library can check: if `Object.getOwnPropertyDescriptor` throws before the package is imported, the compiled import helper of the package fails before any code of the library runs. The reads of `ConfigService` do not check again after the boot, and the
redaction of the configuration uses the `Object.defineProperty` taken at load, so a replacement made while the
validation runs cannot leave its values printable.

These checks are best-effort hardening, not a security boundary: code in the same process is trusted, as it
is in Node, and the threat model in `SECURITY.md` names the limits that remain.

Not defended against: what zod and Node define with their own descriptors; a schema leaf that
a host replaces with an accessor or a read-only property; and a `then` planted on `Object.prototype`, which
every promise in the process, Nest's own among them, adopts, and which the validated configuration, an
ordinary object, does not escape.

A promise your options factory or `onValidationError` hook returns is pinned and awaited natively. One that cannot take a property, because it is frozen, not extensible, or carries a non-configurable own `constructor`, is followed through the `then` taken at load, which reads the species constructor: a throwing `Promise[Symbol.species]` planted inside that call then refuses the options factory's result, and the promise's own rejection is left without a handler. A non-configurable own `constructor` getter that throws takes the same path, with the getter's error as the cause.

The module, the config provider and an options provider that carries a factory, which the library rebuilds, have no prototype; the providers you bring in, and the objects Nest builds inside its own builder, are left as they are and are not covered.

Three edges of the same rule. A hook that rethrows a library error it caught from another validation
does not pass that error through: the boot fails with its own validation error, with the hook's error
as `cause`, like any error of a hook. A library error that crosses the CommonJS and the ESM copies of
the package is treated as one you built, since the two copies are two classes with two markers: it is
wrapped, with the original as `cause`. And `ConfigService.get` and `has` call `toString` on the path you
pass, so a path whose `toString` throws throws that error as it is, the error of your own call;
`getAll()` returns the object the service was given, which in a module is the deep-frozen root.

The mark that tells the library's own errors from yours does not expire: an error the library raised
keeps passing the guards if your code catches it and throws it again later. It carries only the text the
library wrote, so replaying it discloses nothing.

The values the library finds are the ones it reads by name. A declared variable of the `source` is read
by name, so one held as a non-enumerable or inherited property, or answered only by the `get` trap of a
`Proxy`, is found instead of replaced by its default. Source values are strings (`process.env` holds
nothing else), and a value that is not one is validated like any other: it is refused if it does not
satisfy the schema, not replaced by the default. The one thing never taken is what the root prototype of a
realm supplies, in this realm or another (a variable named `toString`, say, or one planted on
`Object.prototype`), which is not a value of the source: the first object on the chain that holds the name
must be the source itself or have a prototype of its own, so a value held only by a parent you built with
`Object.create(null)` is not read. Any other value held under such a name is validated, and a variable
named `__proto__` is taken only as a property of the source's own, never as the prototype of the object. The `source` must be an
object of variables: an array, a `Map`, a `Set`, a function or a primitive is refused with a
`BymaxConfigValidationError` that describes what was received, never a value. The other keys of the `source`
are the ones it lists, which is what strict mode reports.

A namespace or leaf may be named like a member of `Object.prototype` (`constructor`, `valueOf`); it takes its
default and its value like any other. A name of `__proto__` cannot be held as a property, so a schema that
declares one is refused with an `INVALID` issue instead of having its value dropped.

The overrides of the test helpers are read by their own property names, enumerable or not, and then by
the names the schema declares, so an overrides object held by a `Proxy` that lists nothing, or built on
a bare prototype, still supplies its values; a symbol key is ignored. A key the schema does not declare
is reported only when the object lists it. An overrides object made in another realm (a `node:vm`
context, say) is a plain object like any other.

`ConfigService` reads the configuration it is given by its own property names, once, when it is built:
`BYMAX_CONFIG` must be a plain object with own fields, as the module provides. A `Proxy` that lists
nothing is read as an empty configuration, and a namespace that is a function, a string or an
array holds no leaves.

The options must be objects: the argument of `forRoot` and `forRootAsync`, and what an asynchronous
provider resolves to. A primitive, `null`, a function or a class with static options throws a `TypeError`
that names the method and the type received, never the value.

The `forRootAsync` keys come from Nest's configurable-module builder:

| Key                          | Type                                                           | Default | Notes                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `useFactory`                 | `(...args) => BymaxConfigModuleOptions \| Promise<...>`        | none    | Returns the options. A result that is not an object is refused with the `TypeError` above.                                   |
| `inject`                     | `FactoryProvider['inject']`                                    | `[]`    | The tokens handed to `useFactory`. One Nest cannot resolve fails the module compile with Nest's unresolved-dependency error. |
| `imports`                    | `ModuleMetadata['imports']`                                    | none    | The modules whose providers `inject` can reach.                                                                              |
| `useClass`                   | `Type<{ create(): BymaxConfigModuleOptions \| Promise<...> }>` | none    | A class instantiated as a provider; its `create()` returns the options.                                                      |
| `useExisting`                | the same                                                       | none    | Reuses a provider that is already registered.                                                                                |
| `provideInjectionTokensFrom` | `Provider[]`                                                   | none    | The parent module's providers, filtered down to the ones `inject` names, to hand options to nested async modules.            |

Giving none of `useFactory`, `useClass` and `useExisting` is not refused at registration: compiling the module fails with Nest's unresolved-dependency error for the options token.

#### Strict mode and shared prefixes

**A declared namespace claims its entire variable prefix.** Under `strict`, any
source variable starting with that prefix and matching no declared leaf fails
the boot — including variables this application never reads because _another
program_ reads them. A namespace named `otel` claims `OTEL_*`, so the
OpenTelemetry SDK's own `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_TRACES_SAMPLER`
are rejected; a namespace named `redis` claims `REDIS_*`, so a `REDIS_PORT` that
only a compose file reads is rejected too. A prefix matching no declared
namespace at all (`POSTGRES_*` with no `postgres` namespace) is never inspected,
which is why the failure lands hardest on schemas that share a prefix with a
library or a tool — the common case, not the edge one.

Declare such a namespace **open** to waive the check for the remainder of its
prefix:

```typescript
export const envSchema = defineEnv({
  // OTEL_ENABLED is declared, read and validated. Every other OTEL_* variable
  // is the SDK's, and strict leaves it alone.
  otel: z.object({ enabled: z.stringbool().default(false) }).meta({ open: true }),
  database: z.object({ url: z.url() })
})
```

What the waiver does and does not do:

- **Declared leaves stay bound.** `OTEL_ENABLED` is still read, coerced and
  validated. Opening a namespace waives unknown-key detection only; it never
  weakens the validation the schema does perform.
- **The waiver is per namespace.** A stray `DATABASE_TYPO` is still reported
  while `otel` is open. One open namespace does not disable strict mode.
- **The most specific namespace wins.** If a schema declares both `otel` (open)
  and `otelExporter` (closed), `OTEL_EXPORTER_TYPO` belongs to `otelExporter`
  and is still reported.

#### Where prefixed variables come from that a sweep will miss

Before enabling `strict`, know that reading your own repository does not enumerate
what reaches `process.env`. Two sources defeat a migration sweep in different ways
— one because the search you would naturally run is the wrong one, the other
because there is nothing to search — and both were found by adopters rather than
by reading manifests.

**A container's own `environment:` block.** Compose assigns variables to the
container with no `${...}` on the host side to give them away:

```yaml
services:
  app:
    environment:
      REDIS_PASSWORD: ${STACK_REDIS_PASSWORD:-}
```

`REDIS_PASSWORD` lands in the application's environment. A repository-wide search
for the prefix does find this line — but the search a migration actually reaches
for is over interpolations, `${REDIS_`, and that one finds nothing, because the
interpolated name is the _other_ one. The variable the container receives and the
variable the host supplies are different names on the same line.

This one fails on the default path rather than only when someone opts in, and the
reason is worth stating: **Compose assigns an unset interpolation the empty string,
not absent.** Validation skips a variable whose value is `undefined` — an absent
variable is the schema's business, not strict mode's — and `''` is not `undefined`.
So the boot fails even when nobody set a password. That is deliberate: a validator
that ignored empty strings would also ignore a real misconfiguration that sets one.

**Kubernetes service links, which appear in no file at all.** With
`enableServiceLinks` at its default, a pod receives Docker-link-compatible
variables for every Service in its namespace. A Service named `redis` supplies
`REDIS_PORT`, `REDIS_SERVICE_HOST`, `REDIS_SERVICE_PORT` and the
`REDIS_PORT_6379_TCP*` family — all inside a closed `redis` namespace, none
declared, none written down anywhere you can search. Under `strict` that is a crash
loop in production over variables the application never reads, and it will not have
appeared in CI.

Set `enableServiceLinks: false` on the pod spec, or open the namespace. Managed
add-ons injecting names like `REDIS_PUBLIC_URL` or `DATABASE_URL_UNPOOLED` are the
same family.

**The cost, stated plainly:** an open namespace cannot tell a foreign variable
from a misspelled local one. No design removes this — the two cases are
indistinguishable by name — so open the namespaces whose prefix genuinely belongs
to someone else, and leave the rest closed.

The sharpest form of that cost is worth seeing before you accept it. The typo can
be in the open namespace's **own** declared variable: write `OTEL_ENABLE` instead
of `OTEL_ENABLED` and it is waived like any other unclaimed name, the leaf falls
back to its default, and the feature you meant to switch on stays off with nothing
reported. A closed namespace would have named that variable and refused to boot.

> Filtering the foreign names out of `source` instead is **not** equivalent, and
> is worse in a way that is easy to miss: removing `OTEL_*` from the source also
> unbinds the declared `OTEL_ENABLED`, whose `.default()` then manufactures a
> plausible value while the variable silently stops being read.

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
              BYMAX_CONFIG       one aggregated boot-time report
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

---

## 🔐 Security Model

Configuration is where the secrets are, and a validation report is the one artifact
guaranteed to be printed, logged, and pasted into an issue. That shapes the whole contract.

### Errors are value-free by contract

Every message this library generates states the _expected_ constraint — the type, the
allowed enum options taken from the schema, the bound — and never the received value.
Sentinel-secret tests hold the library to it. The messages you write yourself are the exception,
covered below.

### The service does not serialize its configuration

> **Warning: `logger.info(config)` prints every value.** `pino` spreads the enumerable keys of an object
> it is handed as the merge object itself, and the root's redaction is not an enumerable key. The safe
> forms are `logger.info({ config })`, which prints the namespace names only, or better, log the names
> yourself: `logger.info({ namespaces: Object.keys(config) })`. The same holds for a copy of the root.

`ConfigService` keeps the validated root in an ECMAScript private field, so
`JSON.stringify`, `Object.entries`, object spread and `util.inspect` cannot reach the
values. Those are the paths taken by code that renders an injected provider it was handed
incidentally — a logger formatting its arguments, an error reporter capturing the scope of
a throw. `toJSON` returns the declared namespace names, so the omission reads as deliberate
rather than as an empty object. Reading on purpose is unaffected: `get`, `has` and the
`getAll` escape hatch return the real values. `getAll()` returns the root itself, so
`JSON.stringify(configService.getAll())` serializes to the namespace names too; a host that needs the
values to serialize reads a namespace of the root (`configService.getAll().auth`), a leaf
(`get('auth.secret')`), or picks the namespaces it needs (`JSON.stringify({ auth: config.auth })`).

The raw root, whether injected through `BYMAX_CONFIG` or returned by `getAll`, prints
`[BymaxConfig: values redacted]` under `util.inspect`. Measured: `console.log(config)`,
`util.format` and Nest's default text `ConsoleLogger` show no value. The marker is a
non-enumerable property, so `Object.keys`, spread and equality do not include it.

The root also carries a non-enumerable `toJSON` that returns `{ service: 'BymaxConfig', namespaces }`,
the declared namespace names and no value. `JSON.stringify(config)`, `JSON.stringify({ ctx: config })`,
Nest's `ConsoleLogger` with `json: true` and `pino`'s `logger.info({ config })` therefore print the
names only.

It stops there:

- A namespace printed or serialized directly (`console.log(config.auth)`,
  `JSON.stringify(config.auth)`) and a leaf you log yourself show their values.
- A copy of the root made by spread, `Object.assign` or `structuredClone` (`{ ...config }`) drops the
  non-enumerable `toJSON` and `util.inspect` marker, so printing or serializing the copy shows the
  values again.
- `console.dir`, `console.table`, the failure messages of `node:assert`, `util.inspect` with
  `customInspect: false` and `v8.serialize` read the values, because none of them calls the marker or
  `toJSON`. `Object.entries(root)` and `Object.values(root)` hand out the namespaces themselves, so
  serializing their result shows the values too.

Never log the root or a namespace; log leaf names, and use your logger's key-based redaction for
anything that can reach it. A namespace cannot be named `toJSON`: the boot refuses it with a
`BYMAX_CONFIG_INVALID` issue, because that name is the root's serializer.

The redaction is visible on the root: `toJSON` is an own, non-enumerable property, so it appears in
`Object.getOwnPropertyNames(root)` and `Reflect.ownKeys(root)` (`Object.keys` still lists the
namespaces only) and `'toJSON' in root` is `true`. In strict mode code, deleting, assigning or
redefining it throws a `TypeError`, because the root is frozen; in sloppy mode `Object.defineProperty`
still throws, while deleting and assigning silently change nothing. `util.format('%j', root)` prints the
names.

### Failing fast is the security property

A service that starts with a missing `JWT_SECRET` and discovers it at the first login is a
service that has already accepted traffic it cannot authenticate. The whole schema is
validated before the application context finishes building, so a misconfigured deployment
does not serve one request.

### The validated object is frozen

Plain objects and arrays are deep-frozen before the object enters the container, so nothing
in the running process rewrites those values under a component that already read them.

A `Date`, a `Map` or a `Set` leaf is frozen as an object but is **not** made immutable:
`setTime`, `Map.prototype.set` and `Set.prototype.add` still work, because the state they
change lives in internal slots that `Object.freeze` cannot reach, and the entries of a `Map` or
`Set` are not visited. Prefer a string or number leaf, or a `.transform` to a plain value, where
immutability matters.

A `Buffer`, a typed array or a `DataView` is left as it is: `Object.freeze` throws on a view with
elements, so a base64-decoded key stays writable. The object that holds it is frozen.

### What a planted property can still reach

The built-ins that decide something during a validation are taken when the module loads, so host code that replaces one while
a validation runs, from a getter of the source for example, cannot change the decision. What the library
reads through Zod is Zod's: a read-only property defined on the root prototype under the name of a declared
leaf, with no variable set for it, can end up as that leaf's value, because the parsed object is assembled
by Zod and not by the library. That is a limit, not a defence: code able to define properties on
`Object.prototype` already runs with the process's authority, and the validated object is still frozen and
redacted. Keep such code out of the process, or give the leaf a default.

### Nothing is read from anywhere but the source you name

`process.env` by default, or the injectable record you provide. No file, no network, no
remote provider — there is no path by which configuration arrives from somewhere you did
not choose.

### Your own messages are yours

Value-free applies to this library's reports. A `custom` issue from your own `.check`,
`.refine` or `.superRefine` is printed as written — it is schema text, and it is the only
place a conditional or cross-field rule can state itself. That also means the message is
yours to keep value-free: if it interpolates the received value, that value reaches the
report.

Its wording is yours, its form is not: in every field of an issue (the variable, the path and the
message) a control character, a line or paragraph separator, and any other invisible format
character (a zero-width or directional mark, the soft hyphen, the byte order mark) are written as a `\uXXXX` escape (`\u{XXXXX}` past U+FFFF), and a field whose output would pass 200 characters, an escape counting as its full length, is
cut and ends with `…`, so a message or a variable name cannot rewrite or flood a log line. A lone
surrogate is written as an escape too. Other characters stay as written: the spaces other than the plain
one, the Hangul fillers, the variation selectors and the combining marks change no line break or order.
A name that holds a literal backslash-`u` and four digits reads like the escape of the character it
spells.

---

## 🛡️ Security Table

| Layer          | Implementation                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error messages | Expected constraint only — type, schema-declared enum options, bounds; never the received value. A `custom` message from your own schema is the exception: it prints as written |
| Failure mode   | Refuse to start; the whole schema is validated before the context finishes building                                                                                             |
| Aggregation    | Every failure reported at once, so a fix cycle is one restart rather than one per variable                                                                                      |
| Immutability   | Plain objects and arrays in the validated result are frozen before it is provided; a `Date`, `Map` or `Set` keeps its mutators                                                  |
| Service state  | The root lives in a private field; serializing the injected service yields namespace names only                                                                                 |
| Sources        | `process.env` or the record you inject — no file, no network, no remote provider                                                                                                |
| Type surface   | Dot paths checked against the schema at compile time; a typo is a build error, not a runtime `undefined`                                                                        |
| Supply chain   | `dependencies: {}`; third-party Actions pinned by commit SHA (org-internal reusables by tag); CodeQL and OpenSSF Scorecard                                                      |

---

## ✅ Production Checklist

Each item names what goes wrong and the fix. The sections linked from it hold the detail.

- **No `.default()` on a secret.** A default manufactures a value when the variable is missing,
  so a deploy that lost `AUTH_JWT_SECRET` boots with the placeholder instead of refusing. Leave
  secrets required; keep `.default()` for settings that have a safe value.
- **Set `strict: true`.** A variable that starts with a declared namespace prefix but names no
  leaf (`AUTH_JWT_SECERT`) then fails the boot instead of being ignored. Read
  [Strict mode and shared prefixes](#strict-mode-and-shared-prefixes) before enabling it.
- **Report a failed rule with `.refine` or `ctx.issues.push`, not a `throw`.** A rule that throws
  still fails the boot, but as one issue for the whole schema with its message withheld, and the
  leaves after it are not reported. See [Failing fast](#failing-fast-is-the-security-property).
- **The real environment wins over a `.env` file.** With Node's `--env-file` (measured on Node
  24), a variable already set in the process environment is not replaced by the file, so a value
  set by the orchestrator shadows a stale `.env` baked into an image. A blank `NAME=` line in the
  file lands as the empty string when nothing else sets it.
- **No secrets in a committed `.env`.** Commit `.env.example` with names and no values, and
  supply secrets through the platform. Keeping the example honest is a test, shown under
  [`resolveSourceNames(schema)`](#resolvesourcenamesschema).
- **`onValidationError` has no timeout.** A hook that never settles holds the boot. Give the call
  to your log sink its own timeout.
- **Never log the root or a namespace.** The root prints a redacted marker under `util.inspect` and
  serializes to its namespace names under `JSON.stringify`, but a copy of it made by spread, a root
  handed to `pino` as the merge object, and every namespace print their values. Log leaf names, and
  use your logger's key-based redaction.
- **`z.coerce.number()` turns `""` and `" "` into `0`.** A variable set to blank is present, not
  missing. Where `0` is invalid, add `.min(1)` or a bound, or treat a blank as unset:

  ```typescript
  const unsetWhenBlank = (value: unknown): unknown =>
    typeof value === 'string' && value.trim() === '' ? undefined : value

  const port = z.preprocess(unsetWhenBlank, z.coerce.number().int().min(1).max(65535).default(3000))
  ```

- **Use `z.stringbool()` for a flag.** `z.coerce.boolean()` reads `'false'` and `'0'` as `true`, so
  the boot refuses it. Detection covers a `z.coerce.boolean()` leaf directly or under a wrapper
  such as `.optional`, `.default` or `.pipe`; one inside a union, array or lazy schema isn't
  detected, so use `z.stringbool()` there.
- **Copy a binary leaf that must not change.** A `Buffer`, typed array or `DataView` in the
  config is left unfrozen, so its bytes stay writable; copy it if it must not change.

---

## 🧱 Tech Stack

- **Runtime:** Node.js 24+
- **Framework:** NestJS 11 (`ConfigurableModuleBuilder`, `@Global()`, `Symbol()` tokens)
- **Validation:** Zod `^4.6.6` (peer) — the schema language, the coercion and the error source
- **Build:** tsup — ESM + CJS per subpath, with `.d.ts` _and_ `.d.cts` declarations,
  and one shared `./internal` bundle so the module and its testing entry point hold
  a single class identity
- **Tests:** Jest + Stryker (mutation)
- **TypeScript:** 5.x strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), zero `any`

---

## 🧪 Testing & Quality

Configuration decides whether a process may start at all, so the suite is held to a bar
beyond "the tests pass".

- ✅ **100% line coverage** — statements, branches, functions and lines, enforced as a gate
- ✅ **100.00% mutation score** — verified with [Stryker](https://stryker-mutator.io/) at
  `break: 100`; provable equivalents carry their reason inline and nothing else survives
  ([report](./docs/mutation_testing_results.md))
- ✅ **The value-free guarantee is tested, not assumed** — a sentinel secret is placed in a
  source and the assertion is that it appears nowhere in the rendered report or in the thrown
  error; the schema under test writes no `custom` message, so what is proven is the guarantee
  this package makes for its own generated text
- ✅ **The README is executed** — `check:published` compiles its snippets against the built
  package, and the Quick Start runs as written

```bash
pnpm test          # unit suite
pnpm test:cov      # unit suite with the 100% coverage gate
pnpm mutation      # Stryker mutation testing (break: 100)
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
// Leaves createTestConfig fills without an override:
defineEnv({
  text: z.object({ a: z.string().min(8), b: z.email(), c: z.url(), d: z.uuid() }),
  time: z.object({
    at: z.iso.datetime(),
    on: z.iso.date(),
    clock: z.iso.time(),
    when: z.coerce.date()
  }),
  scalar: z.object({
    n: z.coerce.number().int().min(1),
    flag: z.stringbool(),
    kind: z.enum(['a', 'b']),
    fixed: z.literal('x')
  })
})
```

A leaf no placeholder can be known to satisfy, such as a
`z.string().regex(...)` or a `.refine(...)` rule, makes the helper throw a
`BymaxConfigValidationError` whose issue says `no placeholder satisfies this leaf` and names it
(`pass an override for region.code`); give that leaf an override and the helper builds.

```typescript
import { createTestConfig } from '@bymax-one/nest-config/testing'
import { envSchema } from './config/env.schema'

const config = createTestConfig(envSchema, {
  database: { url: 'postgres://localhost:5432/test' }
})
```

`createTestConfig<TShape>(schema: EnvSchema<TShape>, overrides?: ConfigOverrides<TShape>): Readonly<EnvOutput<TShape>>`
and `configTestingModule<TShape>(schema: EnvSchema<TShape>, overrides?: ConfigOverrides<TShape>): DynamicModule`
both throw a `BymaxConfigValidationError` when an override breaks a constraint or when no placeholder
satisfies a leaf (that issue names the leaf to override, by the path it carries, which a path longer
than 200 characters cuts); `configTestingModule` throws at the call, before any module is built. A schema
or an overrides argument whose reading throws is refused as `reading the schema or the overrides`, with the
original as `cause`, and an override key that matches no leaf is reported escaped and bounded, never with
its value. `ConfigOverrides<TShape>` is not exported by name.

`configTestingModule` registers the production `BymaxConfigModule` with a
synthesized source, ready to drop into a Nest `TestingModule` graph:

```typescript
import { Test } from '@nestjs/testing'
import { configTestingModule } from '@bymax-one/nest-config/testing'
import { envSchema } from './config/env.schema'
import { FeatureProvider } from './feature.provider'

const moduleRef = await Test.createTestingModule({
  imports: [configTestingModule(envSchema, { server: { port: 8080 } })],
  providers: [FeatureProvider]
}).compile()
```

Overrides mirror the `namespace.leaf` shape with every key optional and typed from the schema. Each value is converted with `String(value)` before validation, so give
a leaf what its environment variable would hold; an object becomes `'[object Object]'`, and an override
of `undefined` is ignored, so a defaulted leaf cannot be unset. An override whose path matches no leaf
of the schema throws, listing every such path, even when its value is `undefined`; a namespace given
something other than a plain object is reported once, by name, and so is an overrides argument that is
not a plain object; passing `undefined` or `null` for the whole argument means no overrides. Neither helper takes `strict`, a
custom `source`, a hook or `isGlobal`: `configTestingModule` registers the module globally, and a
failure case (a missing variable, a strict violation) is built with
`BymaxConfigModule.forRoot({ schema, source, strict: true })` and a source you write.

Placeholder synthesis never fabricates values that could accidentally pass a
secret-strength constraint; length and format constraints are honored. The
subpath has no Jest dependency and works with any runner, though the family
standard is Jest.

## 📖 API Reference

### `defineEnv(shape)`

`defineEnv<TShape extends EnvShape>(shape: TShape): EnvSchema<TShape>`. It never throws: a top-level key that is not a namespace, which only a bypass of the types can produce, is reported at boot as a `BYMAX_CONFIG_INVALID` issue that names the key.

A thin, typed factory over `z.object(...)` that establishes the two-level
namespace convention: top-level keys are namespaces, leaves are
environment-derived values. It composes the caller's schemas as-is, never
rewriting, cloning, or wrapping them, so coercion and defaults stay explicit
consumer choices. Leaves use `z.coerce.*` because the source arrives as
strings (the shape of `process.env`).

Two things follow from that. `z.coerce.boolean()` is `Boolean(value)`: any non-empty string,
including `'false'`, becomes `true`, so the boot refuses a leaf built on it, under any wrapper
(`.default`, `.optional`, `.pipe`), as an issue that names the leaf; use `z.stringbool()` for a
flag. And a variable set to the empty string is present, not missing: `z.string()` accepts it and
`z.coerce.number()` turns it into `0`, so add `.min(1)` or a bound where empty should fail.

A leaf that ends in `.catch(fallback)` replaces an invalid value with its fallback and reports no
issue, so a mistyped variable reaches the application as the fallback; leave `.catch()` off a
leaf whose failure should stop the boot.

A rule that throws instead of reporting an issue, such as a `.transform` that calls `JSON.parse`,
still fails the boot, as one issue for the whole schema: `a rule threw SyntaxError; its message is
withheld because it can carry the value`. The thrown message is dropped because it can quote the
received value, and Zod stops at the rule that threw, so the leaves after it are not reported. Report a
failure from the rule with `.refine` or `ctx.issues.push` instead of throwing, and the report stays
complete.

A leaf can override its derived variable name through schema metadata when a
legacy name must be preserved:

```typescript
database: z.object({
  // Reads DB_CONNECTION_STRING instead of the derived DATABASE_URL.
  url: z.url().meta({ env: 'DB_CONNECTION_STRING' })
})
```

The override is found wherever `meta` sits in the chain: `z.string().meta({ env: 'LEGACY' }).default('x')`
and `z.string().default('x').meta({ env: 'LEGACY' })` both read `LEGACY`. When more than one layer sets it, the outermost usable one wins. An `env` that is present but
is not a non-empty string (`''`, `undefined`, a number) cannot name a variable, so validation reports it
as an issue instead of letting the leaf read the variable derived from its path, on any layer: an
inner layer whose `env` is unusable is reported even when an outer layer's usable one wins. A leaf
with no `env` at all is unaffected. `resolveSourceNames` skips an unusable `env` and answers the
derived name.

A namespace can declare itself **open**, which waives strict unknown-key
detection for the rest of its prefix. Use it when the prefix is shared with
another program that reads its own variables — see
[Strict mode and shared prefixes](#strict-mode-and-shared-prefixes):

```typescript
// OTEL_ENABLED is read and validated; every other OTEL_* variable belongs to
// the OpenTelemetry SDK, which reads it natively.
otel: z.object({ enabled: z.stringbool().default(false) }).meta({ open: true })
```

Only the literal `true` opens a namespace. Any other value, and any metadata
without the key, leaves detection in force.

Write `.meta({ open: true })` last: methods that build a new object schema, such as `.strict()`,
`.extend()` or `.pick()`, drop the metadata and close the namespace again.

### `ConfigService<TConfig>`

The typed, injectable accessor over the frozen configuration object.

| Method      | Signature                                                                    | Notes                                                                              |
| ----------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `get(path)` | `<P extends Path<TConfig>>(path: P) => PathValue<TConfig, P>`                | Dot-path access, type inferred from the schema.                                    |
| `getAll()`  | `() => Readonly<TConfig>`                                                    | The deep-frozen root object.                                                       |
| `has(path)` | `(path: Path<TConfig>) => boolean`                                           | True when the resolved value is not `undefined`.                                   |
| `toJSON()`  | `() => { readonly service: string; readonly namespaces: readonly string[] }` | The declared namespace names, never a value: `JSON.stringify(service)` stays safe. |

Because validation completed at bootstrap, `get` never throws for a declared
path: every leaf either passed validation, received its default, or the
process did not start. An optional leaf without a default can still be `undefined` when its type allows it.

The module constructs the service from the frozen root: `new ConfigService(config)` takes a
`Readonly<TConfig>` and is meant for a test of your own code that needs the accessor without the module.

The class is named `ConfigService`, as the one in `@nestjs/config` is; a backend that imports both
aliases one of them: `import { ConfigService as BymaxConfigService } from '@bymax-one/nest-config'`.
`has` is `value !== undefined`, so an absent optional leaf is `false` and a `null` is `true`.

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
  readonly message: string // constraint description, or your own `custom` message
}
```

The constructor is public, so your own code can build one. `issues` must be an array of up to 10 000
issues, each an object whose `path`, `variable`, `code` and `message` are strings. Anything else is refused
before the error exists: a `TypeError` for a value that is not an array, an entry that is not an object, a
field that is not a string, an array that claims no entries while it holds an index key, or a read of
your list that threw (the library's own message does not repeat the host's, but that error stays as the
`cause`, which `util.inspect` and Node's uncaught-exception report print), and a `RangeError` for more
than 10 000 entries, none of which is read. The list is read by
index, once, never through its iterator.

`ConfigErrorCode` is the frozen catalog backing `ConfigValidationCode` (the
error's own `code`) and `ConfigIssueCode` (each issue's `code`); see the
error catalog below for every value.

### Reporting the failure

`onValidationError` receives `ReadonlyArray<ConfigIssue>`: four string fields per issue (`path`,
`variable`, `code` and `message`), JSON-serializable, with no error to unwrap. Every description this package generates is
value-free, so it can go straight into a log as structured data; a `custom` message written by
your own schema is printed as written, so reviewing it is the schema author's job.

The hook may be asynchronous: a promise it returns is awaited before the boot fails, so a
report on its way to a log sink is not cut off by the process exiting. There is no timeout, so
a hook that never settles holds the boot. If the hook throws or rejects, the boot still fails
with the original validation error, unchanged in class, `code`, `issues` and `message`, and the
hook's error is attached to it as `error.cause` (non-enumerable), unless the failure already carries a
`cause`, as a refused host read does with the error the host threw; that one stays.

If you also log the thrown error from a bootstrap `catch`, the logging call decides what
survives. `code` and `issues` are the **only two own enumerable properties** of
`BymaxConfigValidationError`; `name`, `message` and `stack` are non-enumerable, as on any `Error`:

| Which representation reaches the sink                                                                   | The report (`message`) | `code` and `issues` |
| ------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------- |
| the error object, read by a serializer that extracts the standard fields **and** copies own enumerables | ✅                     | ✅                  |
| `error.stack`                                                                                           | ✅ inside the string   | ❌                  |
| `JSON.stringify(error)`, `{ ...error }`                                                                 | ❌                     | ✅                  |

A serializer must extract `name`, `message` and `stack` to keep the report, and copy the own
enumerables to keep `code` and `issues`; if you build the log record by hand, add `message`
explicitly.

```typescript
console.error('configuration invalid', error) // report, code and issues
pino.error({ err: error }, 'configuration invalid') // report, code and issues
pino.error('configuration invalid', error) // the error is dropped entirely
```

Pino applies error serialization only when the error is the merging object or sits under `err`;
as a trailing argument it is an interpolation value. Use `@bymax-one/nest-logger` ≥ 1.3.0 to log
the error directly. Before any logger exists, which is where this failure usually lands (a `catch`
in `main.ts` runs before the logging module is registered), `console.error(message, error)`
shows the report, the `code` and the `issues`; `console.error(message, error.stack)` shows the
report alone.

### Injection tokens

`BYMAX_CONFIG` is a `Symbol` token for the raw frozen config, exported by the module for advanced
factory-style wiring that does not go through `ConfigService`. `BYMAX_CONFIG_OPTIONS` is the token of
the module's own options: it is provided inside the module only, so a provider in another module
cannot inject it, and the options it holds include the raw `source` record. Do not build on it. Injecting `BYMAX_CONFIG` in a module that does not import the config module (and does not get it as a global) fails when the application is compiled, with Nest's unresolved-dependency error.

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
dot-path inference, limited to the two-level namespace convention. All of them
are exported for advanced generic code (custom decorators, typed wrappers)
that needs to reference the schema shape directly. `EnvSchema<TShape = EnvShape>` defaults its parameter to the generic shape.
`ConfigIssueCode` is the union of the three issue codes (`BYMAX_CONFIG_MISSING`, `BYMAX_CONFIG_INVALID`,
`BYMAX_CONFIG_UNKNOWN_KEY`) and `ConfigValidationCode` is the single code of the thrown error,
`BYMAX_CONFIG_VALIDATION`.

### `resolveSourceNames(schema)`

Lists the variable every leaf of a schema reads. It is the function validation itself
resolves its variables through, so the list cannot drift from what `forRoot` reads.

| Parameter | Type                         | Returns                    |
| --------- | ---------------------------- | -------------------------- |
| `schema`  | `EnvSchema` from `defineEnv` | `readonly SourceBinding[]` |

`SourceBinding` is `{ path: string; variable: string }`: the leaf's dot path and the
environment variable it reads. The list has one entry per declared leaf, in declaration
order. A leaf reads its `meta({ env })` override when that is a non-empty string, and
`NAMESPACE_LEAF` in SCREAMING_SNAKE_CASE, with a camelCase key split into words, when it has no
`env` at all.
It reads the schema only, never a source record, so it works on a schema exported as a
value.

```typescript
// For the Quick Start schema:
resolveSourceNames(envSchema).map((binding) => binding.variable)
// ['SERVER_PORT', 'SERVER_ENV', 'DATABASE_URL', 'REDIS_URL', 'LOG_LEVEL']
```

A test that keeps `.env.example` honest is the usual use:

```typescript
import { readFileSync } from 'node:fs'
import { resolveSourceNames } from '@bymax-one/nest-config'
import { envSchema } from './config/env.schema'

it('documents every variable the schema reads in .env.example', () => {
  const example = readFileSync('.env.example', 'utf8')
  const documented = new Set(
    example.split('\n').map((line) => /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
  )
  const missing = resolveSourceNames(envSchema).filter(({ variable }) => !documented.has(variable))
  expect(missing).toEqual([])
})
```

#### What it does not tell you

- **Declared is not required.** A leaf with a default, or an optional leaf, is listed like
  any other. Whether it belongs in a template file is your policy; the list says only that
  the schema reads it.
- **Two paths can read one variable.** Names are derived from the keys, so `a.bC` and
  `aB.c` both derive `A_B_C`, and `httpServer.port` and `HTTPServer.port` both derive
  `HTTP_SERVER_PORT`. Every binding is returned and none is dropped, so a tool can see the
  collision; validation rejects such a schema (see the error catalog). Giving two leaves
  the same `meta({ env })` is the same collision, and there is no opt-out.
- **An open namespace changes nothing.** `meta({ open: true })` only waives strict
  unknown-key detection, so the list is the same whether a namespace is open or closed. It
  does not help to find variables in `.env.example` that no leaf reads.
- **Two-level schemas only.** Deeper nesting is outside this contract, as it
  is for `Path` and `PathValue`.

## 🚨 Error Catalog

| Code                       | Meaning                                                   |
| -------------------------- | --------------------------------------------------------- |
| `BYMAX_CONFIG_VALIDATION`  | One or more schema violations (top-level error code).     |
| `BYMAX_CONFIG_MISSING`     | Required variable absent from the source (issue code).    |
| `BYMAX_CONFIG_INVALID`     | Failed its constraint, or shares a variable (issue code). |
| `BYMAX_CONFIG_UNKNOWN_KEY` | Strict mode: source variable matches no declared leaf.    |

These codes are raised at boot, in the aggregated `BymaxConfigValidationError` (code `BYMAX_CONFIG_VALIDATION`)
that stops the process: the library has no HTTP status. `BYMAX_CONFIG_INVALID` also covers a namespace named
`toJSON`, a top-level key that is not a namespace, an unusable `meta({ env })`, a refused `z.coerce.boolean()`
and a rule that threw. For `BYMAX_CONFIG_UNKNOWN_KEY` the issue's `path` is the namespace alone.

## 📋 Log Events

The module writes one operational log event: an object message through the Nest `Logger`, under the
context `BymaxConfig`, of the shape `{ event, message, ...fields }`, where `message` is fixed text and the other fields are numbers only. No
value the source held is ever written.

| Event                      | Level | When                                                                                          | Fields              |
| -------------------------- | ----- | --------------------------------------------------------------------------------------------- | ------------------- |
| `CONFIG_VALIDATION_FAILED` | error | The provider throws a `BymaxConfigValidationError`, before the `onValidationError` hook runs. | `message`, `issues` |

`issues` is the number of issues in the aggregated `BymaxConfigValidationError`, whose own message and
issue list name each variable and constraint. A log pipeline matches the `event` field. An object message
is rendered as a structured entry by `@bymax-one/nest-logger` 1.4.23 or later, and readably by Nest's
default logger; an older `@bymax-one/nest-logger` prints it as `[object Object]`.

A logger that throws cannot change the outcome: the event is written on a best-effort basis, the
`BymaxConfigValidationError` is still the failure the host sees, and the `onValidationError` hook still
runs. Nest drops the promise a host-installed logger returns, so a logger whose `error` returns a rejected
promise leaves an unhandled rejection that ends the process unless your application handles
`unhandledRejection`; handle the rejection inside that logger.

## 🚫 What This Library Does NOT Do

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
5. **An open namespace cannot detect a typo in its own prefix.** A foreign
   variable and a misspelled local one are indistinguishable by name, so
   `meta({ open: true })` accepts both. See
   [Strict mode and shared prefixes](#strict-mode-and-shared-prefixes).

## 🤝 Contributing

Pull requests are welcome. Please open an issue first for significant changes.

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
