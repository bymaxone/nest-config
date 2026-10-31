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
 * Narrow an unknown value to a freezable object (non-null, `typeof object`).
 *
 * @param value - The value to test.
 * @returns True when the value is a non-null object or array.
 */
function isFreezable(value: unknown): value is Record<string, unknown> {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent — these mutants make the guard admit more inputs (primitives and `null`), but `deepFreeze` guards with `!isFreezable(value) || Object.isFrozen(value)`, and `Object.isFrozen` is `true` for every input they newly admit. The same early `return value` is reached, nothing is frozen or recursed differently, and the returned reference is unchanged.
  return typeof value === 'object' && value !== null
}

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
 * a `Map` or `Set` are not own enumerable properties, so they are not visited. Replacing
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
  if (!isFreezable(value) || Object.isFrozen(value)) {
    return value as Readonly<T>
  }

  // Freeze before recursing so a cycle hits the already-frozen guard above.
  Object.freeze(value)
  for (const nested of Object.values(value)) {
    deepFreeze(nested)
  }

  return value as Readonly<T>
}
