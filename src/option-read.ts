/**
 * @fileoverview Reads an option of a registration argument without following the root prototype of a realm.
 * An option name planted on `Object.prototype` is not the host's option, so it is not read; an option held
 * as an own property, as a field or accessor of a class instance, or on a prototype that has a prototype of
 * its own is.
 * @layer Utility
 */

/** The built-ins the reader walks with, taken when the module loads so a later replacement is not followed. */
const hasOwn = Object.hasOwn
const getPrototypeOf = Object.getPrototypeOf
const reflectGet = Reflect.get

/**
 * Copy the entries into an object with no prototype, so that what Nest reads from it by name answers for
 * the keys it holds and never for a name that a prototype of the realm supplies. The objects Nest builds
 * itself, inside its builder, are not covered.
 *
 * @typeParam TValues - The shape of the values.
 * @param values - The entries to hold.
 * @returns An object with no prototype holding the entries.
 */
export function bare<TValues extends object>(values: TValues): TValues {
  return Object.assign(Object.create(null) as TValues, values)
}

/**
 * Whether the first object on the chain that holds the name is a parent with no prototype of its own and
 * not the options argument itself. That is where a name planted on the root prototype of any realm sits,
 * and it is found without reading a property of the root, so overwriting `Object.prototype.constructor`
 * does not bring a planted name back. The cost is that a name held only by a parent the host built with
 * `Object.create(null)` is not read either.
 *
 * @param options - The options argument.
 * @param key - The option name.
 * @returns True when the name would come from a parent with no prototype.
 */
function comesFromBareParent(options: object, key: string): boolean {
  for (
    let link: object | null = options;
    link !== null;
    link = getPrototypeOf(link) as object | null
  ) {
    if (hasOwn(link, key)) return link !== options && getPrototypeOf(link) === null
  }
  return false
}

/**
 * Read an option by name, as `options[key]` would, except that a name only a parent with no prototype
 * supplies reads as undefined.
 *
 * @param options - The options argument, known to be an object.
 * @param key - The option name.
 * @returns The value of the option, or undefined when it is not the host's.
 */
export function readOption(options: object, key: string): unknown {
  return comesFromBareParent(options, key) ? undefined : reflectGet(options, key)
}

/**
 * Whether the options argument has the name, as `key in options` would, except that a name only a parent with no
 * prototype supplies is not there.
 *
 * @param options - The options argument, known to be an object.
 * @param key - The option name.
 * @returns True when the host's options have the name.
 */
export function hasOption(options: object, key: string): boolean {
  return key in options && !comesFromBareParent(options, key)
}
