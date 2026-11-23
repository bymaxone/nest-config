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

import {
  BASELINE,
  assertBuiltinsIntact,
  replacedBuiltins,
  sameDescriptor,
  unchanged
} from './builtins'
import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import {
  BymaxConfigValidationError,
  ConfigErrorCode,
  isLibraryError,
  libraryError,
  runtimeRefusal
} from './errors'
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
  'Reflect.apply',
  'Reflect.get',
  'Reflect.set',
  'Array.isArray',
  'Array.Symbol(Symbol.species)',
  'ArrayBuffer.isView',
  'Number.isInteger',
  'Math.ceil',
  'Math.floor',
  'Math.max',
  'Math.min',
  'String.fromCodePoint',
  'Array.prototype.constructor',
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
  'String.prototype.includes',
  'String.prototype.indexOf',
  'String.prototype.padEnd',
  'String.prototype.padStart',
  'String.prototype.repeat',
  'String.prototype.replace',
  'String.prototype.slice',
  'String.prototype.split',
  'String.prototype.startsWith',
  'String.prototype.toUpperCase',
  'String.prototype.trim',
  'String.prototype.Symbol(Symbol.iterator)',
  'Number.prototype.toString',
  'Object.prototype.constructor',
  'Object.prototype.toString',
  'Object.prototype.valueOf',
  'Object.prototype.Symbol(Symbol.toPrimitive)',
  'Date.prototype.Symbol(Symbol.toPrimitive)',
  'Symbol.prototype.Symbol(Symbol.toPrimitive)',
  'RegExp.prototype.constructor',
  'RegExp.prototype.dotAll',
  'RegExp.prototype.exec',
  'RegExp.prototype.flags',
  'RegExp.prototype.global',
  'RegExp.prototype.hasIndices',
  'RegExp.prototype.ignoreCase',
  'RegExp.prototype.multiline',
  'RegExp.prototype.sticky',
  'RegExp.prototype.test',
  'RegExp.prototype.unicode',
  'RegExp.prototype.unicodeSets',
  'RegExp.prototype.Symbol(Symbol.match)',
  'RegExp.prototype.Symbol(Symbol.matchAll)',
  'RegExp.prototype.Symbol(Symbol.replace)',
  'RegExp.prototype.Symbol(Symbol.search)',
  'RegExp.prototype.Symbol(Symbol.split)',
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
  'globalThis.Array',
  'globalThis.ArrayBuffer',
  'globalThis.Error',
  'globalThis.Map',
  'globalThis.Math',
  'globalThis.Number',
  'globalThis.Object',
  'globalThis.RangeError',
  'globalThis.Reflect',
  'globalThis.RegExp',
  'globalThis.Set',
  'globalThis.String',
  'globalThis.Symbol',
  'globalThis.TypeError',
  'globalThis.WeakSet',
  'globalThis.process',
  'node:util.inspect',
  'node:util.types',
  'node:util.inspect.custom',
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
  'StringIterator.prototype.next',
  'IteratorPrototype.Symbol(Symbol.iterator)'
]

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

/** Replaces `key` of `owner` with `value`, runs `run`, and puts the original descriptor back. */
function withReplaced<T>(owner: object, key: PropertyKey, value: unknown, run: () => T): T {
  const original = getDescriptor(owner, key)
  defineProp(owner, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: original?.enumerable === true
  })
  try {
    return run()
  } finally {
    if (original === undefined) Reflect.deleteProperty(owner, key)
    else defineProp(owner, key, original)
  }
}

/** A different object that behaves as what the property holds does, so only its identity differs. */
function sameBehaviour(owner: object, key: PropertyKey): unknown {
  const held = Reflect.get(owner, key) as unknown
  if (typeof held === 'symbol') return Symbol('replacement')
  return typeof held === 'function' || (typeof held === 'object' && held !== null)
    ? new Proxy(held, {})
    : held
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

/** The list as a copy of the module that is loaded afresh holds it, so the code that builds it runs in the case. */
function freshBaseline(): ReadonlyArray<{
  name: string
  original: PropertyDescriptor | undefined
}> {
  let loaded: ReadonlyArray<{ name: string; original: PropertyDescriptor | undefined }> = []
  jest.isolateModules(() => {
    loaded = (require('./builtins') as typeof import('./builtins')).BASELINE
  })
  return loaded
}

describe('the list of built-ins the library calls', () => {
  it('is the list the tests were written against', () => {
    expect(
      freshBaseline()
        .map((entry) => entry.name)
        .sort()
    ).toEqual([...EXPECTED].sort())
    expect(BASELINE.map((entry) => entry.name).sort()).toEqual([...EXPECTED].sort())
  })

  it('holds the descriptor every built-in had when the module loaded', () => {
    const absent = freshBaseline()
      .filter((entry) => entry.original === undefined)
      .map((entry) => entry.name)

    // Only the conversion hook that Object.prototype does not define is recorded as absent.
    expect(absent).toEqual(['Object.prototype.Symbol(Symbol.toPrimitive)'])
  })
})

describe('the comparison of two descriptors', () => {
  const fn = (): void => undefined
  const other = (): void => undefined

  it.each([
    ['no descriptor on either side', undefined, undefined, true],
    ['a descriptor that is gone now', undefined, { value: fn }, false],
    ['a descriptor that was not there when the module loaded', { value: fn }, undefined, false],
    ['the same value', { value: fn }, { value: fn }, true],
    ['another value', { value: other }, { value: fn }, false],
    ['the same getter', { get: fn }, { get: fn }, true],
    ['another getter', { get: other }, { get: fn }, false],
    ['another setter', { set: other }, { set: fn }, false]
  ])('says %s: %s', (_name, now, then, same) => {
    expect(sameDescriptor(now, then)).toBe(same)
  })
})

describe('the comparison of a built-in with what was recorded, accessors included', () => {
  const owner = {}
  const getter = (): number => 1
  const recorded = { original: { get: getter }, resolved: 1 }

  it.each([
    [
      'nothing there then and nothing now',
      undefined,
      { original: undefined, resolved: undefined },
      true
    ],
    [
      'a data property that is the same',
      { value: 1 },
      { original: { value: 1 }, resolved: undefined },
      true
    ],
    ['an accessor that answers what it answered', { get: getter }, recorded, true],
    [
      'an accessor whose getter answers another value',
      { get: getter },
      { ...recorded, resolved: 2 },
      false
    ],
    [
      'a descriptor that differs',
      { value: 2 },
      { original: { value: 1 }, resolved: undefined },
      false
    ]
  ])('says %s: %s', (_name, now, entry, same) => {
    expect(unchanged(owner, now, entry)).toBe(same)
  })

  it('counts a global assigned another value behind an unchanged accessor', () => {
    const descriptor = getDescriptor(globalThis, 'process') as PropertyDescriptor
    const fake = { env: { APP_NAME: 'replacement' } }
    ;(globalThis as { process: unknown }).process = fake
    try {
      expect(replacedBuiltins()).toBe(1)
    } finally {
      defineProp(globalThis, 'process', descriptor)
    }
    expect(replacedBuiltins()).toBe(0)
  })
})

describe('the refusal for a replaced built-in', () => {
  const stripped = (error: BymaxConfigValidationError): unknown => ({
    message: error.message,
    name: error.name,
    code: error.code,
    issues: error.issues,
    own: Object.getOwnPropertyNames(error).sort(),
    nameDescriptor: { ...Object.getOwnPropertyDescriptor(error, 'name') },
    codeDescriptor: { ...Object.getOwnPropertyDescriptor(error, 'code') },
    issuesDescriptor: { ...Object.getOwnPropertyDescriptor(error, 'issues'), value: undefined }
  })

  it('has the shape libraryError gives, and is marked as the library own', () => {
    const made = runtimeRefusal(1)
    const reference = libraryError([
      {
        path: '',
        variable: '(runtime)',
        code: ConfigErrorCode.INVALID,
        message: '1 of the built-ins the library calls were replaced after it loaded'
      }
    ])

    expect(made).toBeInstanceOf(BymaxConfigValidationError)
    expect(stripped(made)).toEqual(stripped(reference))
    expect(isLibraryError(made)).toBe(true)
    expect(Object.isFrozen(made.issues)).toBe(true)
    expect(Object.isFrozen(made.issues[0])).toBe(true)
  })

  const wrongAnswers: ReadonlyArray<readonly [string, object, PropertyKey, () => unknown]> = [
    ['Array.isArray', Array, 'isArray', () => false],
    ['Number.isInteger', Number, 'isInteger', () => false],
    ['Object.keys', Object, 'keys', () => []],
    ['Object.freeze', Object, 'freeze', () => undefined],
    ['Object.setPrototypeOf', Object, 'setPrototypeOf', () => undefined],
    ['Object.defineProperty', Object, 'defineProperty', () => undefined],
    ['Reflect.get', Reflect, 'get', () => undefined],
    ['Reflect.set', Reflect, 'set', () => false],
    ['String.fromCodePoint', String, 'fromCodePoint', () => ''],
    ['Array.prototype.some', Array.prototype, 'some', () => false],
    ['Object.assign', Object, 'assign', () => undefined],
    [
      'the Symbol.iterator the iterators inherit',
      Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())) as object,
      Symbol.iterator,
      () => ({ next: () => ({ done: true, value: undefined }) })
    ]
  ]

  it.each(wrongAnswers)(
    'is still the structured error when %s answers wrongly',
    (_name, owner, key, wrong) => {
      let failure: unknown
      withReplaced(owner, key, wrong, () => {
        try {
          assertBuiltinsIntact()
        } catch (error) {
          failure = error
        }
      })

      expect(failure).toBeInstanceOf(BymaxConfigValidationError)
      expect((failure as BymaxConfigValidationError).code).toBe(ConfigErrorCode.VALIDATION)
      expect((failure as BymaxConfigValidationError).issues).toEqual([
        {
          path: '',
          variable: '(runtime)',
          code: ConfigErrorCode.INVALID,
          message: '1 of the built-ins the library calls were replaced after it loaded'
        }
      ])
    }
  )
})

/** The parts of a loaded copy of the module the cases below use. */
interface Loaded {
  readonly BASELINE: ReadonlyArray<{ name: string }>
  assertBuiltinsIntact(): void
}

describe('the library is loaded while a built-in it builds its list with is replaced', () => {
  /** The list of a copy of the module that is loaded while `run` holds the replacement, and what it then refuses. */
  function loadedUnder(
    owner: object,
    key: PropertyKey,
    value: unknown
  ): { names: string[]; refused: unknown } {
    const holder: { loaded?: Loaded } = {}
    withReplaced(owner, key, value, () => {
      jest.isolateModules(() => {
        holder.loaded = require('./builtins') as Loaded
      })
    })
    const loaded = holder.loaded as Loaded
    let refused: unknown
    try {
      loaded.assertBuiltinsIntact()
    } catch (error) {
      refused = error
    }
    return { names: loaded.BASELINE.map((entry) => entry.name).sort(), refused }
  }

  it('records the whole list and does not throw when Array.prototype.flatMap returns nothing', () => {
    const { names } = loadedUnder(Array.prototype, 'flatMap', () => undefined)

    expect(names).toEqual([...EXPECTED].sort())
  })

  it('does not throw at import when Object.getOwnPropertyDescriptor answers nothing', () => {
    const { names } = loadedUnder(Object, 'getOwnPropertyDescriptor', () => undefined)

    expect(names).toEqual([...EXPECTED].sort())
  })

  it('does not throw at import and refuses at use when the Symbol global is gone, and keeps the rest', () => {
    const symbol = getDescriptor(globalThis, 'Symbol') as PropertyDescriptor
    const { names, refused } = loadedUnder(globalThis, 'Symbol', undefined)

    expect(names).toContain('Object.keys')
    expect(names).not.toContain('Array.prototype.map')
    expect((refused as BymaxConfigValidationError).name).toBe('BymaxConfigValidationError')
    // Nine groups name a Symbol key and five iterator prototypes are found through one, and none of them can be
    // recorded; the Symbol entry itself differs from the one recorded once the global is back.
    expect((refused as BymaxConfigValidationError).issues[0]?.message).toBe(
      '15 of the built-ins the library calls were replaced after it loaded'
    )
    expect(getDescriptor(globalThis, 'Symbol')).toEqual(symbol)
  })

  it('counts a built-in whose getter throws while the module loads as unrecorded and leaves the rest', () => {
    const original = getDescriptor(globalThis, 'ArrayBuffer') as PropertyDescriptor
    const holder: { loaded?: Loaded } = {}
    defineProp(globalThis, 'ArrayBuffer', {
      get: () => {
        throw new Error('replaced')
      },
      configurable: true
    })
    try {
      jest.isolateModules(() => {
        holder.loaded = require('./builtins') as Loaded
      })
    } finally {
      defineProp(globalThis, 'ArrayBuffer', original)
    }
    const loaded = holder.loaded as Loaded
    let refused: unknown
    try {
      loaded.assertBuiltinsIntact()
    } catch (error) {
      refused = error
    }

    expect(loaded.BASELINE.map((entry) => entry.name).sort()).toEqual(
      [...EXPECTED]
        .filter((name) => name !== 'globalThis.ArrayBuffer' && name !== 'ArrayBuffer.isView')
        .sort()
    )
    // The group that names the global and the entry that records its accessor each fail to be recorded.
    expect((refused as BymaxConfigValidationError).issues[0]?.message).toBe(
      '2 of the built-ins the library calls were replaced after it loaded'
    )
  })

  it('counts an iterator prototype that cannot be found as unrecorded', () => {
    const { names, refused } = loadedUnder(Object, 'getPrototypeOf', () => undefined)

    expect(names).toEqual(
      [...EXPECTED]
        .filter(
          (name) =>
            !name.endsWith('Iterator.prototype.next') && !name.startsWith('IteratorPrototype')
        )
        .sort()
    )
    expect((refused as BymaxConfigValidationError).issues[0]?.message).toBe(
      // The five iterator prototypes that could not be found, and Object.getPrototypeOf itself, which differs from what was recorded.
      '6 of the built-ins the library calls were replaced after it loaded'
    )
  })
})

describe('a built-in that cannot be read when the check runs', () => {
  it('counts as replaced', () => {
    const unreadable = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error('unreadable')
        }
      }
    )
    // The list is read-only in its type; the case appends one unreadable entry through the array's own methods.
    Reflect.apply(Array.prototype.push, BASELINE, [
      { name: 'unreadable', owner: unreadable, key: 'x', original: undefined, resolved: undefined }
    ])
    try {
      expect(replacedBuiltins()).toBe(1)
    } finally {
      Reflect.apply(Array.prototype.pop, BASELINE, [])
    }
    expect(replacedBuiltins()).toBe(0)
  })
})

describe('a built-in that was deleted', () => {
  it('counts as replaced', () => {
    const original = getDescriptor(Math, 'floor') as PropertyDescriptor
    Reflect.deleteProperty(Math, 'floor')
    try {
      expect(replacedBuiltins()).toBe(1)
    } finally {
      defineProp(Math, 'floor', original)
    }
  })
})

describe('descriptor fields planted on Object.prototype after the import', () => {
  // The planting wraps plain-object owners only: a planted `get` makes the descriptor of a property of the
  // test sandbox's global invalid for the engine itself, which no read of the library can prevent.
  it.each(['get', 'set', 'value'] as const)(
    'does not read an inherited %s from the descriptor of a data property or of an accessor',
    (field) => {
      const floor = getDescriptor(Math, 'floor') as PropertyDescriptor
      const flags = getDescriptor(RegExp.prototype, 'flags') as PropertyDescriptor
      const planted = jest.fn(() => 1)
      defineProp(Object.prototype, field, { value: planted, configurable: true, writable: true })
      try {
        expect(unchanged(Math, floor, { original: floor, resolved: undefined })).toBe(true)
        expect(unchanged(RegExp.prototype, flags, { original: flags, resolved: '' })).toBe(true)
        expect(sameDescriptor(floor, floor)).toBe(true)
        expect(planted).not.toHaveBeenCalled()
      } finally {
        Reflect.deleteProperty(Object.prototype, field)
      }
    }
  )
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

      withReplaced(entry.owner, entry.key, sameBehaviour(entry.owner, entry.key), () => {
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

describe('the check itself, with the iterators it could be blinded through replaced', () => {
  it.each([
    [
      'the next of the Array iterator',
      Object.getPrototypeOf([][Symbol.iterator]()) as object,
      'next'
    ],
    ['Array.prototype[Symbol.iterator]', Array.prototype, Symbol.iterator]
  ])(
    'still counts a replacement when %s is replaced by a function that ends at once',
    (_name, owner, key) => {
      const ends =
        key === 'next'
          ? () => ({ done: true, value: undefined })
          : () => ({ next: () => ({ done: true }) })

      const counted = withReplaced(owner, key, ends, () => replacedBuiltins())

      expect(counted).toBe(1)
    }
  )
})
