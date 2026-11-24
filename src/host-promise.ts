/**
 * @fileoverview The one step that makes an `await` of what the host produced take its value as it is.
 * @layer Utility
 */

import { types } from 'node:util'

import {
  adopted,
  boxed,
  callableThen,
  followed,
  inheritsThenAccessor,
  ownsThenAccessor,
  tagged
} from './captured'

const isPromise = types.isPromise
const isProxy = types.isProxy
const reflectGet = Reflect.get

/**
 * Await what the host's code produced and hand its value back in a box. A native promise is followed through
 * a new promise that reads no `then` from it, so accessors the host planted on `Promise.prototype` inside its
 * own call do not answer for it when the promise can take a property; a promise that cannot is followed, which has the
 * limit {@link followed} states. A thenable with a data `then` is
 * followed into a promise of the library's own, and what it resolves with is settled the same way; any other value is returned as it is, never awaited, except that
 * a Proxy, an own accessor `then` or one on a prototype below `Object.prototype` that yields a function is refused.
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
  // A value that is not a promise is resolved through the `then` on its chain, which host code can have planted
  // during its own call. Only a data `then` is followed, by descriptor and into a promise this library built;
  // anything else is the value itself and is never awaited.
  const then = callableThen(value)
  if (then === undefined) {
    // A Proxy, or an object with an accessor `then` of its own or on a class prototype, answers to the host: the read is made once and
    // a failure of it is the host's, while a function it hands back is refused rather than followed.
    if (
      (isProxy(value) || ownsThenAccessor(value) || inheritsThenAccessor(value)) &&
      typeof reflectGet(value as object, 'then') === 'function'
    ) {
      throw new TypeError(
        'the value returned by host code answers with a then that is not a data property'
      )
    }
    return boxed(value as T)
  }
  // What a thenable resolves with is settled again by this same step, as resolving a promise with it would,
  // so a promise or another thenable inside the box is awaited by the guarded path and never handed on.
  const answered = await adopted<unknown>(value, then)
  return await settle(answered.value as T | PromiseLike<T>)
}
