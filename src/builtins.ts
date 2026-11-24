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

import { runtimeRefusal } from './errors'

/** One built-in the library calls: where it lives, what it is called, and what it was at load. */
interface Baseline {
  /** The owner and the key, as a person writes them (`Array.prototype.filter`). */
  readonly name: string
  readonly owner: object
  readonly key: PropertyKey
  readonly original: PropertyDescriptor | undefined
  /** What an accessor answered when the module loaded, so a replaced value behind an unchanged getter shows. */
  readonly resolved: unknown
}

const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const apply = Reflect.apply
const hasOwn = Object.hasOwn

/**
 * One field of a descriptor, read only when the descriptor holds it itself: a descriptor is an ordinary
 * object, so a `get`, `set` or `value` planted on Object.prototype would otherwise be read from it.
 *
 * @param descriptor - The descriptor to read.
 * @param field - Which field.
 * @returns The own field, or undefined when the descriptor has none.
 */
export function fieldOf(descriptor: PropertyDescriptor, field: 'get' | 'set' | 'value'): unknown {
  return hasOwn(descriptor, field) ? descriptor[field] : undefined
}

// Stryker disable next-line ArrayDeclaration: a getter takes no arguments, so one extra argument is not observable and a getter that read it would be a different built-in
const NO_ARGUMENTS: readonly unknown[] = []

/** How many built-ins could not be recorded at load, which counts as replaced when the check runs. */
let unrecorded = 0

/**
 * Record one built-in, or count it as unrecorded when reading it throws.
 *
 * @param into - The list being built.
 * @param name - The name a person writes for it.
 * @param owner - Where it lives.
 * @param key - What it is called there.
 */
function record(into: Baseline[], name: string, owner: object, key: PropertyKey): void {
  try {
    const original = getOwnPropertyDescriptor(owner, key)
    const getter = original === undefined ? undefined : fieldOf(original, 'get')
    into[into.length] = {
      name,
      owner,
      key,
      original,
      resolved:
        getter === undefined ? undefined : apply(getter as () => unknown, owner, NO_ARGUMENTS)
    }
  } catch {
    unrecorded += 1
  }
}

/** A group of built-ins: the name a person writes for the owner, the owner, and the keys the library calls. */
type Group = readonly [string, object, readonly PropertyKey[]]

/** Each group is found by a thunk, so that one that cannot be built leaves out only itself. */
const OWNER_GROUPS: ReadonlyArray<() => Group> = [
  (): Group => [
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
  (): Group => ['Reflect', Reflect, ['apply', 'get', 'set']],
  (): Group => ['Array', Array, ['isArray', Symbol.species]],
  (): Group => ['ArrayBuffer', ArrayBuffer, ['isView']],
  (): Group => ['Number', Number, ['isInteger']],
  (): Group => ['Math', Math, ['ceil', 'floor', 'max', 'min']],
  (): Group => ['String', String, ['fromCodePoint']],
  (): Group => [
    'Array.prototype',
    Array.prototype,
    [
      'constructor',
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
  (): Group => [
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
      Symbol.iterator,
      // Absent in every engine today; recorded as absent, so a hook planted afterwards, which `split`
      // and `replace` would call in place of their own, counts as a replacement.
      Symbol.match,
      Symbol.replace,
      Symbol.search,
      Symbol.split
    ]
  ],
  (): Group => ['Number.prototype', Number.prototype, ['toString']],
  (): Group => [
    'Object.prototype',
    Object.prototype,
    ['constructor', 'toString', 'valueOf', Symbol.toPrimitive]
  ],
  (): Group => ['Date.prototype', Date.prototype, [Symbol.toPrimitive]],
  (): Group => ['Symbol.prototype', Symbol.prototype, [Symbol.toPrimitive]],
  (): Group => [
    'RegExp.prototype',
    RegExp.prototype,
    [
      'constructor',
      'dotAll',
      'exec',
      'flags',
      'global',
      'hasIndices',
      'ignoreCase',
      'multiline',
      'sticky',
      'test',
      'unicode',
      'unicodeSets',
      Symbol.match,
      Symbol.matchAll,
      Symbol.replace,
      Symbol.search,
      Symbol.split
    ]
  ],
  (): Group => [
    'Set.prototype',
    Set.prototype,
    ['add', 'delete', 'entries', 'has', 'keys', 'values', Symbol.iterator]
  ],
  (): Group => [
    'Map.prototype',
    Map.prototype,
    ['delete', 'entries', 'get', 'has', 'keys', 'set', 'values', Symbol.iterator]
  ],
  (): Group => ['WeakSet.prototype', WeakSet.prototype, ['add', 'has']],
  (): Group => ['Function.prototype', Function.prototype, ['apply', 'bind', 'call']],
  (): Group => [
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
  (): Group => ['node:util', nodeUtil, ['inspect', 'types']],
  (): Group => ['node:util.inspect', nodeUtil.inspect, ['custom']],
  (): Group => [
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

// Stryker disable next-line ArrayDeclaration: every array iterates with the same prototype, so the content of this one is not observable; the case that replaces the next of the Array iterator shows the entry works
const SOME_ARRAY: readonly unknown[] = []
// Stryker disable next-line StringLiteral: every string iterates with the same prototype, so the content of this one is not observable; the case that replaces the next of the String iterator shows the entry works
const SOME_STRING = ''

/**
 * The `next` of the iterators the library's loops and spreads run through, which their owners do not name.
 * Each owner is found by a thunk, so that a built-in replaced before the import leaves the entry out and
 * does not make the module throw.
 */
const ITERATORS: ReadonlyArray<readonly [string, () => unknown, () => PropertyKey]> = [
  [
    'ArrayIterator.prototype',
    (): unknown => Object.getPrototypeOf(SOME_ARRAY[Symbol.iterator]()),
    (): PropertyKey => 'next'
  ],
  [
    'SetIterator.prototype',
    (): unknown => Object.getPrototypeOf(new Set()[Symbol.iterator]()),
    (): PropertyKey => 'next'
  ],
  [
    'MapIterator.prototype',
    (): unknown => Object.getPrototypeOf(new Map()[Symbol.iterator]()),
    (): PropertyKey => 'next'
  ],
  [
    'StringIterator.prototype',
    (): unknown => Object.getPrototypeOf(SOME_STRING[Symbol.iterator]()),
    (): PropertyKey => 'next'
  ],
  [
    'IteratorPrototype',
    (): unknown => Object.getPrototypeOf(Object.getPrototypeOf(SOME_ARRAY[Symbol.iterator]())),
    (): PropertyKey => Symbol.iterator
  ]
]

/**
 * Record a method of an iterator prototype (`next`, or the `Symbol.iterator` the iterators inherit), or count it
 * as unrecorded when the prototype cannot be found.
 *
 * @param into - The list being built.
 * @param name - The name of the iterator prototype.
 * @param find - Finds the prototype.
 * @param keyOf - Finds the method to record.
 */
function recordIterator(
  into: Baseline[],
  name: string,
  find: () => unknown,
  keyOf: () => PropertyKey
): void {
  try {
    const owner = find()
    const key = keyOf()
    if (typeof owner === 'object' && owner !== null)
      record(into, `${name}.${String(key)}`, owner, key)
    else unrecorded += 1
  } catch {
    unrecorded += 1
  }
}

/**
 * Build the list with index loops and a guard around each step, so that a built-in replaced before the
 * module loads cannot make loading throw: whatever cannot be recorded is counted as unrecorded.
 *
 * @returns The built-ins recorded.
 */
function buildBaseline(): Baseline[] {
  const into: Baseline[] = []
  for (let group = 0; group < OWNER_GROUPS.length; group += 1) {
    try {
      // By index: destructuring would ask the Array iterator, which one of the entries is about.
      const found = (OWNER_GROUPS[group] as () => Group)()
      const keys = found[2]
      for (let key = 0; key < keys.length; key += 1) {
        record(into, `${found[0]}.${String(keys[key])}`, found[1], keys[key] as PropertyKey)
      }
    } catch {
      unrecorded += 1
    }
  }
  for (let at = 0; at < ITERATORS.length; at += 1) {
    const iterator = ITERATORS[at] as readonly [string, () => unknown, () => PropertyKey]
    recordIterator(into, iterator[0], iterator[1], iterator[2])
  }
  return into
}

/** Every built-in the library calls, as it was when the module loaded. */
export const BASELINE: ReadonlyArray<Baseline> = buildBaseline()

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
  return (
    fieldOf(now, 'value') === fieldOf(then, 'value') &&
    fieldOf(now, 'get') === fieldOf(then, 'get') &&
    fieldOf(now, 'set') === fieldOf(then, 'set')
  )
}

/**
 * Whether a built-in is what it was when the module loaded: the same descriptor, and for an accessor the
 * same value behind the same getter, since a replaced global can change what its getter answers without
 * changing the getter.
 *
 * @param owner - Where the built-in lives.
 * @param now - The descriptor of the property now.
 * @param entry - What was recorded at load: the descriptor and what an accessor answered.
 * @returns True when nothing a caller could observe differs.
 */
export function unchanged(
  owner: object,
  now: PropertyDescriptor | undefined,
  entry: { readonly original: PropertyDescriptor | undefined; readonly resolved: unknown }
): boolean {
  if (!sameDescriptor(now, entry.original)) return false
  const getter = now === undefined ? undefined : fieldOf(now, 'get')
  return (
    getter === undefined || apply(getter as () => unknown, owner, NO_ARGUMENTS) === entry.resolved
  )
}

/**
 * Count the built-ins that are no longer what they were when the module loaded, and those that could not
 * be recorded then. One that cannot be read now counts as replaced.
 *
 * @returns How many differ or were never recorded.
 */
export function replacedBuiltins(): number {
  // By index: a `for...of` would ask the Array iterator, which is one of the built-ins being checked.
  let replaced = unrecorded
  for (let at = 0; at < BASELINE.length; at += 1) {
    const entry = BASELINE[at] as Baseline
    try {
      if (!unchanged(entry.owner, getOwnPropertyDescriptor(entry.owner, entry.key), entry))
        replaced += 1
    } catch {
      replaced += 1
    }
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
  throw runtimeRefusal(replaced)
}
