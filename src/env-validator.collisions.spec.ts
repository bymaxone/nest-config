/**
 * Unit tests for variable-collision detection in the validator.
 *
 * Layer: unit.
 * Goal: prove a schema whose leaves resolve to one source variable is rejected
 * before the source is read, with one issue per colliding leaf naming the other
 * leaves, while distinct names that only look alike are accepted.
 * Mocks: none.
 */

import { z } from 'zod'

import { captureError } from './__tests__/validator-fixtures'
import { defineEnv } from './define-env'
import { ConfigErrorCode } from './errors'
import { validateEnv } from './env-validator'

describe('validateEnv variable collisions', () => {
  const rename = 'rename one with meta({ env })'

  it('rejects two leaves whose derived names are one variable', () => {
    /**
     * `a.bC` and `aB.c` both derive A_B_C, so both leaves would read one variable and
     * neither could tell. The schema is rejected, naming both paths and the variable,
     * even though the source supplies a value for it.
     */
    const schema = defineEnv({ a: z.object({ bC: z.string() }), aB: z.object({ c: z.string() }) })

    const error = captureError(schema, { A_B_C: 'x' })

    expect(error.issues).toEqual([
      {
        path: 'a.bC',
        variable: 'A_B_C',
        code: ConfigErrorCode.INVALID,
        message: `shares this variable with aB.c; ${rename}`
      },
      {
        path: 'aB.c',
        variable: 'A_B_C',
        code: ConfigErrorCode.INVALID,
        message: `shares this variable with a.bC; ${rename}`
      }
    ])
  })

  it('rejects the acronym case, httpServer and HTTPServer', () => {
    /** Both namespaces derive HTTP_SERVER, so their `port` leaves read HTTP_SERVER_PORT. */
    const schema = defineEnv({
      httpServer: z.object({ port: z.string() }),
      HTTPServer: z.object({ port: z.string() })
    })

    const error = captureError(schema, { HTTP_SERVER_PORT: '1' })

    expect(error.issues.map((issue) => `${issue.path} ${issue.variable}`)).toEqual([
      'httpServer.port HTTP_SERVER_PORT',
      'HTTPServer.port HTTP_SERVER_PORT'
    ])
  })

  it('treats the same meta({ env }) on two leaves as a collision', () => {
    /**
     * Giving two leaves one explicit name is the same defect as deriving one: they still
     * read a single variable. There is no opt-out; one leaf can be transformed instead.
     */
    const schema = defineEnv({
      db: z.object({ url: z.string().meta({ env: 'SHARED_URL' }) }),
      cache: z.object({ url: z.string().meta({ env: 'SHARED_URL' }) })
    })

    const error = captureError(schema, { SHARED_URL: 'x' })

    expect(error.issues.map((issue) => issue.path)).toEqual(['db.url', 'cache.url'])
    expect(error.issues.every((issue) => issue.variable === 'SHARED_URL')).toBe(true)
  })

  it('rejects an explicit name that is the derived name of another leaf', () => {
    /** `legacy.conn` is told to read DATABASE_URL, which `database.url` derives. */
    const schema = defineEnv({
      database: z.object({ url: z.string() }),
      legacy: z.object({ conn: z.string().meta({ env: 'DATABASE_URL' }) })
    })

    const error = captureError(schema, { DATABASE_URL: 'x' })

    expect(error.issues.map((issue) => issue.path)).toEqual(['database.url', 'legacy.conn'])
  })

  it('names every other leaf when three read one variable', () => {
    /** Each issue lists the leaves that share the variable with it, not itself. */
    const schema = defineEnv({
      one: z.object({ v: z.string().meta({ env: 'ALL' }) }),
      two: z.object({ v: z.string().meta({ env: 'ALL' }) }),
      three: z.object({ v: z.string().meta({ env: 'ALL' }) })
    })

    const error = captureError(schema, { ALL: 'x' })

    expect(error.issues.map((issue) => issue.message)).toEqual([
      `shares this variable with two.v, three.v; ${rename}`,
      `shares this variable with one.v, three.v; ${rename}`,
      `shares this variable with one.v, two.v; ${rename}`
    ])
  })

  it('reports every collision together, in order of first appearance', () => {
    /** Two separate collisions in one schema come back in one report. */
    const schema = defineEnv({
      a: z.object({ bC: z.string() }),
      aB: z.object({ c: z.string() }),
      x: z.object({ yZ: z.string() }),
      xY: z.object({ z: z.string() })
    })

    const error = captureError(schema, {})

    expect(error.issues.map((issue) => `${issue.variable} ${issue.path}`)).toEqual([
      'A_B_C a.bC',
      'A_B_C aB.c',
      'X_Y_Z x.yZ',
      'X_Y_Z xY.z'
    ])
  })

  it('reports the schema defect before any problem with the source', () => {
    /**
     * A collision does not depend on the environment, so it is raised first and alone: an
     * empty source does not turn it into a list of missing variables.
     */
    const schema = defineEnv({ a: z.object({ bC: z.string() }), aB: z.object({ c: z.string() }) })

    const error = captureError(schema, {})

    expect(error.issues.every((issue) => issue.message.startsWith('shares this variable'))).toBe(
      true
    )
  })

  it('accepts distinct names that only look alike', () => {
    /** `a.b` and `a.bC` derive A_B and A_B_C: different variables, no collision. */
    const schema = defineEnv({ a: z.object({ b: z.string(), bC: z.string() }) })

    expect(validateEnv(schema, { A_B: '1', A_B_C: '2' })).toEqual({ a: { b: '1', bC: '2' } })
  })
})
