/**
 * Unit tests for the decisions a validation takes while host code runs inside it.
 *
 * Layer: unit.
 * Goal: prove that a built-in replaced by a getter of the source, after the entry check has passed, does
 * not change a strict-mode decision, an issue lookup, the report layout or the fields of the error.
 * Mocks: none. Each built-in is replaced for one case, from inside the validation, and put back.
 */

import { z } from 'zod'

import { defineEnv } from './define-env'
import { guardedResolve, validateEnv } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode, isLibraryError, libraryError } from './errors'

const schema = defineEnv({ app: z.object({ port: z.string() }) })

/** One built-in a decision of the library reads, and a replacement that would change the decision. */
interface Target {
  readonly name: string
  readonly owner: object
  readonly key: string | symbol
  readonly hostile: unknown
}

const TARGETS: readonly Target[] = [
  { name: 'startsWith', owner: String.prototype, key: 'startsWith', hostile: () => false },
  { name: 'sort', owner: Array.prototype, key: 'sort', hostile: () => [] },
  { name: 'Set.has', owner: Set.prototype, key: 'has', hostile: () => true },
  { name: 'Map.set', owner: Map.prototype, key: 'set', hostile: () => undefined },
  { name: 'Map.get', owner: Map.prototype, key: 'get', hostile: () => undefined },
  { name: 'Array.push', owner: Array.prototype, key: 'push', hostile: () => 0 },
  {
    name: 'Array iterator',
    owner: Array.prototype,
    key: Symbol.iterator,
    hostile: () => ({ next: () => ({ done: true }) })
  },
  { name: 'Map.keys', owner: Map.prototype, key: 'keys', hostile: () => [][Symbol.iterator]() },
  {
    name: 'Map iterator next',
    owner: Object.getPrototypeOf(new Map().keys()),
    key: 'next',
    hostile: () => ({ done: true })
  }
]

/** Replaces `key` of `owner`, returns the way back. */
function replace(owner: object, key: string | symbol, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(owner, key) as PropertyDescriptor
  Object.defineProperty(owner, key, { ...original, value })
  return () => Object.defineProperty(owner, key, original)
}

/** Runs the strict validation of a source whose getter installs the replacement mid-way. */
function strictAfterInstall(target: Target): BymaxConfigValidationError {
  let restore: (() => void) | undefined
  const source = {
    APP_PORT: '1',
    get APP_STRAY(): string {
      restore = replace(target.owner, target.key, target.hostile)
      return 'x'
    }
  }
  try {
    validateEnv(schema, source, { strict: true })
  } catch (thrown) {
    return thrown as BymaxConfigValidationError
  } finally {
    restore?.()
  }
  throw new Error('the strict validation accepted an undeclared variable')
}

describe('a built-in replaced inside the validation', () => {
  it.each(TARGETS)(
    'does not change the strict refusal of an undeclared variable when $name is replaced',
    (target) => {
      /**
       * Scenario: a getter of the source replaces a built-in the strict decision reads, after the
       * entry check passed.
       * Expectation: the undeclared variable is still refused as an unknown key.
       */
      const error = strictAfterInstall(target)

      expect(
        error.issues.some(
          ({ variable, code }) => variable === 'APP_STRAY' && code === ConfigErrorCode.UNKNOWN_KEY
        )
      ).toBe(true)
    }
  )

  it.each(['Array iterator', 'Array.push'])(
    'refuses a plain undeclared variable when %s is replaced by a getter of a declared one',
    (name) => {
      /**
       * Scenario: the replacement is installed while a declared variable is read, and the undeclared
       * one is an ordinary value.
       * Expectation: the undeclared variable is still listed as an unknown key.
       */
      const hostile = name === 'Array iterator' ? { next: () => ({ done: true }) } : 0
      const key = name === 'Array iterator' ? Symbol.iterator : 'push'
      let restore: (() => void) | undefined
      const source = {
        get APP_PORT(): string {
          restore = replace(Array.prototype, key, () => hostile)
          return '1'
        },
        APP_STRAY: 'x'
      }
      let error: BymaxConfigValidationError | undefined
      try {
        validateEnv(schema, source, { strict: true })
      } catch (thrown) {
        error = thrown as BymaxConfigValidationError
      } finally {
        restore?.()
      }

      expect(error?.issues.map(({ variable }) => variable)).toEqual(['APP_STRAY'])
    }
  )

  it('refuses a plain undeclared variable when an index setter is inherited by every array', () => {
    /**
     * Scenario: a getter of a declared variable puts a setter on `Array.prototype[0]`, so an assignment
     * to a new array's first element reaches the setter and creates no element.
     * Expectation: the validation is still refused and the refusal still carries its issue; a setter
     * that dropped the issue would leave an error that reports zero.
     */
    let restore: (() => void) | undefined
    let swallowed = 0
    const source = {
      get APP_PORT(): string {
        Object.defineProperty(Array.prototype, 0, {
          configurable: true,
          set() {
            swallowed += 1
          }
        })
        restore = () => {
          Reflect.deleteProperty(Array.prototype, 0)
        }
        return '1'
      },
      APP_STRAY: 'x'
    }
    let error: BymaxConfigValidationError | undefined
    try {
      validateEnv(schema, source, { strict: true })
    } catch (thrown) {
      error = thrown as BymaxConfigValidationError
    } finally {
      restore?.()
    }

    expect(swallowed).toBeGreaterThan(0)
    expect(error?.issues.length).toBeGreaterThan(0)
  })

  it.each([
    ['returns nothing', () => undefined],
    [
      'throws',
      () => {
        throw new Error('hostile keys')
      }
    ],
    ['returns a foreign object', () => ({ next: () => ({ done: true }) })]
  ])('loads when Map.prototype.keys %s before the import', (_name, hostile) => {
    /**
     * Scenario: `Map.prototype.keys` is replaced before the module is evaluated.
     * Expectation: evaluating the module does not throw; the replacement is for the entry check to refuse.
     */
    const restore = replace(Map.prototype, 'keys', hostile)
    try {
      expect(() => {
        jest.isolateModules(() => {
          require('./captured')
        })
      }).not.toThrow()
    } finally {
      restore()
    }
  })

  it('names the cause when the keys of a map are asked for after a pre-import replacement', () => {
    /**
     * Scenario: the module loaded while `Map.prototype.keys` was replaced, and a map's keys are asked for.
     * Expectation: a TypeError that names the replacement, not a call on undefined.
     */
    const restore = replace(Map.prototype, 'keys', () => undefined)
    let loaded: typeof import('./captured') | undefined
    try {
      jest.isolateModules(() => {
        loaded = require('./captured') as typeof import('./captured')
      })
    } finally {
      restore()
    }

    expect(() => loaded?.mapKeys(new Map())).toThrow(
      /Map\.prototype\.keys was replaced before the import/
    )
  })

  it('hands back what the host factory returned when a then is planted on Object.prototype inside it', async () => {
    /**
     * Scenario: the factory, which returns an object with no prototype, plants a self-erasing `then` on Object.prototype that would
     * resolve whatever the library hands back to forged options.
     * Expectation: the value read is the one the factory returned; the resolution never reads that `then`.
     */
    const real = Object.assign(Object.create(null) as { schema: string }, { schema: 'real' })
    const forged = { schema: 'forged' }
    const factory = (): typeof real => {
      Object.defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() {
          delete (Object.prototype as { then?: unknown }).then
          return (resolve: (box: unknown) => void) => resolve({ value: forged })
        }
      })
      return real
    }

    let resolved: { readonly value: unknown } | undefined
    try {
      resolved = await guardedResolve('reading what the options factory returned', factory)
    } finally {
      delete (Object.prototype as { then?: unknown }).then
    }

    expect(resolved?.value).toBe(real)
  })

  it('keeps the report layout when Math.max, Math.min and padEnd are replaced', () => {
    /**
     * Scenario: the public constructor formats a report while the three layout built-ins answer
     * something else.
     * Expectation: the message is the one built with the originals.
     */
    const issues = [
      { path: 'app', variable: 'APP_PORT', code: ConfigErrorCode.MISSING, message: 'missing' }
    ]
    const expected = new BymaxConfigValidationError(issues).message
    const restores = [
      replace(Math, 'max', () => 0),
      replace(Math, 'min', () => 0),
      replace(String.prototype, 'padEnd', () => '')
    ]
    let message: string
    try {
      message = new BymaxConfigValidationError(issues).message
    } finally {
      restores.forEach((restore) => restore())
    }

    expect(message).toBe(expected)
  })

  it('keeps the escape of a control character when padStart and Function.prototype.call are replaced', () => {
    /**
     * Scenario: an issue carries a control character while padStart and call answer something else.
     * Expectation: the character is written as the four-digit escape.
     */
    const issues = [{ path: 'a\u0001', variable: 'V', code: ConfigErrorCode.INVALID, message: 'm' }]
    const restores = [
      replace(String.prototype, 'padStart', () => 'x'),
      replace(Function.prototype, 'call', () => undefined)
    ]
    let path: string | undefined
    try {
      path = new BymaxConfigValidationError(issues).issues[0]?.path
    } finally {
      restores.forEach((restore) => restore())
    }

    expect(path).toBe('a\\u0001')
  })

  it('still tells an error of the library from another when WeakSet.has and add are replaced', () => {
    /**
     * Scenario: the weak set that marks the library's errors answers false and forgets.
     * Expectation: an error built by the library is still recognized, and a host's is not.
     */
    const restores = [
      replace(WeakSet.prototype, 'has', () => false),
      replace(WeakSet.prototype, 'add', () => undefined)
    ]
    let own: boolean
    let foreign: boolean
    try {
      own = isLibraryError(libraryError([]))
      foreign = isLibraryError(new BymaxConfigValidationError([]))
    } finally {
      restores.forEach((restore) => restore())
    }

    expect([own, foreign]).toEqual([true, false])
  })
})

describe('the fields of the error against a plant on the root prototype', () => {
  it.each([
    ['a read-only code', 'code', { value: 'planted', writable: false }],
    ['an accessor issues without a setter', 'issues', { get: () => [] }],
    ['an accessor issues that discards a write', 'issues', { get: () => [], set: () => undefined }]
  ])('builds the error with its own code and issues under %s', (_label, key, descriptor) => {
    /**
     * Scenario: the root prototype holds a field named like one of the error's.
     * Expectation: the constructor neither throws nor reports another list, and both fields are own.
     */
    Object.defineProperty(Object.prototype, key, { ...descriptor, configurable: true })
    let error: BymaxConfigValidationError
    try {
      error = new BymaxConfigValidationError([
        { path: 'app', variable: 'APP_PORT', code: ConfigErrorCode.MISSING, message: 'missing' }
      ])
    } finally {
      Reflect.deleteProperty(Object.prototype, key)
    }

    expect([
      Object.hasOwn(error, 'code'),
      Object.hasOwn(error, 'issues'),
      error.issues.length,
      error.message.includes('(1 issue')
    ]).toEqual([true, true, 1, true])
  })
})
