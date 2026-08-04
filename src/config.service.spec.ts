/**
 * Unit tests for ConfigService, the typed dot-path accessor.
 *
 * Layer: unit.
 * Goal: prove that `get` resolves every leaf of a representative frozen config
 * to its declared value type, that `getAll` returns the same frozen root by
 * reference, and that `has` reports declared-path presence (false for a leaf
 * whose resolved value is undefined). Type-level assertions pin the inferred
 * return types; the `@ts-expect-error` marker on the rejected-path case is a
 * positive compile-time assertion, not a suppression.
 * Mocks: none. The service is constructed directly with a frozen fixture, the
 * same shape the DI provider would hand it, so no Nest container is needed.
 */

import { inspect } from 'node:util'

import { deepFreeze } from './deep-freeze'
import { ConfigService } from './config.service'

/**
 * Compile-time equality between two types.
 *
 * Resolves to `true` only when `A` and `B` are mutually assignable, so a wrong
 * assertion makes `Expect` fail to type-check and ts-jest reports the spec red.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/** Asserts, at compile time, that its argument type is exactly `true`. */
type Expect<T extends true> = T

/** A representative two-level config type spanning primitive, enum, and optional leaves. */
type SampleConfig = {
  server: { port: number; env: 'development' | 'test' | 'production' }
  database: { url: string }
  log: { level: 'info' | 'warn' | 'error' }
  feature: { flag: string | undefined }
}

/**
 * Build a frozen fixture and a service over it.
 *
 * The `feature.flag` leaf is left undefined to exercise the optional-without-default
 * branch of `has`.
 */
function buildService(): {
  config: Readonly<SampleConfig>
  service: ConfigService<SampleConfig>
} {
  const config = deepFreeze<SampleConfig>({
    server: { port: 4000, env: 'production' },
    database: { url: 'postgres://localhost:5432/app' },
    log: { level: 'info' },
    feature: { flag: undefined }
  })
  return { config, service: new ConfigService<SampleConfig>(config) }
}

describe('ConfigService.get', () => {
  it('resolves every declared leaf to its stored value', () => {
    /**
     * Full-leaf resolution.
     *
     * Each declared path must return the exact frozen value: a number, an enum
     * member, a string, and an enum default. This proves the two-level dot split
     * walks namespace then leaf for every kind of leaf, not just one.
     */
    const { service } = buildService()

    expect(service.get('server.port')).toBe(4000)
    expect(service.get('server.env')).toBe('production')
    expect(service.get('database.url')).toBe('postgres://localhost:5432/app')
    expect(service.get('log.level')).toBe('info')
  })

  it('infers the leaf value type from the path at the call site', () => {
    /**
     * Compile-time return inference.
     *
     * `get('server.port')` must be typed `number` and `get('database.url')`
     * `string`, with no cast. The `Equal` assertions fail the build if the
     * inference collapses to `any` or resolves to the wrong type.
     */
    const { service } = buildService()

    const port = service.get('server.port')
    const url = service.get('database.url')
    const env = service.get('server.env')
    type _PortIsNumber = Expect<Equal<typeof port, number>>
    type _UrlIsString = Expect<Equal<typeof url, string>>
    type _EnvIsUnion = Expect<Equal<typeof env, 'development' | 'test' | 'production'>>

    expect(port).toBe(4000)
    expect(url).toBe('postgres://localhost:5432/app')
    expect(env).toBe('production')
  })

  it('rejects a path whose leaf is not declared', () => {
    /**
     * Rejected-path assertion.
     *
     * An undeclared leaf must fail to type-check. The `@ts-expect-error` is a
     * positive assertion: were the path wrongly accepted, the directive would be
     * unused and ts-jest would report the spec red.
     */
    const { service } = buildService()

    // @ts-expect-error 'server.missing' is not a declared path
    const resolved: unknown = service.get('server.missing')

    expect(resolved).toBeUndefined()
  })
})

describe('ConfigService.getAll', () => {
  it('returns the same frozen root object by reference', () => {
    /**
     * Reference identity.
     *
     * `getAll` must return the exact frozen object it was constructed with, not
     * a copy, so consumers share the single validated singleton and cannot
     * observe drift. Frozenness is re-asserted to document the contract.
     */
    const { config, service } = buildService()

    expect(service.getAll()).toBe(config)
    expect(Object.isFrozen(service.getAll())).toBe(true)
  })
})

describe('ConfigService serialization', () => {
  /** A value distinctive enough that any leak shows up as a substring match. */
  const SECRET = 'pa55word-canary'

  /** Build a service whose config carries a recognizable secret in a leaf. */
  function buildServiceWithSecret(): ConfigService<SampleConfig> {
    return new ConfigService<SampleConfig>(
      deepFreeze<SampleConfig>({
        server: { port: 4000, env: 'production' },
        database: { url: `postgres://admin:${SECRET}@db.internal:5432/app` },
        log: { level: 'info' },
        feature: { flag: undefined }
      })
    )
  }

  it('keeps configured values out of every incidental serialization path', () => {
    /**
     * Accidental-disclosure containment.
     *
     * The service aggregates every secret the application declared, so the four
     * ways host code stumbles into serializing an injected provider — a logger
     * rendering its arguments, `Object.entries`, object spread, and Node's
     * inspector, which an error reporter reaches through the scope of a throw —
     * must not reach the values. `showHidden` is included because it is what
     * defeats a merely non-enumerable property; only a `#` field survives it.
     */
    const service = buildServiceWithSecret()

    expect(JSON.stringify(service)).not.toContain(SECRET)
    expect(JSON.stringify(Object.entries(service))).not.toContain(SECRET)
    expect(JSON.stringify({ ...service })).not.toContain(SECRET)
    expect(inspect(service, { depth: null, showHidden: true })).not.toContain(SECRET)
  })

  it('serializes to the declared namespace names so the omission reads as deliberate', () => {
    /**
     * Useful-but-empty contract.
     *
     * Without `toJSON` the same containment would render as `{}`, which reads as
     * a broken provider. Naming the service and its namespaces keeps a debug log
     * informative while every value stays unreachable.
     */
    const service = buildServiceWithSecret()

    expect(service.toJSON()).toEqual({
      service: 'ConfigService',
      namespaces: ['server', 'database', 'log', 'feature']
    })
    expect(JSON.parse(JSON.stringify(service))).toEqual(service.toJSON())
  })

  it('still resolves values through the accessors it is meant to be read with', () => {
    /**
     * No-regression guard.
     *
     * Containment must cost nothing at the supported surface: `get`, `has` and
     * the `getAll` escape hatch keep returning the real values, since hiding the
     * field changes how the object serializes, not what it stores.
     */
    const service = buildServiceWithSecret()

    expect(service.get('database.url')).toContain(SECRET)
    expect(service.has('database.url')).toBe(true)
    expect(service.getAll().database.url).toContain(SECRET)
  })
})

describe('ConfigService.has', () => {
  it('reports true for a declared leaf with a defined value', () => {
    /**
     * Present-leaf case.
     *
     * A leaf that resolved to a concrete value must report as present, the
     * common case for a validated, defaulted configuration.
     */
    const { service } = buildService()

    expect(service.has('database.url')).toBe(true)
    expect(service.has('server.port')).toBe(true)
  })

  it('reports false for a declared leaf whose value is undefined', () => {
    /**
     * Optional-without-default case.
     *
     * An optional leaf that validation left undefined must report as absent,
     * distinguishing "declared but unset" from "declared and set", which is the
     * whole point of `has` over a truthiness check.
     */
    const { service } = buildService()

    expect(service.has('feature.flag')).toBe(false)
  })
})
