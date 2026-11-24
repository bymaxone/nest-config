/**
 * Unit tests for the descriptors the library reads from objects the host can influence.
 *
 * Layer: unit.
 * Goal: prove that a descriptor is read through its own fields only. A descriptor is an ordinary
 * object, so a `get` or `value` planted on `Object.prototype` is otherwise answered for an accessor
 * or a data property that has no such field of its own.
 * Mocks: none. The plant is a property defined on `Object.prototype` and removed afterwards.
 */

import { ConfigService } from './config.service'

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
})
