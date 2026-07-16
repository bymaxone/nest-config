/**
 * Unit tests for the `defineEnv` factory.
 *
 * Layer: unit.
 * Goal: prove that defineEnv composes namespaces into one Zod schema, exposes a
 * faithful inferred type through the `infer` phantom, keeps caller defaults and
 * coercions intact, and never rewrites or clones the caller's leaf schemas.
 * Mocks: none. Type-level assertions run at compile time via ts-jest.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'

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

describe('defineEnv', () => {
  it('composes namespaces into a single parseable Zod object schema', () => {
    /**
     * Composition.
     *
     * The factory must return one Zod object whose shape is the passed
     * namespaces, so parsing a full source yields the nested, coerced result.
     */
    const schema = defineEnv({
      server: z.object({ port: z.coerce.number().int() }),
      database: z.object({ url: z.url() })
    })

    const parsed = schema.parse({ server: { port: '8080' }, database: { url: 'https://db' } })

    expect(schema).toBeInstanceOf(z.ZodObject)
    expect(parsed).toEqual({ server: { port: 8080 }, database: { url: 'https://db' } })
  })

  it('exposes an infer phantom equal to native Zod inference', () => {
    /**
     * Type ergonomics.
     *
     * `typeof schema.infer` is the public way to extract the config type. It
     * must match what Zod infers for the composed object, coercions included.
     */
    const schema = defineEnv({
      server: z.object({ port: z.coerce.number().default(3000) }),
      auth: z.object({ jwtSecret: z.string().min(32) })
    })

    type Inferred = typeof schema.infer
    type Manual = { server: { port: number }; auth: { jwtSecret: string } }
    type _Matches = Expect<Equal<Inferred, Manual>>

    // The phantom is type-only; the runtime schema still parses as expected.
    const parsed = schema.parse({ server: {}, auth: { jwtSecret: 'k'.repeat(32) } })
    expect(parsed.server.port).toBe(3000)
  })

  it('preserves caller-declared defaults untouched', () => {
    /**
     * Default survival.
     *
     * defineEnv documents but never injects coercion or defaults, so a default
     * declared by the caller is the one applied at parse time.
     */
    const schema = defineEnv({
      server: z.object({ env: z.enum(['dev', 'prod']).default('dev') })
    })

    expect(schema.parse({ server: {} })).toEqual({ server: { env: 'dev' } })
  })

  it('reuses the caller namespace and leaf instances without cloning them', () => {
    /**
     * No-rewrite guarantee (spec 4.1 contract).
     *
     * The exact namespace and leaf schema instances the caller passed must be
     * reachable through the composed schema's `.shape`, proving defineEnv does
     * not wrap, clone, or otherwise mutate them.
     */
    const port = z.coerce.number().int()
    const server = z.object({ port })
    const schema = defineEnv({ server })

    expect(schema.shape.server).toBe(server)
    expect(schema.shape.server.shape.port).toBe(port)
  })
})
