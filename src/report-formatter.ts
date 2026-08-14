/**
 * @fileoverview Pure formatter for the aggregated configuration error report.
 * Renders the ConfigIssue fields into the multi-line layout that is part of the
 * package contract: a header with the issue count, one aligned line per issue
 * (resolved variable name and constraint description), and a closing fix
 * instruction. It reads only the two report fields and never reaches for a
 * source value of its own, so nothing it adds can leak one; the description it
 * is handed is rendered verbatim, which for a schema author's own `custom`
 * message means whatever that message says.
 * @layer Utility
 */

/** The fields the report needs from each collected issue. */
interface ReportableIssue {
  /** Resolved environment variable name, e.g. `DATABASE_URL`. */
  readonly variable: string
  /** Human-readable constraint description, rendered as given. */
  readonly message: string
}

const REPORT_INDENT = '  '
const MIN_VARIABLE_COLUMN = 20
const VARIABLE_GUTTER = 2
const REPORT_HEADER = 'environment validation failed'
const REPORT_FOOTER = 'Fix the variables above and restart the process.'

/**
 * Describe the issue count with a correctly pluralized noun.
 *
 * @param count - Number of collected issues.
 * @returns The count and its agreeing noun, e.g. `1 issue` or `3 issues`.
 */
function pluralizeIssues(count: number): string {
  const noun = count === 1 ? 'issue' : 'issues'
  return `${count} ${noun}`
}

/**
 * Compute the padded width of the variable-name column.
 *
 * Grows to fit the longest variable name but never falls below a minimum, so a
 * gutter always separates the name from the constraint description.
 *
 * @param issues - The issues to be rendered.
 * @returns The column width, in characters, including the trailing gutter.
 */
function computeColumnWidth(issues: ReadonlyArray<ReportableIssue>): number {
  // A per-element loop (not Math.max(...spread)) avoids a RangeError when the
  // issue list is very large, so a validation failure never becomes a crash.
  let longest = MIN_VARIABLE_COLUMN
  for (const issue of issues) {
    longest = Math.max(longest, issue.variable.length)
  }
  return longest + VARIABLE_GUTTER
}

/**
 * Render one aligned report line for a single issue.
 *
 * @param issue - The issue to render.
 * @param columnWidth - Shared variable-column width for alignment.
 * @returns The indented, padded `variable + message` line.
 */
function formatIssueLine(issue: ReportableIssue, columnWidth: number): string {
  return `${REPORT_INDENT}${issue.variable.padEnd(columnWidth)}${issue.message}`
}

/**
 * Format the aggregated error report.
 *
 * Produces the multi-line message body: a header stating the issue count, one
 * aligned line per issue, and a closing fix instruction. The output is pure,
 * and every character it contributes around the issue fields is a constant, so
 * it introduces no source value; it renders the descriptions it is given.
 *
 * @param issues - The collected issues, in report order.
 * @returns The formatted report body used as the error message.
 * @example
 * ```typescript
 * formatIssueReport([
 *   { variable: 'DATABASE_URL', message: 'missing required value (expected: url)' }
 * ]);
 * // "environment validation failed (1 issue)\n\n  DATABASE_URL ..."
 * ```
 */
export function formatIssueReport(issues: ReadonlyArray<ReportableIssue>): string {
  const columnWidth = computeColumnWidth(issues)
  const lines = issues.map((issue) => formatIssueLine(issue, columnWidth))
  const header = `${REPORT_HEADER} (${pluralizeIssues(issues.length)})`
  return [header, '', ...lines, '', REPORT_FOOTER].join('\n')
}
