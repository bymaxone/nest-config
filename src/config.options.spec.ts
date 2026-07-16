/**
 * Type and runtime tests for the BymaxConfigModule options contract.
 *
 * Layer: unit.
 * Goal: pin the public option surface (required schema; optional source, hook,
 * and strict flag) at compile time and confirm a fully populated options object
 * is structurally valid at runtime. Compile-time assertions fail the build,
 * which is the test signal for a type-only contract.
 * Mocks: none.
 */

import { z } from 'zod'

import type { BymaxConfigModuleOptions } from './config.options'
import { defineEnv } from './define-env'
import type { ConfigIssue } from './errors'

/** Compile-time assertion helpers: a wrong contract makes tsc reject the file. */
type Expect<T extends true> = T
type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false

const schema = defineEnv({
  server: z.object({ port: z.coerce.number().int() })
})

describe('BymaxConfigModuleOptions', () => {
  it('requires the schema and keeps source, hook, and strict optional', () => {
    /**
     * Minimal options shape.
     *
     * The common registration passes only a schema; the other three fields are
     * optional so a static import needs no ceremony. `satisfies` proves the
     * minimal object is assignable without widening the type.
     */
    const options = { schema } satisfies BymaxConfigModuleOptions<typeof schema>

    expect(options.schema).toBe(schema)
  })

  it('accepts a custom source, observability hook, and strict flag', () => {
    /**
     * Fully populated options shape.
     *
     * A test or tooling caller supplies an explicit source, a reporting hook,
     * and the strict flag; the object must satisfy the contract with the hook
     * receiving a readonly issue list, mirroring the value-free error model.
     */
    const recorded: ReadonlyArray<ConfigIssue>[] = []
    const options: BymaxConfigModuleOptions<typeof schema> = {
      schema,
      source: { SERVER_PORT: '3000' },
      onValidationError: (issues) => recorded.push(issues),
      strict: true
    }

    options.onValidationError?.([])

    expect(options.source).toEqual({ SERVER_PORT: '3000' })
    expect(options.strict).toBe(true)
    expect(recorded).toHaveLength(1)
  })

  it('types each optional field exactly per the contract', () => {
    /**
     * Field-type pinning.
     *
     * Guards against a silent drift in the option types (for example a hook that
     * stops being readonly or a source that loses its undefined-valued entries).
     * The assertions are compile-time; reaching runtime already proves them.
     */
    type Options = BymaxConfigModuleOptions<typeof schema>
    type Cases = [
      Expect<Equal<Options['schema'], typeof schema>>,
      Expect<Equal<Options['source'], Record<string, string | undefined> | undefined>>,
      Expect<Equal<Options['strict'], boolean | undefined>>,
      Expect<
        Equal<
          Options['onValidationError'],
          ((issues: ReadonlyArray<ConfigIssue>) => void) | undefined
        >
      >
    ]
    const cases: Cases = [true, true, true, true]

    expect(cases).toHaveLength(4)
  })
})
