/**
 * @fileoverview Recursive `Object.freeze` utility that makes the validated
 * configuration immutable by construction. Nested objects and arrays are frozen
 * depth-first; primitives and null pass through untouched. Nodes are frozen
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
  return typeof value === 'object' && value !== null
}

/**
 * Deep-freeze a value, returning it as deeply readonly.
 *
 * Freezes the value and every nested object and array reachable through its own
 * enumerable properties. Primitives, null, and already-frozen nodes are returned
 * unchanged, which also makes the function idempotent and cycle-safe. Under
 * strict mode, later writes to the returned structure throw.
 *
 * @typeParam T - The type of the value being frozen.
 * @param value - The value to deep-freeze.
 * @returns The same reference, typed as deeply immutable.
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
