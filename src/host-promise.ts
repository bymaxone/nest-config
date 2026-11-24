/**
 * @fileoverview The one step that makes an `await` of a promise the host produced take that promise as it is.
 * @layer Utility
 */

import { types } from 'node:util'

import { adopted } from './captured'

const isPromise = types.isPromise

/**
 * A native promise the host produced, made safe to await. An `await` reads `constructor` of a native promise
 * and, when it is not the intrinsic, reads `then`; accessors the host planted on `Promise.prototype` inside its
 * own call, which put the native property back on their first read, would answer for the promise. With the
 * own `constructor` in place the `await` takes the promise as it is, and a promise that cannot take one
 * because it is frozen is followed through a new promise instead. Anything else is returned as it is.
 *
 * @param value - What the host's code returned.
 * @returns The same value, or a promise that settles with what a frozen native promise settles with.
 */
export function pinHostPromise<T>(value: T): T {
  return isPromise(value) ? (adopted(value) as T) : value
}
