/**
 * Unit tests for the aggregated error report formatter.
 *
 * Layer: unit.
 * Goal: pin the public report layout of spec section 6.1 (header, aligned issue
 * lines, footer), prove singular and plural issue counts, and prove the
 * value-free contract: a sentinel secret placed in a hypothetical source never
 * reaches the formatted output, the error message, or the serialized error.
 * Mocks: none.
 */

import { BymaxConfigValidationError, ConfigErrorCode } from './errors'
import type { ConfigIssue } from './errors'
import { formatIssueReport } from './report-formatter'

const reportIssues: ConfigIssue[] = [
  {
    path: 'database.url',
    variable: 'DATABASE_URL',
    code: ConfigErrorCode.MISSING,
    message: 'missing required value (expected: url)'
  },
  {
    path: 'auth.jwtSecret',
    variable: 'AUTH_JWT_SECRET',
    code: ConfigErrorCode.INVALID,
    message: 'too short (expected: string, minimum 32 characters)'
  },
  {
    path: 'server.port',
    variable: 'SERVER_PORT',
    code: ConfigErrorCode.INVALID,
    message: 'invalid value (expected: integer between 1 and 65535)'
  }
]

describe('formatIssueReport layout', () => {
  it('renders the header, aligned issue lines, and footer of the report contract', () => {
    /**
     * Public report layout (spec 6.1).
     *
     * The report is part of the package contract; this inline snapshot pins the
     * header count, the aligned variable column, the value-free constraint
     * descriptions, and the closing fix instruction so any drift is visible.
     */
    expect(formatIssueReport(reportIssues)).toMatchInlineSnapshot(`
"environment validation failed (3 issues)

  DATABASE_URL          missing required value (expected: url)
  AUTH_JWT_SECRET       too short (expected: string, minimum 32 characters)
  SERVER_PORT           invalid value (expected: integer between 1 and 65535)

Fix the variables above and restart the process."
`)
  })

  it('aligns every constraint description in the same column', () => {
    /**
     * Column alignment.
     *
     * Each issue line pads the variable name to a shared width so the
     * constraint descriptions line up, keeping the report scannable regardless
     * of variable-name length.
     */
    const lines = formatIssueReport(reportIssues).split('\n')
    const messageColumns = reportIssues.map((issue) => {
      const line = lines.find((candidate) => candidate.includes(issue.message)) as string
      return line.indexOf(issue.message)
    })

    // All three constraint descriptions begin at one shared column index.
    expect(new Set(messageColumns).size).toBe(1)
  })

  it('renders the exact spec 6.1 block when rendered through the error name', () => {
    /**
     * End-to-end report parity.
     *
     * The thrown error stringifies to the spec 6.1 example verbatim: the class
     * name prefix plus the formatted body. This proves the formatter output is
     * exactly what an operator sees on a failed boot.
     */
    const error = new BymaxConfigValidationError(reportIssues)

    expect(String(error)).toMatchInlineSnapshot(`
"BymaxConfigValidationError: environment validation failed (3 issues)

  DATABASE_URL          missing required value (expected: url)
  AUTH_JWT_SECRET       too short (expected: string, minimum 32 characters)
  SERVER_PORT           invalid value (expected: integer between 1 and 65535)

Fix the variables above and restart the process."
`)
  })
})

describe('formatIssueReport count agreement', () => {
  it('uses the singular noun for a single issue', () => {
    /**
     * Singular header boundary.
     *
     * One issue must read "(1 issue)" so the report never shows the grammatically
     * wrong "(1 issues)".
     */
    const single: ConfigIssue[] = [reportIssues[0] as ConfigIssue]

    expect(formatIssueReport(single)).toContain('environment validation failed (1 issue)')
    expect(formatIssueReport(single)).not.toContain('(1 issues)')
  })

  it('widens the variable column to fit a name longer than the minimum', () => {
    /**
     * Long-name column growth.
     *
     * When a variable name exceeds the minimum column width, the column grows so
     * a gutter still separates it from the message, keeping alignment intact.
     */
    const longName: ConfigIssue[] = [
      {
        path: 'database.primaryConnectionString',
        variable: 'DATABASE_PRIMARY_CONNECTION_STRING',
        code: ConfigErrorCode.MISSING,
        message: 'missing required value'
      }
    ]

    const line = formatIssueReport(longName).split('\n')[2] as string
    expect(line).toBe('  DATABASE_PRIMARY_CONNECTION_STRING  missing required value')
  })
})

describe('formatIssueReport value-free guarantee', () => {
  it('never echoes a sentinel secret value into the report or the error', () => {
    /**
     * Value-leak guard (hard contract).
     *
     * Even when the offending variables held secret values, the formatter only
     * ever receives the value-free ConfigIssue fields. The sentinel must appear
     * nowhere in the report, the error message, or the serialized error.
     */
    const sentinel = 'SUPER_SECRET_VALUE_123'
    const issues = [
      {
        path: 'auth.jwtSecret',
        variable: 'AUTH_JWT_SECRET',
        code: ConfigErrorCode.INVALID,
        message: 'too short (expected: string, minimum 32 characters)',
        value: sentinel
      }
    ] as unknown as ConfigIssue[]

    const report = formatIssueReport(issues)
    const error = new BymaxConfigValidationError(issues)

    expect(report).not.toContain(sentinel)
    expect(error.message).not.toContain(sentinel)
    expect(JSON.stringify(error)).not.toContain(sentinel)
  })
})

describe('formatIssueReport for issues that name no variable', () => {
  const unplaced: ConfigIssue[] = [
    {
      path: 'database.urll',
      variable: '',
      code: ConfigErrorCode.UNKNOWN_KEY,
      message: 'no leaf of the schema is at this path; the override was not applied'
    },
    {
      path: 'ghost.x',
      variable: '',
      code: ConfigErrorCode.UNKNOWN_KEY,
      message: 'no leaf of the schema is at this path; the override was not applied'
    }
  ]

  it('shows the path of each issue in the name column', () => {
    /**
     * An issue about an override has no environment variable, so the column that names the
     * offender must name the path, or the report is N identical lines with a blank first column.
     */
    const lines = formatIssueReport(unplaced).split('\n')

    expect(lines.filter((line) => line.includes('database.urll'))).toHaveLength(1)
    expect(lines.filter((line) => line.includes('ghost.x'))).toHaveLength(1)
  })

  it('closes with a footer about the test, not the process restart', () => {
    /** These issues come from a test helper, so asking to restart the process would mislead. */
    const report = formatIssueReport(unplaced)

    expect(report).toContain('Fix the overrides above in the test.')
    expect(report).not.toContain('restart the process')
  })

  it('keeps the production footer when any issue names a variable', () => {
    /** One real variable among them makes it a production report, whatever else is listed. */
    const report = formatIssueReport([...unplaced, ...reportIssues.slice(0, 1)])

    expect(report).toContain('Fix the variables above and restart the process.')
  })

  it('keeps a gutter between a path longer than the minimum column and its message', () => {
    /** The name column grows to the longest path, as it does for a variable. */
    const longPath = 'averylongnamespace.averylongleafname'
    const issue: ConfigIssue = {
      path: longPath,
      variable: '',
      code: ConfigErrorCode.UNKNOWN_KEY,
      message: 'm'
    }
    const report = formatIssueReport([issue])

    expect(report).toContain(`  ${longPath}  m`)
  })

  it('uses the production footer for a report with no issues', () => {
    /** An empty list names no override, so the test footer does not apply to it. */
    expect(formatIssueReport([])).toContain('Fix the variables above and restart the process.')
  })

  it('reaches error.message through the error class', () => {
    /** The text a developer reads in a Jest run is the error's message, not the formatter's. */
    const error = new BymaxConfigValidationError(unplaced)

    expect(error.message).toContain('database.urll')
    expect(error.message).toContain('ghost.x')
  })
})
