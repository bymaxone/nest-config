/**
 * Unit tests for the baseline of the built-ins the library calls and for the refusal when one is replaced.
 *
 * Layer: unit.
 * Goal: prove that every built-in on the list is compared by identity at every entry point that starts a
 * validation, that one replaced after the import is refused with a count and nothing else, that nothing
 * throws at import, and that the redaction of the configuration survives a replacement made while the
 * validation runs.
 * Mocks: none. Each built-in is replaced for one case by a proxy of itself, or by a wrong function, and
 * put back afterwards.
 */

import { inspect } from 'node:util'
import { z } from 'zod'

import { BASELINE, assertBuiltinsIntact, replacedBuiltins } from './builtins'
import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import { resolveSourceNames } from './source-mapping'

const getDescriptor = Object.getOwnPropertyDescriptor
const defineProp = Reflect.defineProperty

/** The names a person writes for the built-ins the library calls, written out for the comparison. */
const EXPECTED = [
  'Object.assign',
  'Object.create',
  'Object.defineProperty',
  'Object.entries',
  'Object.freeze',
  'Object.fromEntries',
  'Object.getOwnPropertyDescriptor',
  'Object.getOwnPropertyNames',
  'Object.getPrototypeOf',
  'Object.hasOwn',
  'Object.isFrozen',
  'Object.keys',
  'Object.setPrototypeOf',
  'Object.values',
  'Reflect.get',
  'Reflect.set',
  'Array.isArray',
  'ArrayBuffer.isView',
  'Number.isInteger',
  'Math.ceil',
  'Math.floor',
  'Math.max',
  'Math.min',
  'String.fromCodePoint',
  'Array.prototype.entries',
  'Array.prototype.every',
  'Array.prototype.filter',
  'Array.prototype.find',
  'Array.prototype.flatMap',
  'Array.prototype.includes',
  'Array.prototype.indexOf',
  'Array.prototype.join',
  'Array.prototype.keys',
  'Array.prototype.map',
  'Array.prototype.push',
  'Array.prototype.slice',
  'Array.prototype.some',
  'Array.prototype.sort',
  'Array.prototype.values',
  'Array.prototype.Symbol(Symbol.iterator)',
  'String.prototype.codePointAt',
  'String.prototype.padEnd',
  'String.prototype.padStart',
  'String.prototype.repeat',
  'String.prototype.replace',
  'String.prototype.split',
  'String.prototype.startsWith',
  'String.prototype.toUpperCase',
  'String.prototype.trim',
  'String.prototype.Symbol(Symbol.iterator)',
  'Number.prototype.toString',
  'Object.prototype.toString',
  'Object.prototype.valueOf',
  'RegExp.prototype.exec',
  'RegExp.prototype.test',
  'Set.prototype.add',
  'Set.prototype.delete',
  'Set.prototype.entries',
  'Set.prototype.has',
  'Set.prototype.keys',
  'Set.prototype.values',
  'Set.prototype.Symbol(Symbol.iterator)',
  'Map.prototype.delete',
  'Map.prototype.entries',
  'Map.prototype.get',
  'Map.prototype.has',
  'Map.prototype.keys',
  'Map.prototype.set',
  'Map.prototype.values',
  'Map.prototype.Symbol(Symbol.iterator)',
  'WeakSet.prototype.add',
  'WeakSet.prototype.has',
  'Function.prototype.apply',
  'Function.prototype.bind',
  'Function.prototype.call',
  'globalThis.Map',
  'globalThis.Number',
  'globalThis.RangeError',
  'globalThis.Set',
  'globalThis.String',
  'globalThis.Symbol',
  'globalThis.TypeError',
  'globalThis.WeakSet',
  'node:util.types.isAnyArrayBuffer',
  'node:util.types.isArgumentsObject',
  'node:util.types.isBoxedPrimitive',
  'node:util.types.isDataView',
  'node:util.types.isDate',
  'node:util.types.isGeneratorObject',
  'node:util.types.isMap',
  'node:util.types.isMapIterator',
  'node:util.types.isNativeError',
  'node:util.types.isPromise',
  'node:util.types.isRegExp',
  'node:util.types.isSet',
  'node:util.types.isSetIterator',
  'node:util.types.isTypedArray',
  'node:util.types.isWeakMap',
  'node:util.types.isWeakSet',
  'ArrayIterator.prototype.next',
  'SetIterator.prototype.next',
  'MapIterator.prototype.next',
  'StringIterator.prototype.next'
]

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

/** Replaces `key` of `owner` with `value`, runs `run`, and puts the original descriptor back. */
function withReplaced<T>(owner: object, key: PropertyKey, value: unknown, run: () => T): T {
  const original = getDescriptor(owner, key) as PropertyDescriptor
  defineProp(owner, key, { ...original, value })
  try {
    return run()
  } finally {
    defineProp(owner, key, original)
  }
}

/** A different function that behaves as `original` does, so only its identity differs. */
function sameBehaviour(original: unknown): unknown {
  return typeof original === 'function' ? new Proxy(original, {}) : original
}

/** What each entry point that starts a validation does, with the same valid input. */
const ENTRIES: ReadonlyArray<readonly [string, (config: object) => unknown]> = [
  ['forRoot', () => BymaxConfigModule.forRoot({ schema })],
  [
    'forRootAsync',
    () => BymaxConfigModule.forRootAsync({ useFactory: () => ({ schema }), inject: [] })
  ],
  ['createValidatedConfig', () => createValidatedConfig({ schema, source: {} })],
  ['validateEnv', () => validateEnv(schema, {}, {})],
  ['resolveSourceNames', () => resolveSourceNames(schema)],
  ['ConfigService', (config) => new ConfigService(config as never)]
]

describe('the list of built-ins the library calls', () => {
  it('is the list the tests were written against', () => {
    expect(BASELINE.map((entry) => entry.name).sort()).toEqual([...EXPECTED].sort())
  })

  it('holds a function for every name except the ones that are constructors or tables', () => {
    expect(BASELINE.every((entry) => entry.original !== undefined)).toBe(true)
  })
})

describe('nothing is replaced', () => {
  it('counts no replaced built-in and does not refuse', () => {
    expect(replacedBuiltins()).toBe(0)
    expect(() => assertBuiltinsIntact()).not.toThrow()
  })

  it('counts a property that became an accessor as replaced', () => {
    const original = getDescriptor(Math, 'floor') as PropertyDescriptor
    defineProp(Math, 'floor', { get: () => original.value as unknown, configurable: true })
    try {
      expect(replacedBuiltins()).toBe(1)
    } finally {
      defineProp(Math, 'floor', original)
    }
  })
})

describe.each(BASELINE.map((entry) => [entry.name, entry] as const))(
  'with %s replaced by a proxy of itself',
  (_name, entry) => {
    it('is refused at every entry point with a count and nothing else', () => {
      const config = createValidatedConfig({ schema, source: {} })

      withReplaced(entry.owner, entry.key, sameBehaviour(entry.original), () => {
        for (const [, start] of ENTRIES) {
          let failure: unknown
          try {
            start(config)
          } catch (error) {
            failure = error
          }
          expect(failure).toBeInstanceOf(BymaxConfigValidationError)
          expect((failure as BymaxConfigValidationError).issues).toEqual([
            {
              path: '',
              variable: '(runtime)',
              code: ConfigErrorCode.INVALID,
              message: '1 of the built-ins the library calls were replaced after it loaded'
            }
          ])
        }
      })
    })
  }
)

describe('a built-in replaced by a function that answers wrongly', () => {
  it.each([
    ['Object.defineProperty', Object, 'defineProperty'],
    ['Object.getPrototypeOf', Object, 'getPrototypeOf'],
    ['String.prototype.startsWith', String.prototype, 'startsWith'],
    ['Array.prototype.sort', Array.prototype, 'sort'],
    ['Array.prototype.filter', Array.prototype, 'filter'],
    ['Array.prototype.includes', Array.prototype, 'includes'],
    ['Set.prototype.has', Set.prototype, 'has']
  ])('refuses %s at every entry point', (_name, owner, key) => {
    const config = createValidatedConfig({ schema, source: {} })

    withReplaced(
      owner,
      key,
      () => undefined,
      () => {
        for (const [, start] of ENTRIES) {
          expect(() => start(config)).toThrow()
        }
      }
    )
  })
})

describe('the library is loaded while a built-in is replaced', () => {
  it('does not throw at import', () => {
    expect(() =>
      withReplaced(
        Array.prototype,
        'filter',
        () => [],
        () => {
          jest.isolateModules(() => {
            require('./builtins')
          })
        }
      )
    ).not.toThrow()
  })
})

describe('the library is loaded while the built-in that finds the iterators is replaced', () => {
  it.each([
    ['returns nothing', () => undefined],
    [
      'throws',
      () => {
        throw new Error('replaced')
      }
    ]
  ])('does not throw at import when Object.getPrototypeOf %s', (_name, replacement) => {
    expect(() =>
      withReplaced(Object, 'getPrototypeOf', replacement, () => {
        jest.isolateModules(() => {
          require('./builtins')
        })
      })
    ).not.toThrow()
  })
})

describe('the redaction of the configuration', () => {
  it('survives Object.defineProperty being replaced while the validation runs', () => {
    const hostile = defineEnv({
      app: z.object({
        secret: z.string().refine(() => {
          Object.defineProperty = (() => undefined) as never
          return true
        })
      })
    })
    const original = getDescriptor(Object, 'defineProperty') as PropertyDescriptor
    let config: object
    try {
      config = createValidatedConfig({
        schema: hostile,
        source: { APP_SECRET: 'the-secret-value' }
      })
    } finally {
      defineProp(Object, 'defineProperty', original)
    }

    expect(JSON.stringify(config)).not.toContain('the-secret-value')
    expect(inspect(config)).not.toContain('the-secret-value')
  })
})

describe('the own-property read of a variable named __proto__', () => {
  it('survives Object.hasOwn being replaced while the source is read', () => {
    const named = defineEnv({
      app: z.object({ name: z.string().default('default-name').meta({ env: '__proto__' }) })
    })
    const original = getDescriptor(Object, 'hasOwn') as PropertyDescriptor
    const source = Object.defineProperty({}, '__proto__', { value: 'hidden' }) as Record<
      string,
      unknown
    >
    Object.defineProperty(source, 'TRIGGER', {
      enumerable: true,
      get: () => {
        defineProp(Object, 'hasOwn', { ...original, value: () => false })
        return 'x'
      }
    })
    let name: string | undefined
    try {
      name = createValidatedConfig({ schema: named, source: source as never }).app.name
    } finally {
      defineProp(Object, 'hasOwn', original)
    }

    expect(name).toBe('hidden')
  })
})
