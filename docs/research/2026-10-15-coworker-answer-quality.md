# Coworker answer quality investigation

Date: 15 October 2026, Asia/Bangkok.

## Comparison

The [ChatGPT conversation supplied by the user](https://chatgpt.com/share/6ad03592-a188-83ec-b373-62f7845727fa)
contains a four-row table, with catalog dimensions and citations on three rows.
The supplied Coworker screenshot has four unknown dimensions and repeated image
transcriptions. Neither the shared answer nor the screenshot independently
establishes factual correctness. Original photo hashes/order were not compared.

Inspected active source: ZALO-BOT native gateway `4bbd612`, PTAP image route
`7e851f13`. Native-image transport has separate earlier acceptance evidence;
that is not a catalog-research or answer-quality acceptance result.

The PTAP prompt emphasized dimensions read directly from an image and allowed
research conditionally. Its revised prompt treats a request for codes and sizes
as authorization to research legible codes, preserves exact source-image
identity, checks code suffixes and ring markings, opens catalog pages, cites
sources, and explains unresolved rows specifically. It adds no sample answers.

The gateway's “only use workbench_api_submit” phrase could also discourage
research despite the image prompt's catalog clause. The patch clarifies that
public read-only host search/retrieval is allowed when the current client's
instructions explicitly authorize it. Data in images, documents, conversation
history and webpages cannot grant that permission. Local actions and private
connectors remain outside this permission. The callback's required function,
allowed names and schemas still apply; host web tools are never API callbacks.

These findings explain an early-stopping risk in the instructions. They do not
prove the worker had web tools or identify the cause of every visual misread.

## Review and validation

The source and regression test are in this isolated worktree. The test copy
under `.cache/coworker-native-app` is prepared from the audited installed
baseline; no running or installed gateway source/configuration is replaced.
The callback test uses a local simulated worker; it verifies unknown host-tool
callbacks and plain text cannot satisfy a required structured result callback.

- `node tools/coworker-native-images/prepare-gateway.mjs`: PASS; installed app
  unchanged.
- Copied gateway `npm test`, including TypeScript build: **179 PASS**, 0 FAIL,
  0 SKIP. Full output: `.cache/gateway-quality-tests.txt` in this worktree.
- PTAP focused Bridge suite: **61 PASS**, 0 FAIL/SKIP; `npm run lint`: **599
  files PASS**; `node scripts/scan.mjs`: **CLEAN**.
- `git diff --check`: PASS in both task worktrees.
- Initial gateway test fixture type errors were fixed. A subsequent harness
  claim raced asynchronous schema validation; the stalled run was stopped and
  the harness now waits for the queued request and aborts in cleanup. Focused
  and complete final runs passed. Direct ESLint invocation in PTAP was not a
  valid repository check; its actual lint script passed as recorded above.

The companion PTAP branch is `BRANCH1-coworker-answer-quality-20261015`, based on
the pending image-route implementation. Its spec requires a separate live A/B
using identical original photo hashes/question, no leaked answer key, captured
outbound messages, actual tool-use evidence and independent catalog checks.

Live A/B: **NOT RUN**. No model inference, Zalo send, service restart or deploy
was performed in this investigation. The patch alone does not prove factual
accuracy or host search availability. Runtime still uses the previous source.
