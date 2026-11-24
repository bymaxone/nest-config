/**
 * @fileoverview The built-ins that decide something inside a validation, taken when the module loads and
 * called through `Reflect.apply`. Host code runs during a validation (a getter on the source, a rule of
 * the schema), so a replacement it installs after the entry check would otherwise be followed by a
 * strict-mode decision, an issue lookup or the report layout. A call through these helpers does not
 * consult the prototype at call time. The module imports nothing, so every other layer can use it.
 * @layer Utility
 */

const apply = Reflect.apply
const defineProperty = Reflect.defineProperty
const create = Object.create
const ownDescriptorOf = Object.getOwnPropertyDescriptor
const prototypeOf = Object.getPrototypeOf
const hasOwnOf = Object.hasOwn
const PromiseIntrinsic = Promise
const thenOf = Promise.prototype.then

// The pin value of `tagged` has to be the engine's own `Promise`, since an `await` compares a promise's
// `constructor` with it. The promise an async function returns inherits its `constructor` from the intrinsic
// prototype whatever the global `Promise` was replaced with, so a global that is not that constructor is a
// stand-in, and the import fails here, naming the cause, instead of pinning a promise to it. The read goes
// through the promise and not through `Object.getPrototypeOf`, which a host may have replaced and which the
// import has to survive.
if ((async (): Promise<void> => {})().constructor !== PromiseIntrinsic) {
  throw new TypeError(
    'Promise was replaced before the import: it is not the constructor of the promises of the engine'
  )
}
const startsWithOf = String.prototype.startsWith
const padStartOf = String.prototype.padStart
const padEndOf = String.prototype.padEnd
const includesOf = Array.prototype.includes
const someOf = Array.prototype.some
const sortOf = Array.prototype.sort
const setAddOf = Set.prototype.add
const setHasOf = Set.prototype.has
const mapSetOf = Map.prototype.set
const mapGetOf = Map.prototype.get
const mapHasOf = Map.prototype.has
const mapKeysOf = Map.prototype.keys
/** Stands in for the iterator step when `Map.prototype.keys` was already replaced before this module loaded. */
function mapIteratorUnavailable(): never {
  throw new TypeError(
    'Map iterator is unavailable: Map.prototype.keys was replaced before the import'
  )
}

// Read from an iterator itself, not through `Object.getPrototypeOf`, so a replaced `getPrototypeOf` at load
// cannot stop the import. A `keys` replaced before the import is the baseline, so no entry check can see it;
// the import must not throw over it, and a step that throws on first use keeps the cases that throw closed.
const mapIteratorNextOf = ((): (() => IteratorResult<unknown>) => {
  try {
    return (new Map<string, string>().keys() as { next: () => IteratorResult<unknown> }).next
  } catch {
    return mapIteratorUnavailable
  }
})()
const weakSetAddOf = WeakSet.prototype.add
const weakSetHasOf = WeakSet.prototype.has

/** `Math.max` as it was when the module loaded. */
export const max = Math.max

/** `Math.min` as it was when the module loaded. */
export const min = Math.min

/**
 * Whether the text starts with the prefix, as `String.prototype.startsWith` answers.
 *
 * @param text - The text.
 * @param prefix - The prefix.
 * @returns True when the text starts with the prefix.
 */
export function startsWith(text: string, prefix: string): boolean {
  return apply(startsWithOf, text, [prefix]) as boolean
}

/**
 * Pad the text at its start, as `String.prototype.padStart` does.
 *
 * @param text - The text.
 * @param length - The length to reach.
 * @param filler - The padding.
 * @returns The padded text.
 */
export function padStart(text: string, length: number, filler: string): string {
  return apply(padStartOf, text, [length, filler]) as string
}

/**
 * Pad the text at its end, as `String.prototype.padEnd` does.
 *
 * @param text - The text.
 * @param length - The length to reach.
 * @returns The padded text.
 */
export function padEnd(text: string, length: number): string {
  return apply(padEndOf, text, [length]) as string
}

/**
 * Whether the list holds the item, as `Array.prototype.includes` answers.
 *
 * @param list - The list.
 * @param item - The item.
 * @returns True when the list holds the item.
 */
export function includes<TItem>(list: readonly TItem[], item: TItem): boolean {
  return apply(includesOf, list, [item]) as boolean
}

/**
 * Whether some item passes the test, as `Array.prototype.some` answers.
 *
 * @param list - The list.
 * @param test - The test.
 * @returns True when an item passes.
 */
export function some<TItem>(list: readonly TItem[], test: (item: TItem) => boolean): boolean {
  return apply(someOf, list, [test]) as boolean
}

/**
 * Sort the list in place, as `Array.prototype.sort` does.
 *
 * @param list - The list.
 * @param compare - The comparator.
 * @returns The same list, sorted.
 */
export function sortInPlace<TItem>(
  list: TItem[],
  compare: (left: TItem, right: TItem) => number
): TItem[] {
  return apply(sortOf, list, [compare]) as TItem[]
}

/**
 * Build a set holding the items, without the set constructor, which calls the `add` of the prototype.
 *
 * @param items - The items, read by index.
 * @returns A set holding the items.
 */
export function setOf<TItem>(items: readonly TItem[]): Set<TItem> {
  const set = new Set<TItem>()
  for (let at = 0; at < items.length; at += 1) apply(setAddOf, set, [items[at]])
  return set
}

/**
 * Whether the set holds the item.
 *
 * @param set - The set.
 * @param item - The item.
 * @returns True when the set holds it.
 */
export function setHas<TItem>(set: ReadonlySet<TItem>, item: TItem): boolean {
  return apply(setHasOf, set, [item]) as boolean
}

/**
 * Add the item to the set.
 *
 * @param set - The set.
 * @param item - The item.
 */
export function setAdd<TItem>(set: Set<TItem>, item: TItem): void {
  apply(setAddOf, set, [item])
}

/**
 * Build a map holding the entries, without the map constructor, which calls the `set` of the prototype.
 *
 * @param entries - The key and value pairs, read by index.
 * @returns A map holding the entries.
 */
export function mapOf<TKey, TValue>(
  entries: ReadonlyArray<readonly [TKey, TValue]>
): Map<TKey, TValue> {
  const map = new Map<TKey, TValue>()
  for (let at = 0; at < entries.length; at += 1) {
    const entry = entries[at] as readonly [TKey, TValue]
    apply(mapSetOf, map, [entry[0], entry[1]])
  }
  return map
}

/**
 * Store the value under the key.
 *
 * @param map - The map.
 * @param key - The key.
 * @param value - The value.
 */
export function mapSet<TKey, TValue>(map: Map<TKey, TValue>, key: TKey, value: TValue): void {
  apply(mapSetOf, map, [key, value])
}

/**
 * The value stored under the key.
 *
 * @param map - The map.
 * @param key - The key.
 * @returns The value, or undefined.
 */
export function mapGet<TKey, TValue>(
  map: ReadonlyMap<TKey, TValue>,
  key: TKey
): TValue | undefined {
  return apply(mapGetOf, map, [key]) as TValue | undefined
}

/**
 * Whether the map holds the key.
 *
 * @param map - The map.
 * @param key - The key.
 * @returns True when the map holds it.
 */
export function mapHas<TKey, TValue>(map: ReadonlyMap<TKey, TValue>, key: TKey): boolean {
  return apply(mapHasOf, map, [key]) as boolean
}

/**
 * Remember the object in the weak set.
 *
 * @param set - The weak set.
 * @param item - The object.
 */
export function weakSetAdd(set: WeakSet<object>, item: object): void {
  apply(weakSetAddOf, set, [item])
}

/**
 * Whether the weak set holds the value.
 *
 * @param set - The weak set.
 * @param item - Any value; a non-object is not held.
 * @returns True when the set holds it.
 */
export function weakSetHas(set: WeakSet<object>, item: unknown): boolean {
  return apply(weakSetHasOf, set, [item]) as boolean
}

/**
 * The keys of a map, in insertion order, read without the live `keys` or iterator `next`.
 *
 * @param map - The map.
 * @returns A new array of the keys.
 */
export function mapKeys<TKey, TValue>(map: ReadonlyMap<TKey, TValue>): TKey[] {
  const iterator = apply(mapKeysOf, map, []) as object
  const keys: TKey[] = []
  for (;;) {
    const step = apply(mapIteratorNextOf, iterator, []) as IteratorResult<TKey>
    if (step.done === true) return keys
    append(keys, step.value)
  }
}

/**
 * Join lists by index, so the result does not depend on the live array iterator or on `push`.
 *
 * @param lists - The lists, in order.
 * @returns One new list holding every item of every list.
 */
export function concatenated<T>(lists: ReadonlyArray<readonly T[]>): T[] {
  const all: T[] = []
  for (let at = 0; at < lists.length; at += 1) {
    const list = lists[at] as readonly T[]
    for (let inner = 0; inner < list.length; inner += 1) append(all, list[inner] as T)
  }
  return all
}

/**
 * A set of what `pick` returns for each item, built by index with the `add` taken at load.
 *
 * @param items - The items.
 * @param pick - What to put in the set for an item.
 * @returns The new set.
 */
export function setOfBy<TItem, TValue>(
  items: readonly TItem[],
  pick: (item: TItem) => TValue
): Set<TValue> {
  const set = setOf<TValue>([])
  for (let at = 0; at < items.length; at += 1) setAdd(set, pick(items[at] as TItem))
  return set
}

/**
 * Wrap a value in a box with no prototype, built from the captured `Object.create`, so that resolving a
 * promise with the box finds no `then` to call, whatever host code planted on `Object.prototype`.
 *
 * @param value - The value to hold.
 * @returns A null-prototype object whose own `value` is the given value.
 */
export function boxed<T>(value: T): { readonly value: T } {
  const box = create(null) as { value: T }
  box.value = value
  return box
}

/**
 * Add an item at the end of an array as an own element, even where an index setter is inherited.
 *
 * An assignment to a new index reaches a setter planted on `Array.prototype`, and `push` is replaceable;
 * defining the element reaches neither.
 *
 * @param list - The array to grow.
 * @param item - The item to add.
 */
export function append<T>(list: T[], item: T): void {
  const descriptor = create(null) as PropertyDescriptor
  descriptor.value = item
  descriptor.writable = true
  descriptor.enumerable = true
  descriptor.configurable = true
  defineProperty(list, list.length, descriptor)
}

/**
 * Give a promise an own `constructor` equal to the intrinsic `Promise` taken at load.
 *
 * An `await` of a native promise reads its `constructor`, and when that is not `Promise` it resolves a new
 * promise with this one and calls the `then` it finds. Both are looked up after the library's last check, so
 * host code that replaced them inside the window would otherwise answer for a promise this library returns.
 * With the own property in place the `await` takes the promise as it is and never reads `then`. The pin is
 * neither writable nor configurable, so nothing can replace it afterwards. A frozen promise answers `false`
 * to the definition and is awaited as it is; `followed` is the one for a promise this library did not make.
 *
 * @param promise - A promise the library hands to a caller that awaits it.
 * @returns The same promise, tagged where the property could be defined.
 */
export function tagged<T>(promise: Promise<T>): Promise<T> {
  defineProperty(promise, 'constructor', pin(PromiseIntrinsic))
  return promise
}

/**
 * Settle a pinned promise with its value in a box, by a native `await`: the pinned `constructor` is the
 * intrinsic one, so that `await` reads neither `Symbol.species` nor a `then`.
 *
 * @param promise - A native promise whose `constructor` is pinned.
 * @returns The fulfilment value, in a box with no `then`.
 */
async function boxedAwait<T>(promise: Promise<T>): Promise<{ readonly value: T }> {
  return boxed(await promise)
}

/**
 * Whether `value` is an object or a function, the only kinds that can own a property.
 *
 * @param value - What the host returned.
 * @returns True for a non-null object or a function.
 */
function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

/**
 * The `then` that resolving a promise with `value` would call, found by descriptor along the prototype chain
 * so that no getter runs: only a data property that holds a function counts. A getter on the chain, such as
 * one a host planted on `Object.prototype` to answer once, is not a `then` this library follows.
 *
 * @param value - What the host returned.
 * @returns The function a data property named `then` holds, or undefined when the value is not a thenable.
 */
export function callableThen(value: unknown): ((...args: unknown[]) => unknown) | undefined {
  if (!isObjectLike(value)) return undefined
  let holder: object | null = value
  while (holder !== null) {
    const found = ownDescriptorOf(holder, 'then')
    if (found !== undefined) {
      return hasOwnOf(found, 'value') && typeof found.value === 'function' ? found.value : undefined
    }
    holder = prototypeOf(holder) as object | null
  }
  return undefined
}

/**
 * Whether `value` carries an accessor named `then` of its own, which only host code can have put there.
 *
 * @param value - What the host returned.
 * @returns True when the value owns a `then` that is a getter or a setter.
 */
export function ownsThenAccessor(value: unknown): boolean {
  if (!isObjectLike(value)) return false
  const found = ownDescriptorOf(value, 'then')
  return found !== undefined && !hasOwnOf(found, 'value')
}

/**
 * Follow a thenable the host returned into a promise this library built, calling the `then` found by
 * {@link callableThen}, and hand back what it settles with in a box.
 *
 * @param value - The thenable.
 * @param then - Its `then`, as {@link callableThen} found it.
 * @returns A tagged promise of the box, rejected with the reason the thenable rejects with.
 */
export function adopted<T>(
  value: unknown,
  then: (...args: unknown[]) => unknown
): Promise<{ readonly value: T }> {
  return tagged(
    new PromiseIntrinsic<{ readonly value: T }>((resolve, reject) => {
      apply(then, value, [(settled: T): void => resolve(boxed(settled)), reject])
    })
  )
}

/**
 * Take what a promise the host produced settles with, in a box, so the value is read once and never for a
 * `then`.
 *
 * A promise that takes the pin is awaited natively, which reads neither `Symbol.species` nor a `then`. One
 * that cannot take it, being frozen or not extensible, is followed through a new promise that subscribes with
 * the `then` taken at load, called with `Reflect.apply`: that call reads the species constructor, so a
 * species getter the host planted can reject the follower, and the host's own rejection then has no handler.
 * Both results are tagged like any other promise the library hands to an `await`.
 *
 * @param promise - A native promise returned by host code.
 * @returns A promise of the fulfilment value in a box, rejected with the reason `promise` rejects with.
 */
export function followed<T>(promise: Promise<T>): Promise<{ readonly value: T }> {
  if (defineProperty(promise, 'constructor', pin(PromiseIntrinsic))) {
    return tagged(boxedAwait(promise))
  }
  return tagged(
    new PromiseIntrinsic<{ readonly value: T }>((resolve, reject) => {
      apply(thenOf, promise, [(value: T): void => resolve(boxed(value)), reject])
    })
  )
}

/**
 * A descriptor that holds a value for good: not writable, not enumerable, not configurable.
 *
 * @param value - The value to hold.
 * @returns A null-prototype descriptor.
 */
export function pin(value: unknown): PropertyDescriptor {
  const descriptor = create(null) as PropertyDescriptor
  descriptor.value = value
  descriptor.writable = false
  descriptor.enumerable = false
  descriptor.configurable = false
  return descriptor
}
