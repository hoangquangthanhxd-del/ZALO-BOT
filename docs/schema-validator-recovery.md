# Schema validator bootstrap and execution

The 18 October Test AI investigation reproduced HTTP 400 `tool_schema_timeout`
before provider dispatch, including with one tiny boolean tool schema. Later
probes passed after the host recovered. This is an intermittent failure, not
evidence that every schema or every model call fails. No Production process was
restarted during diagnosis.

The current validator starts a new isolated worker and loads three Ajv dialects
inside the same two-second clock used to contain untrusted schema compilation
and regular expressions. Trusted module startup can therefore exhaust the
execution budget before validation begins. Readiness endpoints do not exercise
this path. DeepSeek HTTP 402 is an independent upstream balance failure.

Acceptance criteria:

- Worker startup has a separate bounded readiness handshake. No untrusted
  schema or arguments are posted before readiness.
- The existing two-second compilation/execution deadline, four-worker capacity,
  resource limits and all schema/data validation protections remain enforced.
- Startup failure is `tool_schema_unavailable` / HTTP 503, with no provider
  dispatch; invalid schema and actual execution timeout keep their existing
  rejection behavior.
- Every completion, timeout and worker failure terminates its own worker and
  releases capacity. No worker/cache reuse or bypass of schema validation.
- Patch preparation audits the original tool-schema source before copying the
  replacement. Tests run on the isolated copied gateway, never the installed or
  active application.
- The new baseline preserves the installed CRLF bytes using a file-specific
  Git attribute, so an exact byte audit remains reproducible after checkout.

Deployment and a real model/widget acceptance probe remain separate operations.

## Validation

- `node tools/coworker-native-images/prepare-gateway.mjs`: baseline audit PASS;
  only the ignored copied application was prepared.
- Copied application `npm test`: **185 PASS, 0 FAIL, 0 SKIP**, including its
  TypeScript build and public protocol, tool policy, callback, native-image,
  cancellation and pathological-regex tests.
- Six focused startup/execution tests PASS. The first pre-implementation run
  failed because the separated validator factory did not exist. The delayed
  bootstrap regression keeps a 20 ms execution budget while trusted startup
  takes 60 ms; real workers still reject remote references and wrong arguments.
- Initial direct ESLint found three inherited errors in `app.ts` (`no-empty`,
  two `no-explicit-any`), reproduced on the exact baseline. The continuation
  documents the credential catch and uses the WebSocket handler's inferred
  types. Direct ESLint now PASS for all four changed TypeScript files. The full
  copied application build and **185 tests PASS again** after these two edits;
  initial failed checks remain recorded. No lint rule or CI workflow was
  disabled. The local pre-commit hook requires unavailable `bunx`; the direct
  checks and copied application tests were run instead.
- A tiny valid tool schema was rejected by the running gateway with HTTP 400
  `tool_schema_timeout`. Later invalid-message probes with valid ROUTE/NOTES/
  FINAL schemas passed schema validation in 206–268 ms and stopped at the
  intentionally invalid message field, without model dispatch. The failure is
  intermittent. Historical logs do not identify which startup operation was
  slow, and no claim is made that disk or CPU pressure was its sole cause.

No installed source, active gateway, configuration, credentials, worker
selection, permissions, scheduled task or Production process was changed.

## Handoff

- Gateway [PR #4](https://github.com/hoangquangthanhxd-del/ZALO-BOT/pull/4), source
  commit `c4a5675`, is open and not merged. No hosted check/run was created when
  inspected; local tests are not reported as hosted CI PASS.
- Client [PR #277](https://github.com/hoangquangthanhxd-del/PTAP-NEXT/pull/277)
  contains the provider categories, routing deadline, date checks and image
  guidance. Its CI run `39098498628` reports FAILURE because account billing/
  spending limits prevented jobs from starting, not an executed test result.
- After the user's DeepSeek top-up, the synthetic today-order route passed in
  3298 ms with `DEEPSEEK_PRO`, without fallback. The client trace identifies a
  real accepted DeepSeek inference; top-up does not deploy this gateway patch.
- No merge SHA or post-deployment acceptance result exists for this task.
