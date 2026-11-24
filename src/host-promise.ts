/**
 * @fileoverview The one step that makes an `await` of what the host produced take its value as it is.
 * @layer Utility
 */

import { types } from 'node:util'

import { boxed, followed, tagged } from './captured'

const isPromise = types.isPromise

/**
 * Await what the host's code produced and hand its value back in a box. A native promise is followed through
 * a new promise that reads no `then` from it, so accessors the host planted on `Promise.prototype` inside its
 * own call cannot answer for it, whether or not the promise can take a property. Anything else is awaited as
 * it is.
 *
 * @param value - What the host's code returned.
 * @returns The settled value, in a box with no `then`, in a promise that is tagged for the caller's `await`.
 */
export function awaitHost<T>(value: T | PromiseLike<T>): Promise<{ readonly value: T }> {
  return tagged(settle(value))
}

/**
 * The settling step of {@link awaitHost}, whose promise the caller tags before awaiting it.
 *
 * @param value - What the host's code returned.
 * @returns The settled value, in a box with no `then`.
 */
async function settle<T>(value: T | PromiseLike<T>): Promise<{ readonly value: T }> {
  if (isPromise(value)) return await followed(value as Promise<T>)
  return boxed(await value)
}
