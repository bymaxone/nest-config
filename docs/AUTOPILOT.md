# Autopilot Config - @bymax-one/nest-config

> Per-project parameters for /bymax-workflow:autopilot. Reviewed and
> approved by the operator before the first run. The planning docs own WHAT
> to build; this file owns HOW the chain runs.

## Identity

- **Project root**: /Users/maximiliano/Documents/MyApps/bymax-one/nest-config
- **GitHub repo**: bymaxone/nest-config (visibility: private, must become public before phase 7)
- **Default branch**: main
- **Product summary**: Public npm package `@bymax-one/nest-config`, the typed
  and validated environment-configuration entry point for NestJS 11 apps.
  Validates `process.env` exactly once at bootstrap against a Zod v4 schema,
  fails fast with one aggregated value-free error report, and exposes a
  deep-frozen typed config via DI. Defining constraint: zero runtime
  dependencies (NestJS, reflect-metadata, and zod are required peers) and a
  hard "raw values never appear in errors" security contract.
- **Roadmap file**: docs/development_plan.md
- **Tasks index**: docs/tasks/README.md
- **Phases**: 8 phases / 39 tasks (phase files docs/tasks/phase-NN-*.md)

## External preconditions

| Applies to | Check (exit 0 = OK)                                                                       | On failure                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| launch     | `command -v pnpm && pnpm --version`                                                       | STOP - operator installs pnpm                                                                         |
| launch     | `node -e "process.exit(process.versions.node.split('.')[0] >= 24 ? 0 : 1)"`               | STOP - engines require Node 24                                                                        |
| phase 7    | `test "$(gh repo view bymaxone/nest-config --json visibility -q .visibility)" = "PUBLIC"` | mark P7 ⛔ blocked on repository publication (provenance, CodeQL, Scorecard need a public repo), STOP |
| phase 7    | `npm ping --registry https://registry.npmjs.org`                                          | mark P7 ⛔ blocked on registry reachability, STOP                                                     |

No Docker or Testcontainers anywhere: the e2e suite (P6) boots an in-process
fixture application against the packed tarball.

## Model policy

| Phase | Model   | Rationale                                                                                                                  |
| ----- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0     | sonnet  | mechanical scaffold on a fully specified checklist, mirrored from sibling repos (nest-logger, nest-cache)                  |
| 1     | inherit | first contact with the Zod v4 schema API (defineEnv, meta registry, inference) - invented APIs are the failure mode        |
| 2     | inherit | security-sensitive: the value-free aggregated error model is the package's hard security contract                          |
| 3     | inherit | first contact with NestJS 11 ConfigurableModuleBuilder/setExtras semantics; fail-fast bootstrap wiring                     |
| 4     | inherit | template-literal Path/PathValue type utilities and compile-time assertion tests; subtle type-level work                    |
| 5     | inherit | constraint-aware placeholder synthesis requires introspecting Zod v4 schema internals - invented APIs are the failure mode |
| 6     | sonnet  | docs, e2e fixtures, and budget calibration on a frozen public surface                                                      |
| 7     | inherit | final hardening/audit phase: mutation-survivor analysis, release with provenance                                           |

Fix sub-agents always escalate to inherit when a phase stalls on review/CI
findings.

**Heavy phases** (silent-death watch widened to ~120 min): 7 (Stryker
mutation runs over the full suite).

## Gates

| Gate (local command)                                                                                                      | Active from                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `pnpm install --frozen-lockfile` (clean resolution)                                                                       | phase 0                                           |
| `pnpm typecheck`                                                                                                          | phase 0                                           |
| `pnpm lint`                                                                                                               | phase 0                                           |
| `pnpm build` (ESM + CJS + d.ts for both subpaths `.` and `./testing`)                                                     | phase 0                                           |
| `pnpm test` (jest, `maxWorkers: '50%'`, 100% line/branch/function/statement via `coverageThreshold` in BOTH jest configs) | phase 1                                           |
| `node scripts/dogfood-smoke-test.mjs` (packed tarball resolves both subpaths in ESM and CJS)                              | phase 5                                           |
| `node scripts/check-size.mjs` (provisional budgets from P0, recalibrated in P6)                                           | phase 6                                           |
| `pnpm test:mutation` (Stryker, high 99 / low 95 / **break 95**)                                                           | phase 7 only - pre-release gate, never per-commit |

**Expected-skip CI checks**: `codeql` and `scorecard` workflows may report
skipped/inactive while the repository is private; they count as pass until
the repo goes public (required by phase 7).

## Invariant greps

Each command must print nothing. Run them phase-wide before every push.

```bash
# process.env is read only where the module's default source is bound
grep -rn "process\.env" src/ --include='*.ts' | grep -v "config.module.ts"

# no suppression comments, ever
grep -rnE "@ts-ignore|@ts-expect-error|eslint-disable" src/

# banned imports: dotenv and bare (non node:) builtins
grep -rnE "from ['\"]dotenv['\"]|require\(['\"]dotenv['\"]\)|from ['\"]crypto['\"]" src/

# timeless comments: no plan-stage references in committed code
grep -rniE "phase[- ][0-9]|\bP[0-7]\.[0-9]|task[- ][0-9]" src/

# no em dashes in code or docs
grep -rn "—" src/ README.md CHANGELOG.md

# no placeholder files
find . -name ".gitkeep" -o -name ".keep" | grep -v node_modules
```

## Security invariants & review focus

- **Value-free errors (hard contract, spec §6.1)**: no raw source value ever
  appears in any error `message`, in the formatted report, or in serialized
  error output. Not truncated, not masked - absent. Tests assert it with
  sentinel values. Any leak is a CRITICAL finding.
- **Zero runtime dependencies**: `package.json` ships `"dependencies": {}`.
  Anything added there is a gate failure, not a judgment call.
- **Immutability**: the registered config object is deep-frozen; mutation
  attempts throw in strict-mode tests.
- **The `onValidationError` hook can observe, never suppress**: the
  validation error still propagates when the hook throws or returns normally.
- **Explicit DI only**: `@Inject(token)` at every injection site, tokens are
  `Symbol`s, build has no `emitDecoratorMetadata`, no `@Global()` decorator
  (globality flows through builder extras only).
- **Import hygiene**: only `node:`-prefixed builtins; `dotenv` and bare
  `crypto` are banned via ESLint restricted imports.
- **No credentials in the repo**: release publishes from CI via OIDC
  provenance; no npm tokens on disk or in workflow secrets beyond OIDC.

Per-phase review focus for the security-sensitive phases:

- **P2**: adversarial review of every error/report/serialization path for
  value leakage, including `JSON.stringify` of the error and issue objects.
- **P3**: bootstrap must fail before a port binds on invalid config; hook
  wiring cannot swallow the throw; source injection cannot widen access.
- **P7**: mutation survivors in the error-reporting and freeze paths get
  priority; equivalents documented, never blanket-disabled.

## Review bot

- **Reviewer**: `copilot-pull-request-reviewer[bot]` (request with
  `gh pr edit <PR#> --add-reviewer copilot-pull-request-reviewer[bot]`).
  The org-wide `copilot-code-review` ruleset also auto-requests it.
- **Review-bot timeout**: 15 minutes - a request pending this long with no
  review submitted is treated as bot-unresponsive: the request is removed,
  a factual PR comment records it, and the gate proceeds CI-only (the
  implementer's zero-findings review floor already ran before the PR).

## Merge policy

- **Method**: squash (delete branch on merge - always)
- **Grace window**: 5 minutes since last push
- **Review-bot timeout**: 15 minutes (see Review bot above)
- **Stall limit**: 3 full fix cycles on the same phase → 🟡/⛔ + notify + STOP

## Custom conventions

- **Branch naming**: `feat/phase-NN-<slug>` created with `git switch -c`
  (never `git checkout -b`).
- **Commit format**: `<type>(config): <subject> (<phase>.<task>)` - task ids
  are allowed in commit subjects (tasks README convention), never in code
  comments. No attribution trailers of any kind.
- **One PR per phase; the implementer never merges.** The tasks README's
  phase-close step ("merge the PR") is executed by the orchestrator, not the
  implementer - the autopilot architecture override wins.
- **Token economy** (tasks README): implementers read only their task block
  and the REQUIRED READING sections; never load the whole spec, plan, or a
  sibling library wholesale.
- **Sibling prior art**: repository layout, configs, and workflows are
  adapted from the local checkouts at
  `/Users/maximiliano/Documents/MyApps/bymax-one/nest-logger` and
  `/Users/maximiliano/Documents/MyApps/bymax-one/nest-cache` - copy the
  specific file a task references, adapt, never invent.
- **Official-docs-first**: Zod v4 and NestJS 11 APIs are confirmed against
  current official documentation (context7) before implementation, never
  from memory.
- **Bounded tests**: jest `maxWorkers: '50%'` baked into both configs; one
  suite at a time; never run this package's tests concurrently with another
  package's suites on this machine.
- **No em dashes** anywhere in code or docs. **No `.gitkeep`/placeholder
  files or pre-created empty directories.**
- **English only** in identifiers, comments, JSDoc, commits, and docs.
