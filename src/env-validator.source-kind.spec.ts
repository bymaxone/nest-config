/**
 * Unit tests for the check that a source is an object of variables, with the root prototype carrying a tag.
 *
 * Layer: unit.
 * Goal: prove that a `Symbol.toStringTag` planted on `Object.prototype` does not make a plain source a
 * refused kind, and that the kinds that are no record of variables are still refused.
 * Mocks: none. The tag is planted for the case and removed afterwards.
 */

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError } from './errors'

const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

describe('a source with a tag planted on the root prototype', () => {
  it('is still a record of variables', () => {
    Object.defineProperty(Object.prototype, Symbol.toStringTag, {
      value: 'Planted',
      configurable: true,
      writable: true
    })
    try {
      expect(createValidatedConfig({ schema, source: { APP_NAME: 'real' } }).app.name).toBe('real')
    } finally {
      Reflect.deleteProperty(Object.prototype, Symbol.toStringTag)
    }
  })

  it.each([
    ['a Map', new Map()],
    ['a Set', new Set()],
    ['a WeakMap', new WeakMap()],
    ['a Date', new Date()],
    ['a RegExp', /x/u],
    ['a typed array', new Uint8Array(1)],
    ['an ArrayBuffer', new ArrayBuffer(1)],
    ['a DataView', new DataView(new ArrayBuffer(1))],
    ['a Promise', Promise.resolve()],
    ['an Error', new Error('x')],
    ['a boxed string', Object(' ')],
    ['a URLSearchParams', new URLSearchParams('APP_NAME=real')],
    ['a URL', new URL('https://example.com')],
    ['a WeakRef', new WeakRef({})],
    ['Math', Math],
    ['JSON', JSON],
    [
      'a class instance with a tag',
      new (class Tagged {
        public get [Symbol.toStringTag](): string {
          return 'Tagged'
        }
      })()
    ]
  ])('still refuses %s', (_name, source) => {
    expect(() => createValidatedConfig({ schema, source: source as never })).toThrow(
      BymaxConfigValidationError
    )
  })

  it('refuses an arguments object', () => {
    const args = (function (..._rest: unknown[]) {
      return arguments
    })('x')

    expect(() => createValidatedConfig({ schema, source: args as never })).toThrow(
      BymaxConfigValidationError
    )
  })
})
