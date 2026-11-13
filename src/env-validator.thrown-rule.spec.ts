/**
 * Unit and integration tests for a schema rule that throws while it validates.
 *
 * Layer: unit and integration.
 * Goal: pin that a `.transform` or `.refine` that throws is reported as one value-free issue of
 * the aggregated error, so the report stays value-free, the observability hook runs, and the boot
 * still fails. A thrown message can quote the received value, so it is withheld.
 * Mocks: none; the Nest boot test replaces the logger with a recorder.
 */

import { NestFactory } from '@nestjs/core'
import { Module } from '@nestjs/common'
import type { LoggerService } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { z } from 'zod'

import { BymaxConfigModule } from './config.module'
import { createValidatedConfig } from './config.providers'
import { defineEnv } from './define-env'
import { validateEnv } from './env-validator'
import { BymaxConfigValidationError, ConfigErrorCode } from './errors'

/** A value no generated message may carry. */
const SECRET = 'SUPERSECRETVALUE123'

const parseJson = defineEnv({
  feature: z.object({ flags: z.string().transform((text) => JSON.parse(text) as unknown) })
})

/** What the validator throws for a source, or the failure of the test when it does not throw. */
function failureOf(run: () => unknown): BymaxConfigValidationError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(BymaxConfigValidationError)
    return error as BymaxConfigValidationError
  }
  throw new Error('expected the validation to fail')
}

describe('a transform that throws', () => {
  it('is reported as one aggregated issue that carries no part of the thrown message', () => {
    /**
     * `JSON.parse` quotes the text it could not read: `"SUPERSECRETVALUE123" is not valid JSON`.
     * Without a guard that SyntaxError left the validator as it was, with the secret in it.
     */
    const error = failureOf(() => validateEnv(parseJson, { FEATURE_FLAGS: SECRET }))

    expect(error.issues).toEqual([
      {
        path: '',
        variable: '(schema)',
        code: ConfigErrorCode.INVALID,
        message: 'a rule threw SyntaxError; its message is withheld because it can carry the value'
      }
    ])
    expect(error.message).not.toContain(SECRET)
    expect(JSON.stringify(error)).not.toContain(SECRET)
    expect(Object.getOwnPropertyDescriptor(error, 'cause')).toBeUndefined()
  })

  it('is reported the same way when the rule is a refine', () => {
    /** A refinement that throws takes the same path as a transform. */
    const schema = defineEnv({
      feature: z.object({
        key: z.string().refine((text) => {
          throw new RangeError(`bad ${text}`)
        })
      })
    })

    const error = failureOf(() => validateEnv(schema, { FEATURE_KEY: SECRET }))

    expect(error.issues.map((issue) => issue.message)).toEqual([
      'a rule threw RangeError; its message is withheld because it can carry the value'
    ])
    expect(error.message).not.toContain(SECRET)
  })

  it('still fails the boot when other leaves are also wrong, reporting only the throw', () => {
    /**
     * Zod stops at the rule that threw, so the other leaves cannot be aggregated. The boot must
     * fail anyway, and the one issue says what happened.
     */
    const schema = defineEnv({
      feature: z.object({
        flags: z.string().transform((text) => JSON.parse(text) as unknown),
        name: z.string()
      })
    })

    const error = failureOf(() => validateEnv(schema, { FEATURE_FLAGS: SECRET }))

    expect(error.issues).toHaveLength(1)
    expect(error.issues[0]?.variable).toBe('(schema)')
  })

  it.each([
    ['a string', SECRET],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an object with no prototype', Object.create(null) as object]
  ])('names a thrown value that is not an Error without quoting it: %s', (_kind, thrown) => {
    /** A rule can throw a primitive or an object with no constructor; none is echoed or named. */
    const schema = defineEnv({
      feature: z.object({
        key: z.string().transform(() => {
          throw thrown
        })
      })
    })

    const error = failureOf(() => validateEnv(schema, { FEATURE_KEY: 'x' }))

    expect(error.issues.map((issue) => issue.message)).toEqual([
      'a rule threw a value that is not an Error; the value is withheld because it can carry the value'
    ])
    expect(error.message).not.toContain(SECRET)
  })

  it.each(['X', 'Err_2$', '$ZodLike', '_private', 'lowerFirst', 'SyntaxError'])(
    'names the class %s of what was thrown',
    (className) => {
      /** Any identifier is code, not input: one character, digits, `_` and `$` all qualify. */
      const thrown = new (Object.defineProperty(class {}, 'name', { value: className }))()
      const schema = defineEnv({
        feature: z.object({
          key: z.string().transform(() => {
            throw thrown
          })
        })
      })

      const error = failureOf(() => validateEnv(schema, { FEATURE_KEY: 'x' }))

      expect(error.issues.map((issue) => issue.message)).toEqual([
        `a rule threw ${className}; its message is withheld because it can carry the value`
      ])
    }
  )

  it.each([
    [
      'a constructor getter that throws',
      () => ({
        get constructor(): never {
          throw new Error(`bad ${SECRET}`)
        }
      })
    ],
    [
      'a constructor name getter that throws',
      () => ({
        constructor: {
          get name(): never {
            throw new Error(`bad ${SECRET}`)
          }
        }
      })
    ]
  ])('does not let reading %s escape the report', (_kind, make) => {
    /**
     * The class name is read from what the rule threw, which can run code of its own. A getter
     * that throws must not replace the report with its own raw error.
     */
    const schema = defineEnv({
      feature: z.object({
        key: z.string().transform(() => {
          throw make()
        })
      })
    })

    const error = failureOf(() => validateEnv(schema, { FEATURE_KEY: 'x' }))

    expect(error.issues.map((issue) => issue.message)).toEqual([
      'a rule threw a value that is not an Error; the value is withheld because it can carry the value'
    ])
    expect(error.message).not.toContain(SECRET)
  })

  it('does not take a class name that is not an identifier as a name', () => {
    /** A constructor name is code, but a thrown object can carry any string there. */
    const impostor = Object.defineProperty(function Thrown() {}, 'name', {
      value: `bad name ${SECRET}`
    })
    const schema = defineEnv({
      feature: z.object({
        key: z.string().transform(() => {
          throw Object.create(impostor.prototype as object, {
            constructor: { value: impostor }
          }) as object
        })
      })
    })

    const error = failureOf(() => validateEnv(schema, { FEATURE_KEY: 'x' }))

    expect(error.message).not.toContain(SECRET)
    expect(error.issues.map((issue) => issue.message)).toEqual([
      'a rule threw a value that is not an Error; the value is withheld because it can carry the value'
    ])
  })

  it('keeps the override and unknown-key issues of the same boot', () => {
    /** Those two do not depend on the parse, so they are reported beside the thrown rule. */
    const schema = defineEnv({
      feature: z.object({
        flags: z.string().transform((text) => JSON.parse(text) as unknown),
        bad: z.string().meta({ env: '' })
      })
    })

    const error = failureOf(() =>
      validateEnv(schema, { FEATURE_FLAGS: SECRET, FEATURE_STRAY: '1' }, { strict: true })
    )

    expect(error.issues.map((issue) => issue.variable)).toEqual([
      'FEATURE_BAD',
      '(schema)',
      'FEATURE_STRAY'
    ])
  })
})

describe('a thrown rule at the module boundary', () => {
  it('throws the aggregated error from createValidatedConfig', () => {
    /** The synchronous entry point is the one the module and the testing helpers share. */
    expect(() =>
      createValidatedConfig({ schema: parseJson, source: { FEATURE_FLAGS: SECRET } })
    ).toThrow(BymaxConfigValidationError)
  })

  it('runs the observability hook with the value-free issue', async () => {
    /** The hook runs only for the aggregated error, so a raw throw never reached it. */
    const hook = jest.fn()

    await expect(
      Test.createTestingModule({
        imports: [
          BymaxConfigModule.forRoot({
            schema: parseJson,
            source: { FEATURE_FLAGS: SECRET },
            onValidationError: hook
          })
        ]
      }).compile()
    ).rejects.toBeInstanceOf(BymaxConfigValidationError)

    expect(hook).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(hook.mock.calls[0])).not.toContain(SECRET)
    expect(hook.mock.calls[0][0]).toHaveLength(1)
  })
})

describe('a thrown rule in a Nest boot', () => {
  it('writes the secret to no log line and fails the boot', async () => {
    /**
     * What an application sees: Nest's exception handler logs the error it caught. Every line
     * it writes is recorded here.
     */
    const lines: string[] = []
    const logger: LoggerService = {
      log: (...parts: unknown[]) => void lines.push(parts.map(String).join(' ')),
      error: (...parts: unknown[]) => void lines.push(parts.map(String).join(' ')),
      warn: (...parts: unknown[]) => void lines.push(parts.map(String).join(' '))
    }
    @Module({
      imports: [BymaxConfigModule.forRoot({ schema: parseJson, source: { FEATURE_FLAGS: SECRET } })]
    })
    class AppModule {}

    await expect(
      NestFactory.createApplicationContext(AppModule, { logger, abortOnError: false })
    ).rejects.toBeInstanceOf(BymaxConfigValidationError)

    expect(lines.join('\n')).not.toContain(SECRET)
  })
})
