/**
 * Unit tests for the configuration dependency-injection tokens.
 *
 * Layer: unit.
 * Goal: prove both tokens are Symbols, are distinct from each other, carry
 * descriptive labels, and are module-local (absent from the global symbol
 * registry) so their identity can never collide with another provider token.
 * Mocks: none.
 */

import { BYMAX_CONFIG, BYMAX_CONFIG_OPTIONS } from './config.tokens'

describe('configuration DI tokens', () => {
  it('exposes BYMAX_CONFIG_OPTIONS as a symbol', () => {
    /**
     * Options token type.
     *
     * The module wires providers exclusively through Symbol tokens; a string
     * token would risk collision with unrelated providers, so the type itself
     * is part of the contract.
     */
    expect(typeof BYMAX_CONFIG_OPTIONS).toBe('symbol')
  })

  it('exposes BYMAX_CONFIG as a symbol', () => {
    /**
     * Config token type.
     *
     * The frozen validated config is registered under this token; it must be a
     * Symbol for the same collision-safety reason as the options token.
     */
    expect(typeof BYMAX_CONFIG).toBe('symbol')
  })

  it('gives the two tokens distinct identities', () => {
    /**
     * Token uniqueness.
     *
     * Options and config are separate providers; sharing an identity would make
     * one overwrite the other in the injector, so they must never be equal.
     */
    expect(BYMAX_CONFIG_OPTIONS).not.toBe(BYMAX_CONFIG)
  })

  it('labels each token with a descriptive description', () => {
    /**
     * Token descriptions.
     *
     * A described Symbol makes injector errors and debugging output legible,
     * naming the exact provider that failed to resolve.
     */
    expect(BYMAX_CONFIG_OPTIONS.description).toBe('BYMAX_CONFIG_OPTIONS')
    expect(BYMAX_CONFIG.description).toBe('BYMAX_CONFIG')
  })

  it('keeps both tokens out of the global symbol registry', () => {
    /**
     * Local, non-global identity.
     *
     * Symbol.for would register a token in the cross-realm global registry,
     * where a foreign package could reconstruct and hijack it. Plain Symbol()
     * keeps the tokens module-local, which Symbol.keyFor proves by returning
     * undefined for a non-registered symbol.
     */
    expect(Symbol.keyFor(BYMAX_CONFIG_OPTIONS)).toBeUndefined()
    expect(Symbol.keyFor(BYMAX_CONFIG)).toBeUndefined()
  })
})
