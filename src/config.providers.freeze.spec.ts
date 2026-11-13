/**
 * Unit and integration tests for configuration values that cannot be frozen.
 *
 * Layer: unit and integration.
 * Goal: pin that a decoded binary leaf boots, and that a value whose freezing throws is
 * reported as one value-free issue of the aggregated error, so the hook runs and the thrown
 * message never reaches the report or the log.
 * Mocks: none; the Nest boot test replaces the logger with a recorder.
 */

import { Module } from '@nestjs/common'
import type { LoggerService } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'

/** A value no generated message may carry. */
const SECRET = 'SUPERSECRETVALUE123'

const decoded = defineEnv({
  auth: z.object({ key: z.string().transform((text) => Buffer.from(text, 'base64')) })
})

/** A schema whose output refuses to be frozen, with a message that quotes the value. */
const unfreezable = defineEnv({
  auth: z.object({
    key: z.string().transform(
      (text) =>
        new Proxy(
          {},
          {
            preventExtensions() {
              throw new Error(`cannot freeze ${text}`)
            }
          }
        )
    )
  })
})

describe('a binary leaf', () => {
  it.each([
    ['a Buffer', 'c2VjcmV0LWtleQ==', 'secret-key'],
    ['an empty Buffer', '', '']
  ])('boots with %s decoded from base64', (_kind, encoded, expected) => {
    /** `Buffer.from(text, 'base64')` is the usual way to read a key; freezing it used to throw. */
    const config = createValidatedConfig({ schema: decoded, source: { AUTH_KEY: encoded } })

    expect(config.auth.key.toString()).toBe(expected)
    expect(Object.isFrozen(config.auth)).toBe(true)
  })
})

describe('a value whose freezing throws', () => {
  it('is reported as one issue that names the class and withholds the message', () => {
    /** The proxy refuses `preventExtensions`, which is what `Object.freeze` asks it to do. */
    let caught: unknown
    try {
      createValidatedConfig({ schema: unfreezable, source: { AUTH_KEY: SECRET } })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(BymaxConfigValidationError)
    const error = caught as BymaxConfigValidationError
    expect(error.issues).toEqual([
      {
        path: '',
        variable: '(schema)',
        code: ConfigErrorCode.INVALID,
        message:
          'freezing the validated configuration threw Error; its message is withheld because it can carry the value'
      }
    ])
    expect(error.message).not.toContain(SECRET)
  })

  it('runs the observability hook with the value-free issue', async () => {
    /** The hook runs only for the aggregated error, so the throw must arrive as one. */
    const hook = jest.fn()

    await expect(
      Test.createTestingModule({
        imports: [
          BymaxConfigModule.forRoot({
            schema: unfreezable,
            source: { AUTH_KEY: SECRET },
            onValidationError: hook
          })
        ]
      }).compile()
    ).rejects.toBeInstanceOf(BymaxConfigValidationError)

    expect(hook).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(hook.mock.calls[0])).not.toContain(SECRET)
  })

  it('writes the secret to no log line of a Nest boot', async () => {
    /** Every line Nest's exception handler writes is recorded. */
    const lines: string[] = []
    const record = (...parts: unknown[]): void => void lines.push(parts.map(String).join(' '))
    const logger: LoggerService = { log: record, error: record, warn: record }
    @Module({
      imports: [BymaxConfigModule.forRoot({ schema: unfreezable, source: { AUTH_KEY: SECRET } })]
    })
    class AppModule {}

    await expect(
      NestFactory.createApplicationContext(AppModule, { logger, abortOnError: false })
    ).rejects.toBeInstanceOf(BymaxConfigValidationError)

    expect(lines.join('\n')).not.toContain(SECRET)
  })
})
