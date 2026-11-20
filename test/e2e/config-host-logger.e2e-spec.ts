/**
 * End-to-end spec for a host logger whose `error` returns a rejected promise.
 *
 * Layer: e2e.
 * Goal: measure, in a child process and through Nest's real `Logger`, what a rejection returned by
 * a host logger does. The README says it is outside what the module can observe: Nest drops the
 * returned promise, so the rejection is unhandled and ends the process unless the host handles it.
 * A jest listener on `unhandledRejection` cannot prove this, because the test environment never
 * delivers that event to it, so the effect is read from the child's exit status instead.
 * Mocks: none. The child boots the BUILT artifact.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const DIST = resolve(__dirname, '..', '..', 'dist', 'index.cjs')

/**
 * The child: boots an invalid configuration with a host logger installed through Nest's own
 * `setLogger`, then stays alive long enough for a rejection left behind by that logger to
 * surface. Its first argument is `handled` when the logger handles its own rejection.
 */
const CHILD = `
require('reflect-metadata')
const { Test } = require('@nestjs/testing')
const { z } = require('zod')
const { BymaxConfigModule } = require(process.env.DIST)
const handled = process.argv[1] === 'handled'
const host = {
  log() {},
  warn() {},
  error: () => {
    const rejected = Promise.reject(new Error('host logger sink is down'))
    if (handled) rejected.catch(() => {})
    return rejected
  }
}
void (async () => {
  try {
    await Test.createTestingModule({
      imports: [BymaxConfigModule.forRoot({ schema: z.object({ NAME: z.string() }), source: {} })]
    })
      .setLogger(host)
      .compile()
  } catch (error) {
    console.log('BOOT ' + error.constructor.name.replace(/^_/, ''))
  }
  await new Promise((done) => setTimeout(done, 100))
  console.log('ALIVE')
})()
`

/** Runs the child with the given logger mode and returns what it printed and how it ended. */
function boot(mode: 'reject' | 'handled') {
  const run = spawnSync(process.execPath, ['-e', CHILD, mode], {
    encoding: 'utf8',
    timeout: 20_000,
    cwd: resolve(__dirname, '..', '..'),
    env: { ...process.env, DIST }
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

describe('host logger returning a rejected promise (built artifact)', () => {
  /**
   * The validation error is still the boot failure, and the rejection the logger returned is not
   * absorbed: it ends the process with the logger's own error on stderr.
   */
  it('fails the boot with the validation error and then ends the process on the unhandled rejection', () => {
    const outcome = boot('reject')

    expect(outcome.stdout).toContain('BOOT BymaxConfigValidationError')
    expect(outcome.stdout).not.toContain('ALIVE')
    expect(outcome.status).toBe(1)
    expect(outcome.stderr).toContain('host logger sink is down')
  })

  /** The same logger that handles its own rejection leaves the process alive, so the exit above is the rejection's. */
  it('keeps the process alive when the logger handles its own rejection', () => {
    const outcome = boot('handled')

    expect(outcome.stdout).toContain('BOOT BymaxConfigValidationError')
    expect(outcome.stdout).toContain('ALIVE')
    expect(outcome.status).toBe(0)
    expect(outcome.stderr).not.toContain('host logger sink is down')
  })
})
