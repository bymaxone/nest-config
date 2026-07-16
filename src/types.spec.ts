/**
 * Unit tests for the foundational schema shape types.
 *
 * Layer: unit.
 * Goal: pin the two-level namespace contract (accepted and rejected shapes) and
 * prove that the inferred output type equals native Zod inference.
 * Mocks: none. Type-level assertions run at compile time via ts-jest; the
 * runtime `expect` calls guard the structural invariants the types depend on.
 */

import { z } from 'zod'

import type { EnvLeaf, EnvNamespace, EnvOutput, EnvShape } from './types'

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
