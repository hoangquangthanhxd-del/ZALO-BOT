import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildServer } from "../src/app.js";
import { WidgetBridge } from "../src/widget-bridge.js";
import { WIDGET_URI } from "../src/widget-mcp.js";
import { WIDGET_CHAT_POLICY } from "../src/widget-chat-policy.js";

test("standalone CoworkerAPI serves its own authenticated ChatGPT MCP widget", async () => {
  const previousApiKeys = process.env.COWORKER_API_KEYS;
  const previousMcpSecret = process.env.COWORKER_MCP_SECRET;
  process.env.COWORKER_API_KEYS = "widget-client-key";
  process.env.COWORKER_MCP_SECRET = "standalone-mcp-key";
  const bridge = new WidgetBridge();
  const app = buildServer(bridge, "legacy-internal-key");
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: "standalone-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: "Bearer standalone-mcp-key" } },
  });
  try {
    const unauthorized = await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(unauthorized.status, 401);
    for (const method of ["GET", "DELETE"]) {
      const unauthenticated = await fetch(`${base}/mcp`, { method });
      assert.equal(unauthenticated.status, 401);
      const unsupported = await fetch(`${base}/mcp`, {
        method, headers: { Authorization: "Bearer standalone-mcp-key", Accept: "text/event-stream" },
      });
      assert.equal(unsupported.status, 405, `${method} must not advertise a missing MCP endpoint`);
      assert.equal(unsupported.headers.get("allow"), "POST");
    }
    assert.equal(bridge.active, false, "Transport probes cannot stand in for a real widget heartbeat");
    await client.connect(transport);
    const tools = await client.listTools();
    for (const name of ["workbench_api_activate", "workbench_api_poll", "workbench_api_read_request", "workbench_api_submit"]) {
      assert.ok(tools.tools.some((tool) => tool.name === name), name);
    }
    const activate = tools.tools.find((tool) => tool.name === "workbench_api_activate");
    assert.equal((activate?._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri, WIDGET_URI);
    const resource = await client.readResource({ uri: WIDGET_URI });
    const html = resource.contents[0];
    assert.ok(html && "text" in html);
    assert.match(html.text, /sendFollowUpMessage/);
    const opened = await client.callTool({ name: "workbench_api_activate", arguments: {} });
    const widgetId = (opened.structuredContent as { widget_id: string }).widget_id;
    assert.match(widgetId, /^[a-f0-9-]{36}$/i);
    assert.deepEqual(opened.structuredContent, { status: "opening", widget_runtime: "bridge-v18", widget_id: widgetId });
    assert.equal(bridge.active, false, "Opening selects a worker but cannot fake its heartbeat");
    assert.equal(bridge.snapshot().ui.activations, 1);
    assert.equal(bridge.snapshot().ui.resourceReads, 1);
    const legacy = await client.readResource({ uri: "ui://coworkerapi/bridge-v1.html" });
    assert.ok("text" in legacy.contents[0]);
    assert.match(legacy.contents[0].text, /runtime_version: 'bridge-v18'/);
    assert.equal(bridge.snapshot().mcp.legacyResourceReads, 1);
    assert.ok(bridge.snapshot().mcp.toolsList >= 1);
    const migrated = await client.readResource({ uri: "ui://coworker/api-bridge-v3.html" });
    assert.ok("text" in migrated.contents[0]);
    assert.match(migrated.contents[0].text, /runtime_version: 'bridge-v18'/);
    assert.equal(bridge.snapshot().mcp.lastRequestedResource, "ui://coworker/api-bridge-v3.html");
    assert.equal(bridge.snapshot().ui.resourceReads, 3);

    const pending = fetch(`${base}/v1/responses`, {
      method: "POST", headers: { Authorization: "Bearer widget-client-key", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "chatgpt-web", instructions: "preserve " + "x".repeat(9_000), input: "hello" }),
    });
    void pending.catch(() => {});
    for (let i = 0; bridge.pendingCount === 0 && i < 50; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    const stale = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v3" } });
    assert.equal((stale.structuredContent as { upgrade_required: boolean }).upgrade_required, true);
    assert.equal(bridge.snapshot().claimed, 0);
    const wrongWorker = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v8", widget_id: "00000000-0000-4000-8000-000000000011", heartbeat_only: true } });
    assert.equal((wrongWorker.structuredContent as { worker_selected: boolean }).worker_selected, false);
    assert.equal(bridge.active, false, "An old chat cannot advertise inference readiness");
    assert.equal(bridge.snapshot().claimed, 0);
    const blockedSwitch = await client.callTool({ name: "workbench_api_activate", arguments: {} });
    assert.equal(blockedSwitch.isError, true, "Do not switch a pending request to another chat");
    assert.equal(bridge.snapshot().ui.activations, 1);
    const outdated = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v4", widget_id: widgetId } });
    assert.equal((outdated.structuredContent as { upgrade_required: boolean }).upgrade_required, true);
    const heartbeat = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v5", widget_id: widgetId, heartbeat_only: true, delivery: "send_started" } });
    assert.equal((heartbeat.structuredContent as { turn: unknown }).turn, null);
    assert.equal(bridge.snapshot().claimed, 0, "Heartbeat cannot claim or dispatch a queued request");
    const claimed = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v5", widget_id: widgetId } });
    assert.equal(bridge.snapshot().runtime.last, "bridge-v5");
    assert.equal(bridge.snapshot().runtime.polls.versioned, 2);
    const turn = (claimed.structuredContent as { turn: { request_id: string; prompt: string; claim_lease_id: string } }).turn;
    assert.ok(turn.prompt.includes(WIDGET_CHAT_POLICY));
    assert.ok(turn.prompt.length - WIDGET_CHAT_POLICY.length < 1_000);
    assert.match(turn.prompt, /workbench_api_read_request/);
    const read = await client.callTool({ name: "workbench_api_read_request", arguments: { request_id: turn.request_id } });
    assert.ok(String((read.structuredContent as { prompt: string }).prompt).includes("x".repeat(9_000)));
    const early = await client.callTool({ name: "workbench_api_submit", arguments: { request_id: turn.request_id, text: "premature" } });
    assert.deepEqual(early.structuredContent, { status: "unknown_request" });
    const ack = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v5", widget_id: widgetId, active_request_id: turn.request_id, claim_lease_id: turn.claim_lease_id, delivery: "send_started" } });
    assert.equal((ack.structuredContent as { delivery_permitted: boolean }).delivery_permitted, true);
    const malformedTelemetry = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v5", widget_id: widgetId, active_request_id: turn.request_id, claim_lease_id: turn.claim_lease_id, delivery: "send_failed", failure_stage: "PRIVATE_EXCEPTION" } });
    assert.equal(malformedTelemetry.isError, true);
    assert.equal(bridge.snapshot().counts.deliveryFailed, 0);
    const rejected = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v5", widget_id: widgetId, active_request_id: turn.request_id, claim_lease_id: turn.claim_lease_id, delivery: "send_failed", failure_stage: "async_reject" } });
    assert.equal((rejected.structuredContent as { delivery_permitted: boolean }).delivery_permitted, false);
    assert.equal(bridge.snapshot().hostFailureStages.async_reject, 1);
    const retry = await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v5", widget_id: widgetId, active_request_id: turn.request_id, claim_lease_id: turn.claim_lease_id, delivery: "send_started" } });
    assert.equal((retry.structuredContent as { delivery_permitted: boolean }).delivery_permitted, false);
    assert.equal((retry.structuredContent as { delivery_state: string }).delivery_state, "unknown");
    const submitted = await client.callTool({ name: "workbench_api_submit", arguments: { request_id: turn.request_id, text: "standalone answer" } });
    assert.equal(bridge.snapshot().hostBusy, true);
    assert.equal(bridge.pendingCount, 0, "API queue is empty while the host turn can still be busy");
    const hostBusySwitch = await client.callTool({ name: "workbench_api_activate", arguments: {} });
    assert.equal(hostBusySwitch.isError, true);
    const busy = await fetch(`${base}/health/inference`);
    assert.equal(busy.status, 503, "An accepted callback does not mean ChatGPT finished its turn");
    assert.equal((await busy.json()).status, "widget_busy");
    await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v10", widget_id: "00000000-0000-4000-8000-000000000011", heartbeat_only: true, host_busy: false } });
    assert.equal(bridge.snapshot().hostBusy, true, "An old chat cannot clear selected host busy state");
    await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v10", widget_id: widgetId, heartbeat_only: true, host_busy: false } });
    const idle = await fetch(`${base}/health/inference`);
    assert.equal(idle.status, 200);
    assert.equal((await idle.json()).status, "ready");
    assert.deepEqual(submitted.structuredContent, { status: "accepted" });
    assert.equal((await (await pending).json()).output_text, "standalone answer");
    const selectedAgain = await client.callTool({ name: "workbench_api_activate", arguments: {} });
    const nextWidgetId = (selectedAgain.structuredContent as { widget_id: string }).widget_id;
    assert.notEqual(nextWidgetId, widgetId);
    await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v8", widget_id: widgetId, heartbeat_only: true } });
    assert.equal(bridge.active, false);
    assert.equal(bridge.claim("bridge-v8", widgetId), null, "Retained widgets cannot take work intended for the selected chat");
    await client.callTool({ name: "workbench_api_poll", arguments: { runtime_version: "bridge-v8", widget_id: nextWidgetId, heartbeat_only: true } });
    assert.equal(bridge.active, true);
  } finally {
    await client.close();
    app.server.closeAllConnections();
    await app.close();
    if (previousApiKeys === undefined) delete process.env.COWORKER_API_KEYS;
    else process.env.COWORKER_API_KEYS = previousApiKeys;
    if (previousMcpSecret === undefined) delete process.env.COWORKER_MCP_SECRET;
    else process.env.COWORKER_MCP_SECRET = previousMcpSecret;
  }
});
