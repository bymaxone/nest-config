# Security Policy

`@bymax-one/nest-config` validates `process.env` once at bootstrap and exposes a
deep-frozen typed configuration object to the rest of the application. Its hard
security contract is that no raw environment value ever appears in a thrown
error, a report, or a serialized output. We take vulnerability reports seriously
and triage them ahead of feature work.

## Supported versions

Security patches are issued only for the latest minor release.

| Version | Status                          |
| ------- | ------------------------------- |
| `1.2.x` | Active, receives security fixes |
| `< 1.2` | Unsupported, upgrade            |

Earlier versions receive no fixes and no backports. If you are on one, upgrade
to the latest `1.2.x` release.

## Reporting a vulnerability

**Do not report security issues through public GitHub Issues, Discussions, or
pull requests.** Public reports give attackers a window between disclosure and
patch deployment.

Use GitHub Private Vulnerability Reporting, which is enabled on this repository:

[Open a private security advisory](https://github.com/bymaxone/nest-config/security/advisories/new)

If you cannot use the GitHub form (for example, you do not have an account),
email **support@bymax.one** with `[security] @bymax-one/nest-config` in the
subject line.

### What to include

A useful report contains:

- A clear description of the vulnerability and its impact (confidentiality,
  integrity, availability)
- Step-by-step reproduction against the latest `1.2.x` release
- The affected subpath (`.` or `./testing`)
- A suggested fix or mitigation, if you have one
- Whether you would like to be credited in the published advisory, and how
  (name, handle, affiliation)

### Response timeline

| Phase                                  | Target                            |
| -------------------------------------- | --------------------------------- |
| Acknowledgement of receipt             | within 72 hours                   |
| Initial assessment and severity rating | within 7 days                     |
| Coordinated fix for Critical / High    | within 90 days of acknowledgement |
| Coordinated fix for Medium / Low       | best effort, tracked in advisory  |

We follow [coordinated vulnerability disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure)
and publish the advisory only after a fixed version is on npm, unless active
exploitation forces an earlier publication.

Reporters are credited in the GitHub Security Advisory and CHANGELOG entry
unless they request anonymity.

## Threat model: same-process code

Code that runs in the same process as the library is trusted, as it is in Node itself: it can already read
`process.env`, replace any built-in and call any function the library calls. The checks the library makes
against such code are best-effort hardening that narrows the common accidents, not a security boundary, and
a report whose attacker must already run code in the process is not a vulnerability in this package. Known
limits, in one line: a data `then` planted on `Object.prototype` during a host call can still be followed,
the built-ins the options are copied with are read live after the options factory returns, a Proxy placed
in the prototype chain of a value a host returned answers to host code (a Proxy whose prototype is itself makes the
lookup of its `then` loop), a thenable that resolves with itself, or two that resolve with each other,
never settles (a native `await` behaves the same way), and a throwing
`Promise[Symbol.species]` planted during a call refuses the result of a frozen promise. Under a hijack of
`Promise.prototype` in the same turn, Nest's own awaits are hijacked as well, and a compile can succeed with
`BYMAX_CONFIG` set to `null` because Nest swallows the rejection of the factory promise. A setter on
`Object.prototype` can still replace a validated value in the root that zod builds.

## In-scope vulnerabilities

The following classes are explicitly in scope:

- **Raw value leakage** - any path where a validation error, log line, or
  serialized report echoes a source environment value instead of the sentinel
  redaction the package guarantees
- **Type confusion in the frozen config** - a mutation path that bypasses the
  deep-freeze guarantee on the exposed configuration object
- **Schema bypass** - input that should fail Zod validation but is accepted and
  reaches application code
- **Bundle supply-chain integrity** - compromised dependency, malicious
  typosquat, tampered release artifact
- **CodeQL `security-extended` alerts** - anything the automated scan surfaces
  in the Security tab

## Out of scope

These are not vulnerabilities in `@bymax-one/nest-config` itself:

- Issues only reproducible in versions older than the latest `1.2.x` release
- Misconfigurations in the consuming application, such as logging the typed
  config object's contents directly instead of through the package's error
  reporting path
- Issues in peer dependencies (`@nestjs/common`, `@nestjs/core`,
  `reflect-metadata`, `zod`) when the upstream maintainer has already accepted
  them or when the dependency is not exercised by the library
- Self-XSS, social engineering, denial of service via legitimate authenticated
  load
- Theoretical attacks without a practical demonstration
- Attacks that need code running in the same process as the library (see the threat model above)

## Security best practices for consumers

Pin the package to an exact version in production, verify the publish
provenance (`npm audit signatures`), and subscribe to the repository's
security advisories so you receive notifications when a CVE is published.

## Acknowledgements

We are grateful to the security community and to every reporter who takes the
time to investigate and disclose responsibly.
