# Coworker native-image POC

Isolated transport implementation for the approved Zalo reply-album workflow.
This directory is a reproducible patch kit for the installed Coworker application,
not a second Zalo listener or a Production release.

## Implementation

- `prepare-gateway.mjs` checks the exact audited baseline and copies the existing
  gateway into `.cache/coworker-native-app`. Installed source is never overwritten.
- `gateway-src/widget-images.ts` validates PNG/JPEG/WebP data URLs, signatures,
  unique source IDs, up to ten images and 10 MiB combined decoded bytes. Remote
  URLs and local paths are rejected; the caller resolves authorized Zalo photos.
- Image bytes are removed from the JSON prompt and stored with the active turn.
  `workbench_api_read_request` returns one real MCP image per `image_index` and
  preserves the old text-only result. Completion, cancellation and shutdown
  revoke access to the turn's image buffers.
- Widget v16 reads those exact images, uses ChatGPT `uploadFile` with
  `library:false`, and stages the returned `imageIds` in structured widget state.
  It triggers a new turn using MCP Apps `ui/message` without replacing the staged
  file context or retrying through the compatibility alias.
- The original text-only transport, lease ownership, late callbacks and
  uncertain-send rules remain in place. A native job never runs an action tool
  or creates a PTAP order, purchase or catalog entry.

The file-ID path follows the documented [ChatGPT widget image state](https://developers.openai.com/plugins/build/chatgpt-ui).
Local schema/MCP tests cannot establish whether a live host delivers images to
vision; that requires the separate randomized-image gate.

## Reproduce local tests

Run from the ZALO-BOT worktree while its owned POC process is stopped:

```powershell
node tools/coworker-native-images/prepare-gateway.mjs
cd .cache/coworker-native-app
npm run build
npm test
```

Dependencies are reused via a junction to the existing installed package. The
patch kit aborts if baseline source has changed or an owned POC is still running.
The copied gateway remains ignored by Git; only source snapshots, tests and
scripts in this directory belong in a commit.

## Live test ownership

`launch-owned.mjs ABSOLUTE_FRESH_RUN_DIRECTORY` starts the copied application in
a hidden process, copies the existing configuration into the ignored run folder
and controls its child through private Node IPC. Use a fresh run directory each
time. Port 3211 must be free because the existing secure tunnel targets it.

The test instance rejects unmarked inference requests. `run-live.mjs` adds the
POC marker and uses the existing dedicated POC API key. Keys, copied settings,
provider data and raw runtime files remain in `.cache`; do not commit them.

Create a `stop` file in that run directory to close only the owned child and its
tunnel gracefully; verify `stopped.json` before starting another instance. Never
kill unrelated Node processes or overwrite the installed configuration.

Open a separate ChatGPT worker conversation, refresh Coworker tool metadata
after the widget URI changes, activate it and verify the visible version and
gateway heartbeat before submitting inference. File upload support must be
available in that host. Do not broaden plugin permissions as a workaround.

```powershell
node tools/coworker-native-images/run-live.mjs ABSOLUTE_FIXTURES_DIRECTORY 1 ABSOLUTE_RUN_DIRECTORY
# Only after the one-image gate succeeds:
node tools/coworker-native-images/run-live.mjs ABSOLUTE_FIXTURES_DIRECTORY 3 ABSOLUTE_RUN_DIRECTORY
```

Generate fresh fixture bytes before starting a new transport experiment:

```powershell
node tools/coworker-native-images/generate-fixtures.mjs ABSOLUTE_FRESH_FIXTURES_DIRECTORY
```

`generate-fixtures.mjs` reuses Sharp from the existing PTAP-NEXT bridge package.
The generator refuses an existing fixture manifest. No expected answer is sent
to Coworker. The launcher restricts run directories to fresh
`.cache/coworker-native-run[-N]` directories and refuses an existing directory.

The live runner reads `request.json` and selected images first. It reads
`expected.local.json` only after the model returns; no subsequent inference
receives that answer key. PASS requires the exact random codes, dimensions,
shape/color, source-image grouping and completed coworker-widget/chatgpt-web
audit. HTTP 200, readiness or a local test callback alone is insufficient.

If a failed transport has already exposed files in a worker conversation, use
fresh randomized fixtures for the next transport experiment. Keep all failed
runs and classify transport timeouts separately from semantic failures.

## Integration boundary

Do not attach the Zalo handler until the live one-image and three-image gates
have passed. Then implement the read-only route in a separate PTAP-NEXT worktree
from current `origin/main`, reuse album/quote/downloader helpers, keep its feature
flag OFF, and resolve the purchase-tag routing overlap before group UAT.

Refreshing the development plugin metadata changes the widget URI expected by
ChatGPT. On rollback to the installed v14 gateway, refresh the metadata back to
v14 as well; preserving source alone does not restore the host's cached tools.

## Verified evidence

### Native context repair v18

The Test AI real-photo probe returned completed HTTP200 callbacks but explicitly
reported unavailable image content. Those probes failed vision acceptance.
The v17 candidate preserves native imageIds on reminders, restores them after
rerender, and prevents an observing render without uploaded IDs from clearing
the active image context. It keeps the v16 resource as an upgrade alias.
The exact original-photo path and completed audit remain mandatory; do not use
metadata or an old synthetic answer as a substitute for visible images.

V17 local suite passed 170 tests, but its live three-image run returned empty
rows and the four-photo Test AI probe still reported no visible images. Its
one-image run only passed after a reminder. Those failures remain acceptance
failures despite completed HTTP200 callbacks.

V18 persists a new native request/lease before uploading files, so a render
during upload restores the current request instead of publishing the old idle
state. It restores modelContent as well as imageIds, avoids rewriting identical
state on every poll, and orders file staging before the awaited host report and
message dispatch. Regression coverage includes an observer during upload and
dispatch held until that report completes.

Copied gateway build and full suite: **172 PASS, 0 FAIL/SKIP**. Fresh randomized
live one-image and three-image gates both PASS on v18, with exact content,
grouping, image references and completed coworker-widget/chatgpt-web audits.
Observed round trips: **28.6 s** and **35.1 s**. Sanitized synthetic evidence is
retained in `evidence/2026-10-14T17-28-48.399Z-1-images.json` and
`evidence/2026-10-14T17-30-46.112Z-3-images.json`.
The owned v16 run was gracefully stopped with no pending/claimed/draining jobs,
its evidence retained, and a separate copied v17 run was started. Installed
gateway source/configuration was preserved. The worker still needs the new UI
resource before testing. V18 has now been activated and its runtime heartbeat
verified. The real four-photo semantic readback and group delivery are still
required for Zalo acceptance.

OpenAI documents `imageIds` as the files supplied to later model turns through
[structured widget state](https://developers.openai.com/plugins/build/chatgpt-ui).

Full copied gateway suite: **171/171 PASS** after the v16 resource expectations
were updated. Preserved live evidence in `evidence/` shows one-image and
three-image runs with exact random labels, dimensions, grouping and completed
widget provenance. Round trips were 23.2 s and 41.2 s respectively; these are
observations, not a latency guarantee. Earlier MCP-only and follow-up-alias
experiments failed and remain in the ignored local runtime evidence.

The live native gate does not establish Zalo end-to-end delivery or web catalog
accuracy. Those require the separate PTAP integration UAT; the Zalo feature
defaults OFF.
