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
