/**
 * @fileoverview Recursive `Object.freeze` utility that makes the validated
 * configuration immutable by construction. Nested plain objects and arrays are frozen
 * depth-first; primitives and null pass through untouched. A `Date`, a `Map` and a `Set`
 * are frozen as objects but keep working mutators (see {@link deepFreeze}). Nodes are frozen
 * before their children are visited, so self-referencing structures terminate
 * on the already-frozen check instead of recursing forever.
 * @layer Utility
 */

/**
 * Deep-freeze a value through every nested level at runtime.
 *
 * Freezes the value and every nested object and array reachable through its own
 * enumerable properties. Primitives, null, and already-frozen nodes are returned
 * unchanged, which also makes the function idempotent and cycle-safe. Under
 * strict mode, later writes to the returned structure throw.
 *
 * What it does not do: a `Date`, a `Map` or a `Set` keeps its mutators, because the state
 * they change lives in internal slots that `Object.freeze` cannot reach, and the entries of
 * a `Map` or `Set` are not own enumerable properties, so they are not visited.
 * A typed array, a `Buffer` or a `DataView` is left as it is: `Object.freeze` throws on a view
 * with elements (`Cannot freeze array buffer views with elements`), and a decoded key is a
 * common leaf, so its elements stay writable. Replacing
 * those values with a read-only wrapper was measured and rejected: a `Proxy` around a
 * `Date` that refuses `setX` fails `util.types.isDate`, reports `[object Object]` to
 * `Object.prototype.toString`, cannot be passed to `structuredClone`, and does not satisfy
 * `assert.deepStrictEqual` against a real `Date`, which is how test runners compare them.
 *
 * @typeParam T - The type of the value being frozen.
 * @param value - The value to deep-freeze.
 * @returns The same reference, deeply frozen at runtime; the compile-time type
 * is `Readonly<T>`, which is shallow at the type level.
 * @example
 * ```typescript
 * const config = deepFreeze({ server: { port: 3000 } });
 * config.server.port = 4000; // throws TypeError in strict mode
 * ```
 */
export function deepFreeze<T>(value: T): Readonly<T> {
  // `Object.isFrozen` answers true for null and every primitive, so only an object, an array or a function
  // that is neither frozen nor a view gets past this guard; a function is not an object by `typeof` and is
  // returned as it is.
  if (typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) {
    return value as Readonly<T>
  }

  // Freeze before recursing so a cycle hits the already-frozen guard above.
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }

  return value as Readonly<T>
}
