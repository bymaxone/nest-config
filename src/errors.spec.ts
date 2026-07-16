/**
 * Unit tests for the configuration error model.
 *
 * Layer: unit.
 * Goal: prove the frozen issue-code catalog is complete and immutable, that
 * ConfigIssue carries only value-free fields, and that
 * BymaxConfigValidationError exposes a stable name, a cross-realm-safe
 * `instanceof`, an immutable issue list, and a serialization shape that never
 * leaks a raw source value.
 * Mocks: none.
 */

import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import type { ConfigIssue } from './errors'

const sampleIssues: ConfigIssue[] = [
  {
    path: 'database.url',
    variable: 'DATABASE_URL',
    code: ConfigErrorCode.MISSING,
    message: 'missing required value'
  },
  {
    path: 'auth.jwtSecret',
    variable: 'AUTH_JWT_SECRET',
    code: ConfigErrorCode.INVALID,
    message: 'too short (expected: string, minimum 32 characters)'
  }
]

describe('ConfigErrorCode catalog', () => {
  it('exposes the four stable, documented code strings', () => {
    /**
     * Catalog completeness.
     *
     * The public contract names exactly these four codes; pinning their string
     * values guards against an accidental rename that would break consumers
     * matching on the machine-readable code.
     */
    expect(ConfigErrorCode).toEqual({
      VALIDATION: 'BYMAX_CONFIG_VALIDATION',
      MISSING: 'BYMAX_CONFIG_MISSING',
      INVALID: 'BYMAX_CONFIG_INVALID',
      UNKNOWN_KEY: 'BYMAX_CONFIG_UNKNOWN_KEY'
    })
  })

  it('is frozen so the catalog cannot be mutated at runtime', () => {
    /**
     * Catalog immutability.
     *
     * Codes are frozen constants; a write attempt must throw in strict mode so
     * the catalog stays a single source of truth.
     */
    expect(Object.isFrozen(ConfigErrorCode)).toBe(true)
    expect(() => {
      // Assigning to a frozen object throws under the module's strict mode.
      ;(ConfigErrorCode as { VALIDATION: string }).VALIDATION = 'x'
    }).toThrow(TypeError)
  })
})

describe('BymaxConfigValidationError construction', () => {
  it('carries the top-level validation code and a stable error name', () => {
    /**
     * Identity fields.
     *
     * The error advertises the top-level code and a stable `name` so operators
     * and log processors can recognize it regardless of the message body.
     */
    const error = new BymaxConfigValidationError(sampleIssues)

    expect(error.code).toBe('BYMAX_CONFIG_VALIDATION')
    expect(error.name).toBe('BymaxConfigValidationError')
    expect(error.message).toContain('environment validation failed')
  })

  it('exposes a stable name that cannot be reassigned at runtime', () => {
    /**
     * Name immutability.
     *
     * The name is a non-writable, non-configurable property so consumer code
     * and telemetry classification can rely on it never changing.
     */
    const error = new BymaxConfigValidationError(sampleIssues)

    expect(() => {
      ;(error as { name: string }).name = 'Tampered'
    }).toThrow(TypeError)
    expect(error.name).toBe('BymaxConfigValidationError')
  })

  it('locks code and issues so the contract cannot be reassigned at runtime', () => {
    /**
     * Contract immutability.
     *
     * `code` and `issues` are non-writable, non-configurable, so the error is a
     * tamper-proof contract object at runtime, not merely readonly in the type
     * system (the issues array and its entries are already frozen).
     */
    const error = new BymaxConfigValidationError(sampleIssues)

    expect(() => {
      ;(error as { code: string }).code = 'X'
    }).toThrow(TypeError)
    expect(() => {
      ;(error as { issues: unknown }).issues = []
    }).toThrow(TypeError)
    expect(error.code).toBe('BYMAX_CONFIG_VALIDATION')
    expect(error.issues).toHaveLength(sampleIssues.length)
  })

  it('pluralizes the header from the issue count, singular for one issue', () => {
    /**
     * Header pluralization boundary.
     *
     * A single issue reads "(1 issue)" and several read "(N issues)"; the count
     * noun must agree so the report never shows "(1 issues)".
     */
    const single = new BymaxConfigValidationError([sampleIssues[0] as ConfigIssue])
    const many = new BymaxConfigValidationError(sampleIssues)

    expect(single.message).toContain('(1 issue)')
    expect(many.message).toContain('(2 issues)')
  })

  it('is recognized by instanceof across the Error and subclass boundaries', () => {
    /**
     * Prototype stability.
     *
     * Setting the prototype in the constructor keeps `instanceof` correct even
     * when the class is transpiled to ES5-era output or crosses an ESM/CJS
     * boundary, which is essential for consumers catching the error by type.
     */
    const error = new BymaxConfigValidationError(sampleIssues)

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(BymaxConfigValidationError)
  })
})

describe('BymaxConfigValidationError issue immutability', () => {
  it('exposes the issues as a frozen array that rejects mutation', () => {
    /**
     * Read-only issue list.
     *
     * `issues` is a ReadonlyArray in the type system and frozen at runtime, so
     * a stray push from consumer code throws instead of corrupting the report.
     */
    const error = new BymaxConfigValidationError(sampleIssues)

    expect(Object.isFrozen(error.issues)).toBe(true)
    expect(() => {
      ;(error.issues as ConfigIssue[]).push({
        path: 'server.port',
        variable: 'SERVER_PORT',
        code: ConfigErrorCode.INVALID,
        message: 'invalid value'
      })
    }).toThrow(TypeError)
  })

  it('snapshots the caller array so later mutation cannot alter the error', () => {
    /**
     * Defensive copy.
     *
     * The constructor copies the incoming array; mutating the original after
     * construction must not change what the error reports.
     */
    const mutable: ConfigIssue[] = [...sampleIssues]
    const error = new BymaxConfigValidationError(mutable)
    mutable.pop()

    expect(error.issues).toHaveLength(sampleIssues.length)
  })
})

describe('BymaxConfigValidationError serialization', () => {
  it('serializes the code and issues without exposing any raw value field', () => {
    /**
     * Value-free serialization.
     *
     * JSON.stringify must surface the machine-readable code and the structured
     * issues, and every issue must carry only path, variable, code, and
     * message, never a field holding a received source value.
     */
    const error = new BymaxConfigValidationError(sampleIssues)

    const serialized = JSON.parse(JSON.stringify(error)) as {
      code: string
      issues: ConfigIssue[]
    }

    expect(serialized.code).toBe('BYMAX_CONFIG_VALIDATION')
    expect(serialized.issues).toHaveLength(sampleIssues.length)
    expect(Object.keys(JSON.parse(JSON.stringify(error))).sort()).toEqual(['code', 'issues'])
    for (const issue of serialized.issues) {
      expect(Object.keys(issue).sort()).toEqual(['code', 'message', 'path', 'variable'])
    }
  })

  it('strips any extra field from an issue so a stray value cannot leak', () => {
    /**
     * Defensive value-free normalization.
     *
     * Even if an issue arrives with an extra property (here a stray value), the
     * error copies each issue down to only the contract fields, so neither the
     * report nor JSON serialization can ever surface it.
     */
    const tainted = [
      {
        path: 'auth.jwtSecret',
        variable: 'AUTH_JWT_SECRET',
        code: ConfigErrorCode.INVALID,
        message: 'too short (expected: string, minimum 32 characters)',
        value: 'SUPER_SECRET_VALUE_123'
      }
    ] as unknown as ConfigIssue[]

    const error = new BymaxConfigValidationError(tainted)

    expect(Object.keys(error.issues[0] as ConfigIssue).sort()).toEqual([
      'code',
      'message',
      'path',
      'variable'
    ])
    expect(JSON.stringify(error)).not.toContain('SUPER_SECRET_VALUE_123')
    expect(error.message).not.toContain('SUPER_SECRET_VALUE_123')
  })
})
