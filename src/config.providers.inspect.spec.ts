/**
 * Unit and integration tests for how the raw configuration root prints.
 *
 * Layer: unit and integration.
 * Goal: pin that `util.inspect` of the validated root, which is what `console.log`, `util.format`
 * and Nest's text `ConsoleLogger` use, prints a redacted marker instead of the values; that the marker is a
 * non-enumerable property, so enumeration, spread and equality exclude it; and
 * what it does not cover (`JSON.stringify`, a JSON logger, a namespace printed directly).
 * Mocks: none.
 */

import { Console } from 'node:console'
import { Writable } from 'node:stream'
import { format, inspect } from 'node:util'

import { ConsoleLogger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { ConfigService } from './config.service'
import { BYMAX_CONFIG } from './config.tokens'
import { defineEnv } from './define-env'

/** A value no printed form of the root may carry. */
const SECRET = 'SUPERSECRETVALUE123'

const schema = defineEnv({
  auth: z.object({ jwtSecret: z.string() }),
  server: z.object({ port: z.coerce.number().default(3000) })
})

const source = { AUTH_JWT_SECRET: SECRET }

describe('the validated configuration root when it is printed', () => {
  it('prints a marker instead of the values under util.inspect', () => {
    /** The root is what a logger renders when handed the injected token by mistake. */
    const config = createValidatedConfig({ schema, source })

    expect(inspect(config)).toBe('[BymaxConfig: values redacted]')
  })

  it.each([
    ['depth null', { depth: null }],
    ['showHidden', { showHidden: true }],
    ['colors', { colors: true }],
    ['compact false', { compact: false }]
  ])('prints the marker with %s', (_name, options) => {
    /** No inspect option reaches past the custom function. */
    const config = createValidatedConfig({ schema, source })

    expect(inspect(config, options)).not.toContain(SECRET)
  })

  it('prints the marker inside a larger object or array', () => {
    /** A value that holds the root, such as a log context, is redacted at the root. */
    const config = createValidatedConfig({ schema, source })

    expect(inspect({ context: config })).toBe('{ context: [BymaxConfig: values redacted] }')
    expect(inspect([config, { nested: { config } }], { depth: null })).not.toContain(SECRET)
  })

  it('shows no value through console.log, util.format or a template string', () => {
    /** The three ways a value reaches a log line: a real Console, format(), and interpolation. */
    const config = createValidatedConfig({ schema, source })
    const lines: string[] = []
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString())
        done()
      }
    })

    new Console(sink).log(config)
    new Console(sink).log('loaded', { config })

    expect(lines.join('')).toContain('[BymaxConfig: values redacted]')
    expect([
      lines.join(''),
      format('%o %O %s %j', config, config, config, config.server)
    ]).not.toEqual(expect.arrayContaining([expect.stringContaining(SECRET)]))
    expect(`${String(config)}`).not.toContain(SECRET)
  })

  it("shows no value through Nest's ConsoleLogger in text mode, and shows them in json mode", () => {
    /**
     * Nest's default logger renders objects with util.inspect, so the marker applies; with
     * `json: true` it serializes the enumerable keys, which a JSON logger such as pino also does,
     * so the values are printed. The second half pins the documented limit.
     */
    const config = createValidatedConfig({ schema, source })
    const written: string[] = []
    const write = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    try {
      new ConsoleLogger('probe', { colors: false }).log({ config })
      const text = written.join('')
      written.length = 0
      new ConsoleLogger('probe', { colors: false, json: true }).log({ config })

      expect(text).toContain('[BymaxConfig: values redacted]')
      expect(text).not.toContain(SECRET)
      expect(written.join('')).toContain(SECRET)
    } finally {
      write.mockRestore()
    }
  })

  it('keeps the marker out of every enumeration of the root', () => {
    /** Non-enumerable: keys, entries, spread and equality see the namespaces and nothing else. */
    const config = createValidatedConfig({ schema, source })

    expect(Object.keys(config)).toEqual(['auth', 'server'])
    expect(Object.getOwnPropertySymbols({ ...config })).toEqual([])
    expect(config).toEqual({ auth: { jwtSecret: SECRET }, server: { port: 3000 } })
    expect(config).toStrictEqual({ auth: { jwtSecret: SECRET }, server: { port: 3000 } })
  })

  it('defines the marker as a non-enumerable property of a frozen root', () => {
    /** The property exists, is not enumerable, and cannot be redefined after the freeze. */
    const config = createValidatedConfig({ schema, source })
    const symbols = Object.getOwnPropertySymbols(config)
    const marker = symbols[0] as symbol

    expect(symbols).toHaveLength(1)
    expect(Object.prototype.propertyIsEnumerable.call(config, marker)).toBe(false)
    expect(Object.isFrozen(config)).toBe(true)
    expect(() => Object.defineProperty(config, marker, { value: undefined })).toThrow(TypeError)
  })

  it('does not redact JSON.stringify, which the marker cannot cover', () => {
    /** Documented limit: serialization walks the enumerable keys, and the marker is not one of them. */
    const config = createValidatedConfig({ schema, source })

    expect(JSON.stringify(config)).toContain(SECRET)
  })

  it('does not redact a namespace that is printed directly', () => {
    /** Documented limit: only the root carries the marker. */
    const config = createValidatedConfig({ schema, source })

    expect(inspect(config.auth)).toContain(SECRET)
  })

  it('redacts the root the module injects and the one ConfigService returns', async () => {
    /** Both routes to the raw root print the marker, and the service reads the values. */
    const moduleRef = await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema, source })]
    }).compile()
    const injected = moduleRef.get<object>(BYMAX_CONFIG)
    const service = moduleRef.get<ConfigService<{ auth: { jwtSecret: string } }>>(ConfigService)

    expect(inspect(injected)).toBe('[BymaxConfig: values redacted]')
    expect(inspect(service.getAll())).toBe('[BymaxConfig: values redacted]')
    expect(service.get('auth.jwtSecret')).toBe(SECRET)
  })
})
