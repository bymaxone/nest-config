/**
 * Unit tests for the descriptors the library reads from objects the host can influence.
 *
 * Layer: unit.
 * Goal: prove that a descriptor is read through its own fields only. A descriptor is an ordinary
 * object, so a `get` or `value` planted on `Object.prototype` is otherwise answered for an accessor
 * or a data property that has no such field of its own.
 * Mocks: none. The plant is a property defined on `Object.prototype` and removed afterwards.
 */

import { z } from 'zod'

import { createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { defineEnv } from './define-env'

/** An accessor descriptor that names neither a getter nor a setter, built without a prototype. */
const EMPTY_ACCESSOR: PropertyDescriptor = Object.assign(Object.create(null), {
  get: undefined,
  set: undefined,
  configurable: true
})

/** Defines `name` on `Object.prototype` and returns the function that removes it. */
function plant(name: string, value: unknown): () => void {
  Reflect.defineProperty(Object.prototype, name, { value, configurable: true, writable: true })
  return () => Reflect.deleteProperty(Object.prototype, name)
}

describe('descriptor fields are read as own fields', () => {
  it('lists a non-enumerable accessor named toJSON as a namespace when a value is planted', () => {
    const root = Object.create(null) as Record<string, unknown>
    Reflect.defineProperty(root, 'toJSON', { get: () => ({ held: 1 }), enumerable: false })
    const unplant = plant('value', (): void => undefined)
    try {
      const service = new ConfigService(root as never)

      expect(service.toJSON().namespaces).toEqual(['toJSON'])
    } finally {
      unplant()
    }
  })

  it('lists a non-enumerable accessor named then as a namespace', () => {
    const root = Object.create(null) as Record<string, unknown>
    Reflect.defineProperty(root, 'then', { get: () => ({ held: 1 }), enumerable: false })

    const service = new ConfigService(root as never)

    expect(service.toJSON().namespaces).toEqual(['then'])
  })

  it('keeps an own then that is an accessor with neither a getter nor a setter when a value is planted', () => {
    /**
     * Scenario: a setter on Object.prototype runs while the root is built, defines an own accessor `then`
     * with no getter and no setter, and plants a function `value` on Object.prototype afterwards.
     * Expectation: the root is returned, as it is without the plant, because the accessor holds no
     * callable of its own.
     */
    const schema = defineEnv({ app: z.object({ name: z.string() }) })
    Reflect.defineProperty(Object.prototype, 'app', {
      configurable: true,
      set(this: object, value: unknown) {
        Reflect.defineProperty(this, 'app', {
          value,
          writable: true,
          enumerable: true,
          configurable: true
        })
        Reflect.defineProperty(this, 'then', EMPTY_ACCESSOR)
        plant('value', (): void => undefined)
      }
    })
    try {
      const root = createValidatedConfig({ schema, source: { APP_NAME: 'ok' } })

      expect(root.app).toEqual({ name: 'ok' })
    } finally {
      Reflect.deleteProperty(Object.prototype, 'app')
      Reflect.deleteProperty(Object.prototype, 'value')
    }
  })

  it('lists a name the root reports but holds no descriptor for, as a namespace with no leaves', () => {
    /**
     * Scenario: a root whose own names include one that answers no descriptor, as a Proxy over an
     * extensible target can.
     * Expectation: the service is built, and the name is listed as a namespace with no leaves.
     */
    const root = new Proxy(
      {},
      {
        ownKeys: () => ['ghost'],
        getOwnPropertyDescriptor: () => undefined
      }
    )

    const service = new ConfigService(root as never)

    expect(service.toJSON().namespaces).toEqual(['ghost'])
  })

  it('lists an enumerable data toJSON and then as namespaces, as only the non-enumerable pinned pair is skipped', () => {
    /**
     * Scenario: a root whose own data properties named toJSON and then are enumerable, which the
     * validated root never defines them as.
     * Expectation: both are namespaces of the service.
     */
    const root = Object.create(null) as Record<string, unknown>
    Reflect.defineProperty(root, 'toJSON', { value: () => ({}), enumerable: true })
    Reflect.defineProperty(root, 'then', { value: undefined, enumerable: true })

    const service = new ConfigService(root as never)

    expect(service.toJSON().namespaces).toEqual(['toJSON', 'then'])
  })
})
