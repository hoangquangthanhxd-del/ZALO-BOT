import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import { createContext, Script } from "node:vm";
import { WIDGET_HOST_BRIDGE_JS } from "../src/widget-host-bridge.js";

test('native image bytes are sent in the current user message without text-only context replacement or alias retry',async()=>{
  const host=harness();
  await new Script('hostBridgeReady').runInContext(host.browser);
  new Script("var nativeMessageContent=[{type:'image',mimeType:'image/jpeg',data:'current-image-bytes'}];").runInContext(host.browser);
  const pending=new Script("sendHostFileMessage('current request')").runInContext(host.browser);
  const message=host.sent.at(-1)!;
  assert.equal(message.method,'ui/message');
  assert.deepEqual(JSON.parse(JSON.stringify(message.params)),{role:'user',content:[{type:'text',text:'current request'},{type:'image',mimeType:'image/jpeg',data:'current-image-bytes'}]});
  host.reply({jsonrpc:'2.0',id:message.id,result:{}});await pending;
  assert.equal(host.aliasSends,0);
  assert.equal(host.sent.filter(row=>row.method==='ui/update-model-context').length,0);
});

test('native file messages use the shared bridge without replacing staged image context', async () => {
  const host = harness();
  await new Script('hostBridgeReady').runInContext(host.browser);
  new Script('delete window.openai.sendFollowUpMessage').runInContext(host.browser);
  const pending = new Script("sendHostFileMessage('native request fixture')").runInContext(host.browser);
  assert.equal(host.sent.at(-1)!.method, 'ui/message');
  assert.equal(host.sent.filter(message => message.method === 'ui/update-model-context').length, 0);
  host.reply({ jsonrpc:'2.0', id:host.sent.at(-1)!.id, result:{} });
  await pending;
  assert.equal(host.aliasSends, 0);
});
test('a rejected native file message is never resent through the compatibility alias', async () => {
  const host = harness();
  await new Script('hostBridgeReady').runInContext(host.browser);
  new Script('delete window.openai.sendFollowUpMessage').runInContext(host.browser);
  const pending = new Script("sendHostFileMessage('native request fixture')").runInContext(host.browser);
  const rejected = assert.rejects(pending, /host_rpc_rejected/);
  host.reply({ jsonrpc:'2.0', id:host.sent.at(-1)!.id, error:{message:'fixture rejection'} });
  await rejected;
  assert.equal(host.aliasSends, 0);
});

test('native files select the ChatGPT follow-up extension before invoking a host message',async()=>{
  const host=harness();
  await new Script('hostBridgeReady').runInContext(host.browser);
  await new Script("sendHostFileMessage('current native request')").runInContext(host.browser);
  assert.equal(host.aliasSends,1);
  assert.equal(host.sent.filter(message=>['ui/message','ui/update-model-context'].includes(message.method||'')).length,0);
});

test('a failed native extension invocation never falls back to a second host transport',async()=>{
  const host=harness();
  await new Script('hostBridgeReady').runInContext(host.browser);
  new Script("var nativeAttempts=0; window.openai.sendFollowUpMessage=async()=>{nativeAttempts++;throw new Error('native_send_rejected');};").runInContext(host.browser);
  await assert.rejects(new Script("sendHostFileMessage('current native request')").runInContext(host.browser),/native_send_rejected/);
  assert.equal(new Script('nativeAttempts').runInContext(host.browser),1);
  assert.equal(host.sent.filter(message=>message.method==='ui/message').length,0);
});

type Message = { jsonrpc: string; id?: string; method?: string; params?: unknown; result?: unknown; error?: unknown };
function harness(initialize = true) {
  let listener!: (event: { source: unknown; data: Message }) => void;
  let aliasCalls = 0;
  let aliasSends = 0;
  const sent: Message[] = [];
  const timers: { callback: () => void; cleared?: boolean }[] = [];
  const parent = { postMessage(message: Message) {
    sent.push(message);
    if (initialize && message.method === "ui/initialize") listener({ source: parent, data: { jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2026-01-26" } } });
  } };
  const browser = createContext({
    crypto: {randomUUID},
    setTimeout(callback: () => void) { const timer = { callback }; timers.push(timer); return timer; },
    clearTimeout(timer: { cleared?: boolean }) { timer.cleared = true; },
    window: { parent, addEventListener: (_name: string, callback: typeof listener) => { listener = callback; }, openai: { callTool: async () => { aliasCalls++; return { structuredContent: { alias: true } }; }, sendFollowUpMessage: async () => { aliasSends++; } } },
  });
  new Script(WIDGET_HOST_BRIDGE_JS).runInContext(browser);
  return { browser, sent, timers, get aliasCalls() { return aliasCalls; }, get aliasSends() { return aliasSends; },
    reply(message: Message, source: unknown = parent) { listener({ source, data: message }); } };
}

test("standard messages serialize two real follow-ups without using the compatibility alias", async () => {
  const host = harness();
  await new Script("hostBridgeReady").runInContext(host.browser);
  for (const prompt of ["first request", "second request"]) {
    const pending = new Script(`sendHostMessage(${JSON.stringify(prompt)})`).runInContext(host.browser);
    const context = host.sent.at(-1)!;
    assert.equal(context.method, "ui/update-model-context");
    assert.deepEqual(JSON.parse(JSON.stringify(context.params)), { content: [{ type: "text", text: prompt }] });
    host.reply({ jsonrpc: "2.0", id: context.id, result: {} });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const message = host.sent.at(-1)!;
    assert.equal(message.method, "ui/message");
    assert.deepEqual(JSON.parse(JSON.stringify(message.params)), { role: "user", content: [{ type: "text", text: prompt }] });
    host.reply({ jsonrpc: "2.0", id: message.id, result: {} });
    await pending;
  }
  assert.equal(host.aliasSends, 0);
  assert.equal(new Script("rpcWaiters.size").runInContext(host.browser), 0);
});

test("uncertain standard message timeout never resends through the alias", async () => {
  const host = harness();
  await new Script("hostBridgeReady").runInContext(host.browser);
  const pending = new Script("sendHostMessage('synthetic')").runInContext(host.browser);
  host.reply({ jsonrpc: "2.0", id: host.sent.at(-1)!.id, result: {} });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const rejected = assert.rejects(pending, /host_rpc_timeout/);
  host.timers.find(timer => !timer.cleared)!.callback();
  await rejected;
  const message = host.sent.at(-1)!;
  host.reply({ jsonrpc: "2.0", id: message.id, result: {} });
  assert.equal(host.aliasSends, 0);
});

test("standard message rejection stays rejected without compatibility retry", async () => {
  const host = harness();
  await new Script("hostBridgeReady").runInContext(host.browser);
  const pending = new Script("sendHostMessage('synthetic')").runInContext(host.browser);
  host.reply({ jsonrpc: "2.0", id: host.sent.at(-1)!.id, result: {} });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const rejected = assert.rejects(pending, /host_message_rejected/);
  host.reply({ jsonrpc: "2.0", id: host.sent.at(-1)!.id, result: { isError: true } });
  await rejected;
  assert.equal(host.aliasSends, 0);
});

test("rejected context update starts no conversation turn and never uses alias", async () => {
  const host = harness();
  await new Script("hostBridgeReady").runInContext(host.browser);
  const pending = new Script("sendHostMessage('synthetic')").runInContext(host.browser);
  const rejected = assert.rejects(pending, /host_context_rejected/);
  host.reply({ jsonrpc: "2.0", id: host.sent.at(-1)!.id, result: { isError: true } });
  await rejected;
  assert.equal(host.sent.filter(message => message.method === "ui/message").length, 0);
  assert.equal(host.aliasSends, 0);
});

test("standard tool transport initializes before calls and accepts only matching parent responses", async () => {
  const host = harness();
  await new Script("hostBridgeReady").runInContext(host.browser);
  assert.deepEqual(host.sent.map(message => message.method), ["ui/initialize", "ui/notifications/initialized"]);
  const request = new Script("callHostTool('workbench_api_poll', {heartbeat_only:true})").runInContext(host.browser);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const call = host.sent.at(-1)!;
  assert.equal(call.method, "tools/call");
  host.reply({ jsonrpc: "2.0", id: call.id, result: {} }, {});
  host.reply({ jsonrpc: "2.0", id: call.id! + "-unknown", result: {} });
  host.reply({ jsonrpc: "2.0", id: call.id, result: {}, error: {} });
  host.reply({ jsonrpc: "2.0", id: call.id, method: "tools/call", result: {} });
  assert.equal(new Script("rpcWaiters.size").runInContext(host.browser), 1);
  host.reply({ jsonrpc: "2.0", id: call.id, result: { structuredContent: { ready: true } } });
  assert.equal((await request).structuredContent.ready, true);
  assert.equal(host.aliasCalls, 0);
  assert.equal(new Script("rpcWaiters.size").runInContext(host.browser), 0);
});

test("standard tool timeout cleans pending state and never retries via the compatibility alias", async () => {
  const host = harness();
  await new Script("hostBridgeReady").runInContext(host.browser);
  const request = new Script("callHostTool('workbench_api_poll', {})").runInContext(host.browser);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const rejected = assert.rejects(request, /host_rpc_timeout/);
  host.timers.find(timer => !timer.cleared)!.callback();
  await rejected;
  assert.equal(new Script("rpcWaiters.size").runInContext(host.browser), 0);
  assert.equal(host.aliasCalls, 0);
  const late = host.sent.at(-1)!;
  host.reply({ jsonrpc: "2.0", id: late.id, result: {} });
  assert.equal(host.aliasCalls, 0);
});

test("activation identity uses standard tool-result notifications only from the parent", async () => {
  const host = harness();
  await new Script("hostBridgeReady").runInContext(host.browser);
  const id = "00000000-0000-4000-8000-000000000012";
  const notification = { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { widget_id: id } } };
  host.reply(notification, {});
  assert.equal(new Script("hostActivationWidgetId").runInContext(host.browser), null);
  host.reply(notification);
  assert.equal(new Script("hostActivationWidgetId").runInContext(host.browser), id);
  host.reply({ ...notification, params: { structuredContent: { widget_id: "invalid" } } });
  host.reply({ ...notification, params: { structuredContent: { turn: null } } });
  assert.equal(new Script("hostActivationWidgetId").runInContext(host.browser), id);
});

test("only a failed initialization may select alias fallback; raw host errors never propagate", async () => {
  const host = harness(false);
  const init = host.sent[0];
  host.reply({ jsonrpc: "2.0", id: init.id, error: { message: "PRIVATE_EXCEPTION" } });
  await new Script("hostBridgeReady").runInContext(host.browser);
  assert.equal((await new Script("callHostTool('workbench_api_poll', {})").runInContext(host.browser)).structuredContent.alias, true);
  assert.equal(host.aliasCalls, 1);
  assert.equal(host.sent.length, 1);
  const standard = harness();
  await new Script("hostBridgeReady").runInContext(standard.browser);
  const request = new Script("callHostTool('workbench_api_poll', {})").runInContext(standard.browser);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const rejected = assert.rejects(request, (error: Error) => error.message === "host_rpc_rejected");
  standard.reply({ jsonrpc: "2.0", id: standard.sent.at(-1)!.id, error: { message: "PRIVATE_EXCEPTION" } });
  await rejected;
  assert.equal(standard.aliasCalls, 0);
});

test("hung initialization and bounded waiter capacity do not retain unbounded RPC state", async () => {
  const host = harness(false);
  host.timers[0].callback();
  await new Script("hostBridgeReady").runInContext(host.browser);
  assert.equal(new Script("rpcWaiters.size").runInContext(host.browser), 0);
  const requests: Promise<unknown>[] = [];
  for (let i = 0; i < 32; i++) requests.push(new Script("hostRpc('tools/call', {})").runInContext(host.browser).catch(() => {}));
  await assert.rejects(new Script("hostRpc('tools/call', {})").runInContext(host.browser), /capacity/);
  assert.equal(new Script("rpcWaiters.size").runInContext(host.browser), 32);
  for (const timer of host.timers.slice(1)) timer.callback();
  await Promise.all(requests);
  assert.equal(new Script("rpcWaiters.size").runInContext(host.browser), 0);
});

test("retained widget instances never accept another instance RPC response", async () => {
  const first=harness(), second=harness();
  await Promise.all([new Script("hostBridgeReady").runInContext(first.browser),new Script("hostBridgeReady").runInContext(second.browser)]);
  const pending=new Script("callHostTool('workbench_api_poll', {})").runInContext(second.browser);
  for(let i=0;i<5;i++)await Promise.resolve();
  const own=second.sent.at(-1)!;
  assert.notEqual(first.sent[0].id,second.sent[0].id);
  second.reply({jsonrpc:"2.0",id:first.sent[0].id,result:{structuredContent:{active_pending:false}}});
  assert.equal(new Script("rpcWaiters.size").runInContext(second.browser),1);
  second.reply({jsonrpc:"2.0",id:own.id,result:{structuredContent:{active_pending:true}}});
  assert.equal((await pending).structuredContent.active_pending,true);
});
