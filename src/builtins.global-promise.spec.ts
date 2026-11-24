/**
 * Unit tests for the baseline of built-ins when the global `Promise` was replaced before the import.
 *
 * Layer: unit.
 * Goal: prove that the baseline records whatever `Promise` the host installed before the module loaded,
 * so that a later validation neither counts that stand-in as a replacement nor refuses to start, and that
 * a stand-in swapped in after the load is still counted. The validation these rows run is also the only
 * test that evaluates the module's constants (its messages, the identifier pattern, the kinds refused
 * as a source) while a test is running, so each is asserted here by what it decides.
 * Mocks: none. The global is replaced for one case, the modules are evaluated in an isolated registry,
 * and the global is put back afterwards.
 */

import { z } from 'zod'

/** The modules the validation runs through, evaluated in one isolated registry. */
interface Loaded {
  readonly builtins: typeof import('./builtins')
  readonly define: typeof import('./define-env')
  readonly validator: typeof import('./env-validator')
  readonly formatter: typeof import('./report-formatter')
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
        validator: require('./env-validator') as typeof import('./env-validator'),
        formatter: require('./report-formatter') as typeof import('./report-formatter')
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

/** The issues a validation of `source` reports, from the modules evaluated under the stand-in. */
function issuesOf(
  schema: ReturnType<Loaded['define']['defineEnv']>,
  source: object,
  loaded: Loaded,
  strict = false
): ReadonlyArray<{ readonly variable: string; readonly message: string }> {
  try {
    loaded.validator.validateEnv(schema, source as Record<string, string>, { strict })
  } catch (error) {
    return (error as { issues: ReadonlyArray<{ variable: string; message: string }> }).issues
  }
  return []
}

/** A class whose name is exactly `name`, whatever characters it holds. */
function errorNamed(name: string): new () => Error {
  return Object.defineProperty(class extends Error {}, 'name', { value: name }) as new () => Error
}

describe('the constants a validation decides with, read through the modules evaluated in isolation', () => {
  it('words a missing leaf, an unknown variable and a message-less custom check as the report does', () => {
    /**
     * Scenario: strict validation of a source that lacks a required leaf, names an undeclared variable
     * and trips a custom check that wrote no message.
     * Expectation: each issue carries the report's own wording, not an empty or the library's default text.
     */
    const { loaded, restore } = loadWithPromise(zoneLike(), true)
    let issues: ReturnType<typeof issuesOf> | undefined
    try {
      const schema = loaded.define.defineEnv({
        app: z.object({ name: z.string() }),
        limits: z.object({ cap: z.string() }).check((ctx) => {
          ctx.issues.push({ code: 'custom', input: ctx.value.cap, path: ['cap'] })
        })
      })
      issues = issuesOf(schema, { APP_EXTRA: 'x', LIMITS_CAP: 'a' }, loaded, true)
    } finally {
      restore()
    }

    expect((issues ?? []).map((issue) => [issue.variable, issue.message])).toEqual(
      expect.arrayContaining([
        ['APP_NAME', 'missing required value'],
        ['APP_EXTRA', 'unknown variable not declared in the schema'],
        ['LIMITS_CAP', 'invalid value']
      ])
    )
  })

  it.each([
    ['ValidError', 'ValidError'],
    ['A', 'A'],
    ['_$x9', '_$x9'],
    ['A B', undefined],
    [' A', undefined],
    ['A!', undefined],
    ['1A', undefined],
    ['', undefined]
  ])('names a thrown Error class %j as %j', (className, named) => {
    /**
     * Scenario: a rule throws an Error whose class carries the given name.
     * Expectation: the issue names the class only when the name is plain code, in full, and says the
     * thrown value is not an Error otherwise.
     */
    const { loaded, restore } = loadWithPromise(zoneLike(), true)
    let issues: ReturnType<typeof issuesOf> | undefined
    try {
      const Thrown = errorNamed(className)
      const schema = loaded.define.defineEnv({
        app: z.object({ name: z.string() }).check(() => {
          throw new Thrown()
        })
      })
      issues = issuesOf(schema, { APP_NAME: 'x' }, loaded)
    } finally {
      restore()
    }

    expect(issues?.[0]?.message).toBe(
      named === undefined
        ? 'a rule threw a value that is not an Error; the value is withheld because it can carry the value'
        : `a rule threw ${named}; its message is withheld because it can carry the value`
    )
  })

  it.each([
    [
      'an arguments object',
      (): object =>
        (function (..._args: unknown[]) {
          return arguments
        })()
    ],
    ['a Date', (): object => new Date(0)],
    ['a RegExp', (): object => /x/u],
    ['an Error', (): object => new Error('x')],
    ['a boxed number', (): object => Object(1) as object]
  ])('refuses %s as a source although it carries no toStringTag', (_name, make) => {
    /**
     * Scenario: the host passes a built-in kind with no `Symbol.toStringTag` as the source.
     * Expectation: the validation refuses it as an object that is not a record of variables.
     */
    const { loaded, restore } = loadWithPromise(zoneLike(), true)
    let issues: ReturnType<typeof issuesOf> | undefined
    try {
      const schema = loaded.define.defineEnv({ app: z.object({ name: z.string() }) })
      issues = issuesOf(schema, make(), loaded)
    } finally {
      restore()
    }

    expect((issues ?? []).map((issue) => issue.message)).toEqual([
      'the source must be an object of variables, received an object that is not a record of variables'
    ])
  })

  it('closes a report made only of overrides with the footer about the test', () => {
    /**
     * Scenario: an issue with no variable, as a test helper reports for an override that matches nothing.
     * Expectation: the report asks for a fix in the test, and not for a restart of the process.
     */
    const { loaded, restore } = loadWithPromise(zoneLike(), false)
    restore()
    const report = loaded.formatter.formatIssueReport([
      { path: 'ghost.x', variable: '', code: 'INVALID', message: 'm' } as never
    ])

    expect(report.endsWith('Fix the overrides above in the test.')).toBe(true)
  })
})
