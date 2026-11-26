/**
 * @fileoverview The generated message of a failed constraint. It is built from the structural fields of a
 * Zod issue, which a rule can fill itself when it raises one, so it is withheld when a field holds the
 * value of the issue's variable or is a declared variable's value whole. Every rule of that comparison
 * is in this file.
 * @layer Utility
 */

import type { z } from 'zod'

import { holds } from './captured'

/** A single issue as produced by a failed Zod parse. */
type ZodValidationIssue = z.ZodError['issues'][number]

/** Renders one field of an issue for the message. */
type Show = (field: unknown) => string

/** Whether the source value of some variable the schema declares passes the test. */
export type SomeDeclared = (test: (value: unknown) => boolean) => boolean

/**
 * Describe a Zod issue by its structural constraint fields (expected type, bounds, format, enum options).
 * Every field that reaches the text goes through `show`, so the text searched is the text printed.
 *
 * @param issue - The issue.
 * @param show - Renders a field.
 * @returns The expected constraint.
 */
function describeConstraint(issue: ZodValidationIssue, show: Show): string {
  switch (issue.code) {
    case 'invalid_type':
      return `invalid value (expected: ${show(issue.expected)})`
    case 'invalid_format':
      return `invalid format (expected: ${show(issue.format)})`
    case 'invalid_value':
      return `invalid value (expected one of: ${show(issue.values.map(show).join(', '))})`
    case 'too_small':
      return issue.origin === 'string'
        ? `too short (expected: string, minimum ${show(issue.minimum)} characters)`
        : `out of range (expected: ${show(issue.origin)} >= ${show(issue.minimum)})`
    case 'too_big':
      return issue.origin === 'string'
        ? `too long (expected: string, maximum ${show(issue.maximum)} characters)`
        : `out of range (expected: ${show(issue.origin)} <= ${show(issue.maximum)})`
    default:
      return 'invalid value'
  }
}

/**
 * The text a source value reads as. A source can hold a value outside its type, and a primitive one
 * has a text that runs no host code to obtain; an object has none here.
 *
 * @param value - The source value.
 * @returns The text of a string, number, bigint or boolean, otherwise undefined.
 */
function textOfValue(value: unknown): string | undefined {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'bigint':
    case 'boolean':
      return `${value}`
    default:
      return undefined
  }
}

/**
 * Whether a field repeats a source value.
 *
 * The value of the issue's own variable counts anywhere inside the field's rendering. A declared
 * variable's value counts when the field is it, or is its text, whole: a short value is part of many
 * constraints, so it is not searched for, and a numeric bound is not the text a source string holds.
 * An empty value counts for neither, since every text holds it, and neither does a field the issue
 * lacks. Variables the schema does not declare are not compared: the source is the whole environment
 * by default, and no rule receives them through the parse.
 *
 * @param field - The field as the issue holds it.
 * @param text - The field as it is printed.
 * @param own - The value of the issue's variable, or undefined when it has none.
 * @param someDeclared - Tests the declared variables' values.
 * @returns True when the field must not be printed.
 */
function repeatsSource(
  field: unknown,
  text: string,
  own: unknown,
  someDeclared: SomeDeclared
): boolean {
  const searched = textOfValue(own)
  if (searched !== undefined && searched !== '' && holds(text, searched)) return true
  if (field === undefined || field === '') return false
  return someDeclared((value) => value === field || textOfValue(value) === field)
}

/**
 * The generated message of an issue, which states the expected constraint.
 *
 * @param issue - The Zod issue.
 * @param own - The value of the issue's variable, or undefined for a rule that names no leaf.
 * @param someDeclared - Tests the declared variables' values.
 * @returns The constraint, or `invalid value` when a field is withheld.
 */
export function constraintMessage(
  issue: ZodValidationIssue,
  own: unknown,
  someDeclared: SomeDeclared
): string {
  let repeats = false
  const message = describeConstraint(issue, (field) => {
    const text = String(field)
    if (repeatsSource(field, text, own, someDeclared)) repeats = true
    return text
  })
  return repeats ? 'invalid value' : message
}
