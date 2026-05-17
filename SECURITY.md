# Security policy

## Reporting a vulnerability

`@env-kit/node-settings` is maintained by a single developer
([@Changsik00](https://github.com/Changsik00)). Please send security
reports privately rather than opening a public issue:

- **Email:** lowmans00@gmail.com
- **Subject prefix:** `[security] @env-kit/node-settings ...`
- **GitHub:** the [private vulnerability reporting](https://github.com/Changsik00/node-settings/security/advisories/new) page if you prefer a tracked workflow.

Please include, when possible:

- A description of the issue and the impact you expect.
- A minimal reproduction (config / env / commands).
- The version (`pnpm ls @env-kit/node-settings` or the `package.json`
  entry).

## Response timeline

This is a side-maintained OSS project, not a vendor product — so I
can't promise a strict SLA. What I will commit to:

- **Acknowledge** the report within a few business days.
- **Assess** severity and reach back with next steps once I've had a
  chance to reproduce.
- **Coordinate disclosure** with you before any public fix lands.

If you don't hear back within a week, please re-send — email
filters occasionally swallow things.

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| `1.x`   | Yes (current line) |
| `0.x`   | Best effort during the v1 transition; no fixes after v1.1.0. |

Security fixes ship as patch releases on the current minor line.

## Scope

In scope:

- Anything that lets unintended code or values reach the validated
  `settings` object at runtime.
- Anything that lets a client-bundled `defineClientEnv` smuggle a
  server-only secret past its prefix gate.
- CLI behaviour that could leak secrets through stdout / generated
  files (e.g. a generator that prints a value flagged secret).
- Supply-chain regressions in the published tarball (extra files,
  missing files, unexpected `package.json` exports).

Out of scope (won't be treated as a vulnerability):

- Misconfiguration in *user* code that exposes secrets — the library
  reads what `process.env` contains; secret hygiene at the platform
  level is the operator's responsibility.
- The `node-settings inspect` CLI deliberately *can* print
  non-secret-flagged perEnv values. Mark a key secret if you don't
  want it in inspect output.
- Theoretical issues with no demonstrated impact path.

## Credit

Reporters who follow this policy will be credited in the release
notes for the fix unless they prefer to remain anonymous.
