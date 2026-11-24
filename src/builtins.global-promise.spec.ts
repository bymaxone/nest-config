/**
 * Unit tests for the baseline of built-ins when the global `Promise` was replaced before the import.
 *
 * Layer: unit.
 * Goal: prove that the baseline records whatever `Promise` the host installed before the module loaded,
 * so that a later validation neither counts that stand-in as a replacement nor refuses to start, and that
 * a stand-in swapped in after the load is still counted.
 * Mocks: none. The global is replaced for one case, the modules are evaluated in an isolated registry,
 * and the global is put back afterwards.
 */

import { z } from 'zod'

/** The modules the validation runs through, evaluated in one isolated registry. */
interface Loaded {
  readonly builtins: typeof import('./builtins')
  readonly define: typeof import('./define-env')
  readonly validator: typeof import('./env-validator')
}

/** Evaluates the modules while the global `Promise` is `standIn`, leaving the global as it found it. */
function loadWithPromise(
  standIn: unknown,
  leaveReplaced: boolean
): { loaded: Loaded; restore: () => void } {
  const held = Object.getOwnPropertyDescriptor(globalThis, 'Promise') as PropertyDescriptor
  Object.defineProperty(globalThis, 'Promise', { ...held, value: standIn })
  const restore = (): void => {
    Object.defineProperty(globalThis, 'Promise', held)
  }
  let loaded: Loaded | undefined
  try {
    jest.isolateModules(() => {
      loaded = {
        builtins: require('./builtins') as typeof import('./builtins'),
        define: require('./define-env') as typeof import('./define-env'),
        validator: require('./env-validator') as typeof import('./env-validator')
      }
    })
  } catch (thrown) {
    restore()
    throw thrown
  }
  if (!leaveReplaced) restore()
  return { loaded: loaded as Loaded, restore }
}

/** A function that answers its own species through an own getter, the way a zone-aware promise does. */
function zoneLike(): unknown {
  const stand = function ZoneAwarePromise(): void {}
  Object.defineProperty(stand, Symbol.species, { get: () => stand, configurable: true })
  return Object.assign(stand, { prototype: {} })
}

/** A function with static helpers and no species, the way a bluebird-style promise library looks. */
function bluebirdLike(): unknown {
  return Object.assign(function Bluebird(): void {}, {
    prototype: {},
    resolve: () => undefined,
    all: () => undefined
  })
}

describe('the baseline of built-ins when the global Promise was replaced before the import', () => {
  it.each([
    ['a zone-like function with its own species getter', zoneLike],
    ['a bluebird-like function with no species', bluebirdLike],
    ['a class of its own', (): unknown => class Foreign {}],
    ['a subclass of Promise', (): unknown => class Sub extends Promise<unknown> {}]
  ])('counts nothing as replaced and validates while the global is %s', (_name, make) => {
    /**
     * Scenario: the host installs the stand-in before the import and leaves it installed, then the
     * application validates its environment.
     * Expectation: no built-in is counted as replaced, and the validation answers instead of refusing.
     */
    const { loaded, restore } = loadWithPromise(make(), true)
    let replaced: number | undefined
    let parsed: unknown
    let thrown: unknown
    try {
      replaced = loaded.builtins.replacedBuiltins()
      const schema = loaded.define.defineEnv({ app: z.object({ port: z.string() }) })
      parsed = loaded.validator.validateEnv(schema, { APP_PORT: '1' }, { strict: true })
    } catch (error) {
      thrown = error
    } finally {
      restore()
    }

    expect(thrown).toBeUndefined()
    expect(replaced).toBe(0)
    expect(parsed).toEqual({ app: { port: '1' } })
  })

  it('counts nothing as replaced when the stand-in is put back after the import', () => {
    /**
     * Scenario: the stand-in is installed for the import only, so the global is the intrinsic one again
     * when the validation runs.
     * Expectation: the baseline holds the stand-in it recorded, and the intrinsic `Promise` is not read as
     * a replacement of it.
     */
    const { loaded } = loadWithPromise(zoneLike(), false)

    expect(loaded.builtins.replacedBuiltins()).toBe(0)
  })

  it('still counts a species accessor the host replaces on the recorded stand-in after the load', () => {
    /**
     * Scenario: a zone-like global is recorded at load, and its species getter is swapped afterwards.
     * Expectation: the swap is counted as one replacement, so the baseline is not blind to a stand-in.
     */
    const stand = zoneLike() as Record<symbol, unknown>
    const { loaded } = loadWithPromise(stand, false)
    Object.defineProperty(stand, Symbol.species, { get: () => class Other {}, configurable: true })

    expect(loaded.builtins.replacedBuiltins()).toBe(1)
  })
})
