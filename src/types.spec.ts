/**
 * Unit tests for the foundational schema shape types and the dot-path
 * inference utilities.
 *
 * Layer: unit.
 * Goal: pin the two-level namespace contract (accepted and rejected shapes),
 * prove that the inferred output type equals native Zod inference, and pin the
 * `Path`/`PathValue` accessor inference (accepted paths with their value types,
 * rejected paths at compile time).
 * Mocks: none. Type-level assertions run at compile time via ts-jest; the
 * `@ts-expect-error` markers in the rejection specs are positive compile-time
 * assertions (an unused directive fails the build), not suppressions. The
 * runtime `expect` calls guard the structural invariants the types depend on.
 */

import { z } from 'zod'

import type { EnvLeaf, EnvNamespace, EnvOutput, EnvShape, Path, PathValue } from './types'

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

describe('EnvShape contract', () => {
  it('accepts a two-level namespace shape whose leaves are Zod types', () => {
    /**
     * Happy path for the convention.
     *
     * A valid shape maps top-level namespace keys to Zod object schemas whose
     * leaves are environment-derived values. This protects the core rule that
     * the first level is always a namespace, never a leaf.
     */
    const shape = {
      server: z.object({ port: z.coerce.number().default(3000) }),
      database: z.object({ url: z.url() })
    } satisfies EnvShape

    expect(shape.server).toBeInstanceOf(z.ZodObject)
    expect(shape.database).toBeInstanceOf(z.ZodObject)
  })

  it('rejects a top-level entry that is not a Zod object at the type level', () => {
    /**
     * Rejection case.
     *
     * A top-level leaf (a bare `z.string()`) violates the two-level rule, so a
     * shape with one must not be assignable to `EnvShape`. Encoded as a
     * type-level assertion that assignability resolves to `false`.
     */
    type RejectsBareLeaf = { server: z.ZodString } extends EnvShape ? true : false
    type _Rejected = Expect<Equal<RejectsBareLeaf, false>>

    // A namespace, by contrast, is a valid entry.
    type AcceptsNamespace = { server: EnvNamespace } extends EnvShape ? true : false
    type _Accepted = Expect<Equal<AcceptsNamespace, true>>

    expect(z.string()).not.toBeInstanceOf(z.ZodObject)
  })

  it('treats a namespace as a Zod object and a leaf as any Zod type', () => {
    /**
     * Alias fidelity.
     *
     * `EnvNamespace` and `EnvLeaf` are the semantic names the rest of the
     * package builds on; they must stay bound to the Zod base classes so the
     * mapping and validation layers can walk them.
     */
    type _NamespaceIsObject = Expect<Equal<EnvNamespace, z.ZodObject>>
    type _LeafIsZodType = Expect<Equal<EnvLeaf, z.ZodType>>

    const namespace: EnvNamespace = z.object({ url: z.url() })
    const leaf: EnvLeaf = z.string()
    expect(namespace).toBeInstanceOf(z.ZodType)
    expect(leaf).toBeInstanceOf(z.ZodType)
  })
})

describe('EnvOutput inference', () => {
  it('infers the parsed output type identically to native Zod inference', () => {
    /**
     * Inference parity.
     *
     * `EnvOutput<Shape>` must equal what Zod would infer for the composed
     * object, including applied coercions and defaults. This is the guarantee
     * that `typeof envSchema.infer` yields a faithful config type downstream.
     */
    const shape = {
      server: z.object({ port: z.coerce.number().default(3000) }),
      database: z.object({ url: z.url() })
    }

    type Manual = { server: { port: number }; database: { url: string } }
    type Native = z.infer<z.ZodObject<typeof shape>>
    type _MatchesManual = Expect<Equal<EnvOutput<typeof shape>, Manual>>
    type _MatchesNative = Expect<Equal<EnvOutput<typeof shape>, Native>>

    const parsed = z.object(shape).parse({ server: {}, database: { url: 'https://db.local' } })
    expect(parsed.server.port).toBe(3000)
    expect(parsed.database.url).toBe('https://db.local')
  })
})

/** A representative two-level config type used by the dot-path assertions. */
type SampleConfig = {
  server: { port: number; env: 'development' | 'test' | 'production' }
  database: { url: string }
}

describe('Path dot-path inference', () => {
  it('produces the union of every namespace.leaf string for a config type', () => {
    /**
     * Accepted-path enumeration.
     *
     * `Path<SampleConfig>` must equal exactly the union of the two-level dot
     * paths, one per leaf across every namespace. This pins the core accessor
     * contract that `get` only accepts declared paths.
     */
    type Expected = 'server.port' | 'server.env' | 'database.url'
    type _Paths = Expect<Equal<Path<SampleConfig>, Expected>>

    expect<Path<SampleConfig>>('server.port').toBe('server.port')
  })

  it('rejects namespace-only, missing-leaf, and arbitrary-string paths', () => {
    /**
     * Rejected-path assertions.
     *
     * A namespace alone, an undeclared leaf, and an arbitrary string are all
     * invalid paths and must fail to type-check. Each `@ts-expect-error` is a
     * positive assertion: if the path were wrongly accepted the directive would
     * be unused and ts-jest would report the spec red.
     */
    // @ts-expect-error a namespace alone is not a leaf path
    const namespaceOnly: Path<SampleConfig> = 'database'
    // @ts-expect-error a leaf that is not declared on the namespace is rejected
    const missingLeaf: Path<SampleConfig> = 'database.missing'
    // @ts-expect-error an arbitrary string is not a declared path
    const arbitrary: Path<SampleConfig> = 'not.a.path'

    expect([namespaceOnly, missingLeaf, arbitrary]).toHaveLength(3)
  })
})

describe('PathValue leaf inference', () => {
  it('resolves each declared path to its leaf value type', () => {
    /**
     * Value-type inference.
     *
     * `PathValue` must resolve every accepted path to the exact declared leaf
     * type: a primitive `number` for `server.port`, the literal union for
     * `server.env`, and `string` for `database.url`. This is the guarantee that
     * `get('server.port')` is typed `number` with no cast at the call site.
     */
    type _Port = Expect<Equal<PathValue<SampleConfig, 'server.port'>, number>>
    type _Env = Expect<
      Equal<PathValue<SampleConfig, 'server.env'>, 'development' | 'test' | 'production'>
    >
    type _Url = Expect<Equal<PathValue<SampleConfig, 'database.url'>, string>>

    expect<PathValue<SampleConfig, 'server.port'>>(3000).toBe(3000)
  })
})
