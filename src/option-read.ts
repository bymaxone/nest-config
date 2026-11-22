/**
 * @fileoverview Reads an option of a registration argument without following the realm's root prototype.
 * An option name planted on `Object.prototype` is not the host's option, so it is not read; an option held
 * as an own property, as a field or accessor of a class instance, or on a prototype the host built is.
 * @layer Utility
 */

/**
 * Whether an object is the realm's root prototype: the one whose own `constructor.prototype` is itself and
 * whose own prototype is null.
 *
 * @param candidate - An object on the prototype chain of an options argument.
 * @returns True for the root prototype of a realm.
 */
function isRealmRoot(candidate: object): boolean {
  if (Object.getPrototypeOf(candidate) !== null) return false
  const constructorOwn = Object.getOwnPropertyDescriptor(candidate, 'constructor')
  const held = constructorOwn?.value as { prototype?: unknown } | undefined
  return typeof held === 'function' && Reflect.get(held, 'prototype') === candidate
}

/**
 * Whether the realm's root prototype is what supplies a name: the chain reaches the root before any other
 * object holds the name, and the root holds it.
 *
 * @param options - The options argument.
 * @param key - The option name.
 * @returns True when the name would come from the root prototype alone.
 */
function comesFromRoot(options: object, key: string): boolean {
  for (let link: object | null = options; link !== null; link = Object.getPrototypeOf(link)) {
    if (isRealmRoot(link)) return Object.hasOwn(link, key)
    if (Object.hasOwn(link, key)) return false
  }
  return false
}

/**
 * Read an option by name, as `options[key]` would, except that a name the realm's root prototype alone
 * supplies reads as undefined.
 *
 * @param options - The options argument, known to be an object.
 * @param key - The option name.
 * @returns The value of the option, or undefined when it is not the host's.
 */
export function readOption(options: object, key: string): unknown {
  return comesFromRoot(options, key) ? undefined : Reflect.get(options, key)
}

/**
 * Whether the options argument has the name, as `key in options` would, except that a name the realm's
 * root prototype alone supplies is not there.
 *
 * @param options - The options argument, known to be an object.
 * @param key - The option name.
 * @returns True when the host's options have the name.
 */
export function hasOption(options: object, key: string): boolean {
  return key in options && !comesFromRoot(options, key)
}
