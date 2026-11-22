/**
 * Unit tests for the property descriptors the library defines, with names planted on the root prototype, and
 * for the structural read with the built-ins it walks with replaced.
 *
 * Layer: unit.
 * Goal: prove that a `get`, `set` or `value` planted on `Object.prototype` is not read from the descriptors the
 * library passes to `Object.defineProperty`, so the error keeps its code and its issues, a cause is attached as
 * given, and the configuration keeps its serializers; and that a source from another realm whose root prototype
 * is planted is still refused when `Object.hasOwn` and `Object.getPrototypeOf` are replaced after the import.
 * Mocks: none. The names and the built-ins are replaced for the case and put back afterwards.
 */

import { runInNewContext } from 'node:vm'

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { withCause } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import { readOption } from './option-read'

const issue = {
  path: 'app.name',
  variable: 'APP_NAME',
  code: ConfigErrorCode.MISSING,
  message: 'm'
}

/** Runs `run` with `key` planted on the root prototype as `value`, and removes it afterwards. */
function planted<T>(key: string, value: unknown, run: () => T): T {
  Object.defineProperty(Object.prototype, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: false
  })
  try {
    return run()
  } finally {
    Reflect.deleteProperty(Object.prototype, key)
  }
}

const PLANTED = ['get', 'set', 'value', 'enumerable', 'writable', 'configurable'] as const

describe('the descriptors of the error, with a name planted on the root prototype', () => {
  it.each(PLANTED)('keeps the code, the issues and the name when %s is planted', (key) => {
    const planting = key === 'get' || key === 'set' ? () => 1 : key === 'value' ? 'x' : true

    const error = planted(key, planting, () => new BymaxConfigValidationError([issue]))

    expect(error.code).toBe(ConfigErrorCode.VALIDATION)
    expect(error.issues).toHaveLength(1)
    expect(error.name).toBe('BymaxConfigValidationError')
    expect(Object.isFrozen(error.issues)).toBe(true)
    expect(Object.getOwnPropertyDescriptor(error, 'code')?.writable).toBe(false)
  })

  it.each(PLANTED)('attaches the cause as given when %s is planted', (key) => {
    const planting = key === 'get' || key === 'set' ? () => 1 : key === 'value' ? 'x' : true

    const error = planted(key, planting, () => withCause(new Error('e'), 'the cause'))

    expect(error.cause).toBe('the cause')
    expect(Object.getOwnPropertyDescriptor(error, 'cause')?.enumerable).toBe(false)
  })
})

describe('the serializers of the configuration, with a name planted on the root prototype', () => {
  const schema = defineEnv({ app: z.object({ name: z.string().default('n') }) })

  it('are defined as given when a value is planted', () => {
    const planting = 'x'

    const config = planted('value', planting, () => createValidatedConfig({ schema, source: {} }))

    expect(JSON.parse(JSON.stringify(config))).toEqual({
      service: 'BymaxConfig',
      namespaces: ['app']
    })
  })
})

describe('an option from another realm whose root prototype is planted, with the built-ins replaced', () => {
  it('is still not read when Object.hasOwn, Object.getPrototypeOf and Reflect.get are replaced after the import', () => {
    const options = runInNewContext(
      `Object.defineProperty(Object.prototype, 'strict', { value: true, configurable: true, writable: true });
       ({})`
    ) as object
    const originals = [Object.hasOwn, Object.getPrototypeOf, Reflect.get]
    const replace = (owner: object, key: string, value: unknown): void => {
      Object.defineProperty(owner, key, { value, configurable: true, writable: true })
    }
    replace(Object, 'hasOwn', () => false)
    replace(Object, 'getPrototypeOf', () => null)
    replace(Reflect, 'get', () => 'wrong')
    const answers: unknown[] = []
    try {
      answers.push(readOption(options, 'strict'))
      answers.push(readOption(runInNewContext('({ strict: true })') as object, 'strict'))
    } finally {
      replace(Object, 'hasOwn', originals[0])
      replace(Object, 'getPrototypeOf', originals[1])
      replace(Reflect, 'get', originals[2])
    }

    expect(answers).toEqual([undefined, true])
  })
})
