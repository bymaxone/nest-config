/**
 * @fileoverview The one step that makes an `await` of a promise the host produced take that promise as it is.
 * @layer Utility
 */

import { types } from 'node:util'

import { tagged } from './captured'

const isPromise = types.isPromise

/**
 * A native promise the host produced, with its `constructor` pinned to the intrinsic `Promise` before the
 * library awaits it. An `await` reads `constructor` of a native promise and, when it is not the intrinsic,
 * reads `then`; accessors the host planted on `Promise.prototype` inside its own call, which put the
 * native property back on their first read, would answer for the promise. With the own property in place
 * the `await` takes the promise as it is. Anything else is returned as it is, and a frozen promise cannot
 * be pinned, so it is awaited as it is.
 *
 * @param value - What the host's code returned.
 * @returns The same value.
 */
export function pinHostPromise<T>(value: T): T {
  if (isPromise(value)) tagged(value)
  return value
}
