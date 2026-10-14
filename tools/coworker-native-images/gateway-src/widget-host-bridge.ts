/** Inline, dependency-free MCP Apps tool transport. Never logs RPC payloads. */
export const WIDGET_HOST_BRIDGE_JS = `
let hostTransport = 'openai-alias';
let hostActivationWidgetId = null;
const rpcInstance = crypto.randomUUID();
let rpcSequence = 0;
const rpcWaiters = new Map();
const standardHostAvailable = typeof window.addEventListener === 'function' && typeof window.parent?.postMessage === 'function';
function hostCanCallTools() { return standardHostAvailable || typeof window.openai?.callTool === 'function'; }
function hostRpc(method, params, timeoutMs=10000) {
  if (rpcWaiters.size >= 32) return Promise.reject(new Error('host_rpc_capacity'));
  return new Promise((resolve, reject) => {
    const id = rpcInstance + ':' + (++rpcSequence);
    const timer = setTimeout(() => {
      rpcWaiters.delete(id);
      const error = new Error('host_rpc_timeout'); error.bridgeTimeout = true;
      reject(error);
    }, timeoutMs);
    rpcWaiters.set(id, { resolve, reject, timer });
    try { window.parent.postMessage({ jsonrpc:'2.0', id, method, params }, '*'); }
    catch (_) { rpcWaiters.delete(id); clearTimeout(timer); reject(new Error('host_rpc_post_failed')); }
  });
}
if (standardHostAvailable) window.addEventListener('message', event => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (message?.jsonrpc === '2.0' && message.method === 'ui/notifications/tool-result') {
    const id = message.params?.structuredContent?.widget_id;
    if (typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)) hostActivationWidgetId = id;
    return;
  }
  if (!message || message.jsonrpc !== '2.0' || typeof message.id !== 'string' || !message.id.startsWith(rpcInstance + ':') || message.method !== undefined) return;
  const waiter = rpcWaiters.get(message.id);
  if (!waiter || (Object.prototype.hasOwnProperty.call(message,'result') === Object.prototype.hasOwnProperty.call(message,'error'))) return;
  rpcWaiters.delete(message.id); clearTimeout(waiter.timer);
  if (Object.prototype.hasOwnProperty.call(message,'error')) waiter.reject(new Error('host_rpc_rejected'));
  else waiter.resolve(message.result);
}, { passive:true });
const hostBridgeReady = standardHostAvailable ? (async () => {
  try {
    const result = await hostRpc('ui/initialize', { appInfo:{ name:'CoworkerAPI bridge', version:'14' }, appCapabilities:{}, protocolVersion:'2026-01-26' });
    if (result?.protocolVersion !== '2026-01-26') throw new Error('unsupported_host_protocol');
    window.parent.postMessage({ jsonrpc:'2.0', method:'ui/notifications/initialized', params:{} }, '*');
    hostTransport = 'mcp-apps';
  } catch (_) {
    // Initialization performs no inference/tool invocation. Only here may we
    // choose the compatibility alias; never fall back after a tools/call timeout.
    hostTransport = 'openai-alias';
  }
})() : Promise.resolve();
async function callHostTool(name, args) {
  await hostBridgeReady;
  if (hostTransport === 'mcp-apps') return hostRpc('tools/call', { name, arguments:args });
  if (typeof window.openai?.callTool !== 'function') throw new Error('host_tools_unavailable');
  return window.openai.callTool(name, args);
}
function hostCanSendMessages() { return standardHostAvailable || typeof window.openai?.sendFollowUpMessage === 'function'; }
function sendHostMessage(prompt) {
  // Select the transport before dispatch. Never retry an uncertain send via
  // the compatibility alias: both paths can start a real conversation turn.
  if (hostTransport === 'mcp-apps') {
    // Explicitly replace the app context before triggering a new host turn.
    // Retained chat callbacks must not become the payload for a later client.
    return hostRpc('ui/update-model-context', { content:[{ type:'text', text:prompt }] }).then(result => {
      if (result?.isError) throw new Error('host_context_rejected');
      return hostRpc('ui/message', { role:'user', content:[{ type:'text', text:prompt }] }, 20000);
    }).then(result => {
      if (result?.isError) throw new Error('host_message_rejected');
      return result;
    });
  }
  if (typeof window.openai?.sendFollowUpMessage !== 'function') throw new Error('host_messages_unavailable');
  return window.openai.sendFollowUpMessage({ prompt, scrollToBottom:false });
}
function sendHostFileMessage(prompt) {
  // imageIds have already been staged in structured widget state. Replacing
  // model context here could discard them; trigger the supported shared message
  // directly. Never retry a native send through the compatibility alias.
  if (hostTransport !== 'mcp-apps') throw new Error('host_native_message_unavailable');
  return hostRpc('ui/message', { role:'user', content:[{type:'text', text:prompt}] }, 20000).then(result => {
    if (result?.isError) throw new Error('host_message_rejected');
    return result;
  });
}
`;
