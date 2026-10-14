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

### Native context and message repair v21

V21 keeps the exact original PNG/JPEG/WebP bytes and source order. It stages
actual image content blocks in the current MCP Apps user message, alongside the
current request text. Structured imageIds remain available for the host. Idle
retained widgets cannot publish empty context. New leases are persisted before
upload; rerenders restore modelContent and imageIds. Unchanged polls do not
continually overwrite context. An uncertain send is never retried through a
second transport.

Copied gateway build and full suite: **177 PASS, 0 FAIL/SKIP**. Fresh randomized
JPEG gates passed on v21: three images in **47.4 s**, then one image in **57.8 s**,
with exact labels, dimensions, visual attributes, grouping and image references.
Both have completed coworker-widget/chatgpt-web audits. Synthetic evidence:

- `evidence/2026-10-14T18-02-54.077Z-3-images.json`
- `evidence/2026-10-14T18-05-51.726Z-1-images.json`

The actual Test AI request at 22:51 resolved four original photos, passed the
photo route before text AI routing, and returned an ANSWER with all four source
references in **100.2 s**. Visual readback confirmed recognizable bearing marks;
unreadable marks and unprovided dimensions were left unknown. This probe
captured all outbound messages locally: **zero actual Zalo sends**. It proves
native vision and request context, not live listener or group delivery.

Earlier failures remain failures: v17/v18/v20 real-photo probes returned missing
image content despite HTTP200 completed callbacks; v18 JPEG and v20 three-JPEG
runs returned empty rows; v19 four-photo PNG staging timed out. V18 PNG synthetic
gates passed but did not establish real-photo acceptance. A temporary JPEG/PNG
conversion experiment was removed; the final Bridge retains original bytes.

The original installed gateway source/configuration is preserved. Owned runs
use copied configuration, distinct audit stores and a verified stop file.
`launch-owned.mjs` defaults to isolated POC mode. Explicit `runtime` mode enables
the existing authenticated API for normal clients. `start-runtime.ps1` requires
the reviewed v21 build, refuses an occupied port, creates a fresh audit run and
streams UTF-8 logs to the user's local PTAP-NEXT directory.

OpenAI documents structured imageIds and its follow-up extension in the
[ChatGPT UI reference](https://developers.openai.com/plugins/build/chatgpt-ui).
MCP Apps defines actual image blocks in the current
[user message](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiMessageRequest.html).

Group delivery verification and controlled PRIMARY activation are still
required. The source feature defaults OFF and can be scoped to Test AI.
