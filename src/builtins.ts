/**
 * @fileoverview The built-ins the library calls, as they were when the module loaded, and the check that
 * none of them has been replaced since.
 * @layer Utility
 *
 * Code that replaces a built-in after the import is running with the authority of the process, and the
 * library cannot make every call it makes immune to it. What it can do is notice: every entry point that
 * starts a validation compares each built-in it calls with the one it saw at load, by identity, and refuses
 * with the number that differ and nothing else. Nothing here throws at import.
 */

import nodeUtil, { types } from 'node:util'

import { ConfigErrorCode, libraryError } from './errors'

/** One built-in the library calls: where it lives, what it is called, and what it was at load. */
interface Baseline {
  /** The owner and the key, as a person writes them (`Array.prototype.filter`). */
  readonly name: string
  readonly owner: object
  readonly key: PropertyKey
  readonly original: PropertyDescriptor | undefined
}

const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const defineBaseline = (name: string, owner: object, key: PropertyKey): Baseline => ({
  name,
  owner,
  key,
  original: getOwnPropertyDescriptor(owner, key)
})

/** Owners whose methods the library calls, by the name a person writes for them. */
const OWNERS: ReadonlyArray<readonly [string, object, readonly PropertyKey[]]> = [
  [
    'Object',
    Object,
    [
      'assign',
      'create',
      'defineProperty',
      'entries',
      'freeze',
      'fromEntries',
      'getOwnPropertyDescriptor',
      'getOwnPropertyNames',
      'getPrototypeOf',
      'hasOwn',
      'isFrozen',
      'keys',
      'setPrototypeOf',
      'values'
    ]
  ],
  ['Reflect', Reflect, ['apply', 'get', 'set']],
  ['Array', Array, ['isArray']],
  ['ArrayBuffer', ArrayBuffer, ['isView']],
  ['Number', Number, ['isInteger']],
  ['Math', Math, ['ceil', 'floor', 'max', 'min']],
  ['String', String, ['fromCodePoint']],
  [
    'Array.prototype',
    Array.prototype,
    [
      'entries',
      'every',
      'filter',
      'find',
      'flatMap',
      'includes',
      'indexOf',
      'join',
      'keys',
      'map',
      'push',
      'slice',
      'some',
      'sort',
      'values',
      Symbol.iterator
    ]
  ],
  [
    'String.prototype',
    String.prototype,
    [
      'codePointAt',
      'includes',
      'indexOf',
      'padEnd',
      'padStart',
      'repeat',
      'replace',
      'slice',
      'split',
      'startsWith',
      'toUpperCase',
      'trim',
      Symbol.iterator
    ]
  ],
  ['Number.prototype', Number.prototype, ['toString']],
  ['Object.prototype', Object.prototype, ['toString', 'valueOf']],
  [
    'RegExp.prototype',
    RegExp.prototype,
    ['exec', 'test', Symbol.match, Symbol.matchAll, Symbol.replace, Symbol.search, Symbol.split]
  ],
  [
    'Set.prototype',
    Set.prototype,
    ['add', 'delete', 'entries', 'has', 'keys', 'values', Symbol.iterator]
  ],
  [
    'Map.prototype',
    Map.prototype,
    ['delete', 'entries', 'get', 'has', 'keys', 'set', 'values', Symbol.iterator]
  ],
  ['WeakSet.prototype', WeakSet.prototype, ['add', 'has']],
  ['Function.prototype', Function.prototype, ['apply', 'bind', 'call']],
  [
    'globalThis',
    globalThis,
    [
      'Array',
      'ArrayBuffer',
      'Error',
      'Map',
      'Math',
      'Number',
      'Object',
      'RangeError',
      'Reflect',
      'RegExp',
      'Set',
      'String',
      'Symbol',
      'TypeError',
      'WeakSet',
      'process'
    ]
  ],
  ['node:util', nodeUtil, ['inspect', 'types']],
  [
    'node:util.types',
    types,
    [
      'isAnyArrayBuffer',
      'isArgumentsObject',
      'isBoxedPrimitive',
      'isDataView',
      'isDate',
      'isGeneratorObject',
      'isMap',
      'isMapIterator',
      'isNativeError',
      'isPromise',
      'isRegExp',
      'isSet',
      'isSetIterator',
      'isTypedArray',
      'isWeakMap',
      'isWeakSet'
    ]
  ]
]

/**
 * The `next` of the iterators the library's loops and spreads run through, which their owners do not name.
 * Each owner is found by a thunk, so that a built-in replaced before the import leaves the entry out and
 * does not make the module throw.
 */
const ITERATORS: ReadonlyArray<readonly [string, () => unknown]> = [
  ['ArrayIterator.prototype', (): unknown => Object.getPrototypeOf([][Symbol.iterator]())],
  ['SetIterator.prototype', (): unknown => Object.getPrototypeOf(new Set()[Symbol.iterator]())],
  ['MapIterator.prototype', (): unknown => Object.getPrototypeOf(new Map()[Symbol.iterator]())],
  ['StringIterator.prototype', (): unknown => Object.getPrototypeOf(''[Symbol.iterator]())]
]

/**
 * The baseline entry of an iterator prototype, or nothing when the prototype cannot be found.
 *
 * @param name - The name of the iterator prototype.
 * @param find - Finds the prototype.
 * @returns The entry for its `next`, or an empty list.
 */
function iteratorBaseline(name: string, find: () => unknown): Baseline[] {
  try {
    const owner = find()
    return typeof owner === 'object' && owner !== null
      ? [defineBaseline(`${name}.next`, owner, 'next')]
      : []
  } catch {
    return []
  }
}

/** Every built-in the library calls, as it was when the module loaded. */
export const BASELINE: ReadonlyArray<Baseline> = [
  ...OWNERS.flatMap(([name, owner, keys]) =>
    keys.map((key) => defineBaseline(`${name}.${String(key)}`, owner, key))
  ),
  ...ITERATORS.flatMap(([name, find]) => iteratorBaseline(name, find))
]

/**
 * Whether two descriptors of a property hold the same value, getter and setter, by identity. A global that
 * the runtime defines as an accessor is compared through its getter.
 *
 * @param now - The descriptor of the property now.
 * @param then - The descriptor it had when the module loaded.
 * @returns True when nothing a caller could observe differs.
 */
export function sameDescriptor(
  now: PropertyDescriptor | undefined,
  then: PropertyDescriptor | undefined
): boolean {
  if (now === undefined || then === undefined) return now === then
  return now.value === then.value && now.get === then.get && now.set === then.set
}

/**
 * Count the built-ins that are no longer what they were when the module loaded.
 *
 * @returns How many differ by identity, a property that became an accessor included.
 */
export function replacedBuiltins(): number {
  // By index: a `for...of` would ask the Array iterator, which is one of the built-ins being checked.
  let replaced = 0
  for (let at = 0; at < BASELINE.length; at += 1) {
    const { owner, key, original } = BASELINE[at] as Baseline
    if (!sameDescriptor(getOwnPropertyDescriptor(owner, key), original)) replaced += 1
  }
  return replaced
}

/**
 * Refuse to start when a built-in the library calls has been replaced since the module loaded.
 *
 * @throws {BymaxConfigValidationError} With one issue that carries the count and no name or value.
 */
export function assertBuiltinsIntact(): void {
  const replaced = replacedBuiltins()
  if (replaced === 0) return
  throw libraryError([
    {
      path: '',
      variable: '(runtime)',
      code: ConfigErrorCode.INVALID,
      message: `${replaced} of the built-ins the library calls were replaced after it loaded`
    }
  ])
}
