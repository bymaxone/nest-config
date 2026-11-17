/**
 * Unit and integration tests for how the raw configuration root serializes to JSON.
 *
 * Layer: unit and integration.
 * Goal: pin that `JSON.stringify` of the validated root, and a JSON logger that honours `toJSON`
 * such as Nest's `ConsoleLogger` with `json: true`, print the declared namespace names and no
 * value; that `toJSON` is a non-enumerable, non-writable, non-configurable property, so
 * enumeration, spread and equality exclude it; and what it does not cover (a namespace
 * serialized directly, a spread or `Object.assign` copy of the root).
 * Mocks: none.
 */

import { ConsoleLogger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { BYMAX_CONFIG } from './config.tokens'
import { defineEnv } from './define-env'
import { createTestConfig } from './testing/create-test-config'

/** A value no serialized form of the root may carry. */
const SECRET = 'SUPERSECRETVALUE123'

/** What the root serializes to, in place of its values. */
const MARKER = { service: 'BymaxConfig', namespaces: ['auth', 'server'] }

const schema = defineEnv({
  auth: z.object({ jwtSecret: z.string() }),
  server: z.object({ port: z.coerce.number().default(3000) })
})

const source = { AUTH_JWT_SECRET: SECRET }

describe('the validated configuration root when it is serialized to JSON', () => {
  it('serializes to the declared namespace names and no value', () => {
    /** The root is what a logger renders when handed the injected token by mistake. */
    const config = createValidatedConfig({ schema, source })

    expect(JSON.parse(JSON.stringify(config))).toEqual(MARKER)
    expect(JSON.stringify(config)).not.toContain(SECRET)
  })

  it('serializes the same inside another object, and for the root the module hands out', async () => {
    /** Both routes to the raw root carry the property, and the service still reads the values. */
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema, source })]
    }).compile()
    const injected = moduleRef.get<object>(BYMAX_CONFIG)
    const service = moduleRef.get<ConfigService<{ auth: { jwtSecret: string } }>>(ConfigService)

    expect(JSON.parse(JSON.stringify({ ctx: injected }))).toEqual({ ctx: MARKER })
    expect(JSON.parse(JSON.stringify(service.getAll()))).toEqual(MARKER)
    expect(service.get('auth.jwtSecret')).toBe(SECRET)
  })

  it("prints no value through Nest's ConsoleLogger in json mode", () => {
    /** `json: true` serializes with JSON.stringify, so `toJSON` applies. */
    const config = createValidatedConfig({ schema, source })
    const written: string[] = []
    const write = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    try {
      new ConsoleLogger('probe', { colors: false, json: true }).log({ config })

      expect(written.join('')).toContain('BymaxConfig')
      expect(written.join('')).not.toContain(SECRET)
    } finally {
      write.mockRestore()
    }
  })

  it('serializes the root of createTestConfig the same way', () => {
    /** The testing subpath returns the root of the same factory. */
    const config = createTestConfig(schema, { auth: { jwtSecret: SECRET } })

    expect(JSON.parse(JSON.stringify(config))).toEqual(MARKER)
  })

  it('defines toJSON as a non-enumerable, non-writable, non-configurable property of a frozen root', () => {
    /** The property exists, is not an own enumerable key, and cannot be redefined after the freeze. */
    const config = createValidatedConfig({ schema, source })
    const descriptor = Object.getOwnPropertyDescriptor(config, 'toJSON')

    expect(descriptor).toMatchObject({ enumerable: false, writable: false, configurable: false })
    expect(Object.isFrozen(config)).toBe(true)
    expect(() => Object.defineProperty(config, 'toJSON', { value: undefined })).toThrow(TypeError)
  })

  it('keeps toJSON out of every enumeration of the root', () => {
    /** Non-enumerable: keys, spread and equality see the namespaces and nothing else. */
    const config = createValidatedConfig({ schema, source })

    expect(Object.keys(config)).toEqual(['auth', 'server'])
    expect(Object.keys({ ...config })).toEqual(['auth', 'server'])
    expect(config).toStrictEqual({ auth: { jwtSecret: SECRET }, server: { port: 3000 } })
  })

  it('does not cover a namespace serialized directly', () => {
    /** Documented limit: only the root carries the property. */
    const config = createValidatedConfig({ schema, source })

    expect(JSON.stringify(config.auth)).toContain(SECRET)
  })

  it('does not cover a spread or Object.assign copy of the root', () => {
    /** Documented limit: a copy drops the non-enumerable property, so its serialization shows the values. */
    const config = createValidatedConfig({ schema, source })

    expect(JSON.stringify({ ...config })).toContain(SECRET)
    expect(JSON.stringify(Object.assign({}, config))).toContain(SECRET)
  })
})
