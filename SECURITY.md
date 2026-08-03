# Security Policy

`@bymax-one/nest-config` validates `process.env` once at bootstrap and exposes a
deep-frozen typed configuration object to the rest of the application. Its hard
security contract is that no raw environment value ever appears in a thrown
error, a report, or a serialized output. We take vulnerability reports seriously
and triage them ahead of feature work.

## Supported versions

Security patches are issued for the most recent minor on the active `0.x` line.
Once v1.0 ships, the support table will be updated.

| Version | Status                          |
| ------- | ------------------------------- |
| `1.0.x` | Active, receives security fixes |
| `< 1.0` | End-of-life                     |

If you are stuck on an older version and need a backport, open a private
advisory (see below) and we will discuss feasibility on a case-by-case basis.

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
- Step-by-step reproduction against the latest `0.x` release
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

- Issues only reproducible in versions older than `1.0.0`
- Misconfigurations in the consuming application, such as logging the typed
  config object's contents directly instead of through the package's error
  reporting path
- Issues in peer dependencies (`@nestjs/common`, `@nestjs/core`,
  `reflect-metadata`, `zod`) when the upstream maintainer has already accepted
  them or when the dependency is not exercised by the library
- Self-XSS, social engineering, denial of service via legitimate authenticated
  load
- Theoretical attacks without a practical demonstration

## Security best practices for consumers

Pin the package to an exact version in production, verify the publish
provenance (`npm audit signatures`), and subscribe to the repository's
security advisories so you receive notifications when a CVE is published.

## Acknowledgements

We are grateful to the security community and to every reporter who takes the
time to investigate and disclose responsibly.
