import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { prepareNativeImages, MAX_NATIVE_IMAGE_BYTES, NativeImageError } from '../src/widget-images.js';
import { WidgetBridge } from '../src/widget-bridge.js';
import { buildServer } from '../src/app.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6WbEAAAAASUVORK5CYII=';
const url = 'data:image/png;base64,' + png;
const photo = (image_id = 'img-1') => ({ type: 'input_image', image_url: url, image_id });

test('runtime keeps the selected worker across restarts and rejects corrupt selection state',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'coworker-selected-'));
  const selection=join(directory,'selected-worker.json');
  try {
    const first=new WidgetBridge(0,30000,selection),id=first.recordActivation();
    first.shutdown();
    const restarted=new WidgetBridge(0,30000,selection);
    assert.equal(restarted.acceptsWidget(id),true);
    assert.equal(restarted.acceptsWidget(randomUUID()),false);
    assert.equal(restarted.snapshot().ui.workerSelected,true);
    await writeFile(selection,'{"widgetId":"broken"}');
    assert.throws(()=>new WidgetBridge(0,30000,selection),/widget_selection_unavailable/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('normalize both API image formats without leaking bytes into prompt or mutating input', () => {
  const input = [{ role: 'user', content: [
    { type: 'input_text', text: 'read the images' }, photo(),
    { type: 'image_url', image_url: { url }, image_id: 'img-2' },
  ] }];
  const result = prepareNativeImages(input);
  assert.equal(result.images.length, 2);
  assert.equal(result.images[0].data, png);
  assert.equal(result.images[0].mimeType, 'image/png');
  assert.deepEqual(result.images.map(image => image.imageId), ['img-1', 'img-2']);
  assert.ok(!JSON.stringify(result.input).includes(png));
  assert.ok(JSON.stringify(input).includes(png));
  assert.ok(JSON.stringify(result.input).includes('image_reference'));
  assert.equal(prepareNativeImages({ role: 'user', content: [photo()] }).images.length, 1);
  assert.equal(prepareNativeImages('plain text').input, 'plain text');
});

test('reject remote URLs, wrong signatures, malformed base64, duplicate IDs and excess images', () => {
  const rejected = [
    { ...photo(), image_url: 'https://photo.zaloapp.com/any' },
    { ...photo(), image_url: 'file:///secret.png' },
    { ...photo(), image_url: url + ' ' },
    { ...photo(), image_url: 'data:image/png;base64,AAA' },
    { ...photo(), image_url: 'data:image/jpeg;base64,' + png },
    { ...photo(), image_url: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') },
    { ...photo(), image_id: '../escape' },
  ];
  for (const part of rejected) assert.throws(() => prepareNativeImages([part]), NativeImageError);
  assert.throws(() => prepareNativeImages([photo(), photo()]), /native_image_id_invalid/);
  assert.throws(() => prepareNativeImages(Array.from({ length: 11 }, (_, i) => photo('img-' + i))), /native_image_limit_exceeded/);
  const large = Buffer.alloc(MAX_NATIVE_IMAGE_BYTES + 1);
  Buffer.from(png, 'base64').subarray(0, 8).copy(large);
  assert.throws(() => prepareNativeImages([{ ...photo(), image_url: 'data:image/png;base64,' + large.toString('base64') }]), /native_image_limit_exceeded/);
  const medium = Buffer.alloc(6 * 1024 * 1024);
  Buffer.from(png, 'base64').subarray(0, 8).copy(medium);
  const mediumUrl = 'data:image/png;base64,' + medium.toString('base64');
  assert.throws(() => prepareNativeImages([{ ...photo('a'), image_url: mediumUrl }, { ...photo('b'), image_url: mediumUrl }]), /native_image_limit_exceeded/);
});

test('image input rejection produces a failed response without claiming a turn', async () => {
  const bridge = new WidgetBridge();
  const events = [];
  for await (const event of bridge.respond({ model: 'chatgpt-web', input: [{ ...photo(), image_url: 'https://evil.example/private' }], stream: false }, new AbortController().signal)) events.push(event);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'response.failed');
  assert.equal(bridge.pendingCount, 0);
  assert.ok(!JSON.stringify(events).includes('evil.example'));
});

test('real local MCP returns native image blocks by index and revokes them after cancellation', async () => {
  const oldKeys = process.env.COWORKER_API_KEYS, oldSecret = process.env.COWORKER_MCP_SECRET;
  process.env.COWORKER_API_KEYS = 'native-api-fixture';
  process.env.COWORKER_MCP_SECRET = 'native-mcp-fixture';
  const bridge = new WidgetBridge(0);
  const app = buildServer(bridge, 'native-internal-fixture');
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address(); assert.ok(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const client = new Client({ name: 'native-image-host-fixture', version: '1' });
  const controller = new AbortController();
  let pending: Promise<Response> | undefined;
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { authorization: 'Bearer native-mcp-fixture' } } }));
    const unknown = await client.callTool({ name: 'workbench_api_read_request', arguments: { request_id: randomUUID() } });
    assert.equal(unknown.isError, true);
    pending = fetch(base + '/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer native-api-fixture', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'chatgpt-web', messages: [{ role: 'user', content: [
        { type: 'text', text: 'read ALL three selected images' },
        { type: 'image_url', image_url: { url }, image_id: 'img-1' },
        { type: 'image_url', image_url: { url }, image_id: 'img-2' },
        { type: 'image_url', image_url: { url }, image_id: 'img-3' },
      ] }], stream: false }), signal: controller.signal });
    void pending.catch(() => {});
    const deadline = Date.now() + 5000;
    while (!bridge.pendingCount && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(bridge.claim('bridge-v16',randomUUID()),null,'retained older widgets cannot take a native request after restart');
    assert.equal(bridge.claim('bridge-v20',randomUUID()),null);
    assert.equal(bridge.claim(),null);
    const turn = bridge.claim('bridge-v21', randomUUID()); assert.ok(turn);
    assert.match(turn.prompt, /workbench_api_read_request/);
    assert.ok(!turn.prompt.includes(png));
    for (const index of [0, 1, 2]) {
      const result = await client.callTool({ name: 'workbench_api_read_request', arguments: { request_id: turn.request_id, image_index: index } });
      const structured = result.structuredContent as { prompt: string; image_count: number; image_index: number; image_id: string };
      assert.equal(structured.image_count, 3);
      assert.equal(structured.image_index, index);
      assert.equal(structured.image_id, 'img-' + (index + 1));
      assert.ok(!structured.prompt.includes(png));
      const content = result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      assert.deepEqual(content.filter(part => part.type === 'image'), [{ type: 'image', mimeType: 'image/png', data: png }]);
      assert.match(content[0].text!, /Read ALL images/);
    }
    const badIndex = await client.callTool({ name: 'workbench_api_read_request', arguments: { request_id: turn.request_id, image_index: 9 } });
    assert.equal(badIndex.isError, true);
    assert.ok(!(badIndex.content as Array<{ type: string }>).some(part => part.type === 'image'));
    controller.abort(); await assert.rejects(pending);
    for (let i = 0; bridge.isPending(turn.request_id) && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const cancelled = await client.callTool({ name: 'workbench_api_read_request', arguments: { request_id: turn.request_id } });
    assert.equal(cancelled.isError, true);
    assert.equal(bridge.readRequestImage(turn.request_id), null);
  } finally {
    controller.abort(); bridge.shutdown(); await client.close(); app.server.closeAllConnections(); await app.close();
    if (oldKeys === undefined) delete process.env.COWORKER_API_KEYS; else process.env.COWORKER_API_KEYS = oldKeys;
    if (oldSecret === undefined) delete process.env.COWORKER_MCP_SECRET; else process.env.COWORKER_MCP_SECRET = oldSecret;
  }
});

test('completion and shutdown remove native image access; a later text request has no images', async () => {
  const bridge = new WidgetBridge(0);
  const run = bridge.respond({ model: 'chatgpt-web', input: [photo()], stream: false }, new AbortController().signal)[Symbol.asyncIterator]();
  const first = run.next();
  const widgetId=randomUUID();
  const turn = bridge.claim('bridge-v21', widgetId); assert.ok(turn);
  bridge.leasedStatus(turn.request_id,widgetId,turn.claim_lease_id!,'send_started');
  assert.equal(bridge.readRequestImage(turn.request_id)?.imageCount, 1);
  assert.equal(await bridge.submit(turn.request_id, { text: 'LOCAL_TEST_CALLBACK_ONLY' }), 'accepted');
  assert.equal(bridge.readRequestImage(turn.request_id), null);
  await first; while (!(await run.next()).done) {}
  bridge.recordHostBusy('unused', false);
  const later = bridge.respond({ model: 'chatgpt-web', input: 'next client text', stream: false }, new AbortController().signal)[Symbol.asyncIterator]();
  const laterFirst = later.next();
  const next = bridge.claim('bridge-v21', randomUUID()); assert.ok(next);
  assert.equal(bridge.readRequestImage(next.request_id)?.imageCount, 0);
  bridge.shutdown(); await laterFirst; while (!(await later.next()).done) {}
  assert.equal(bridge.readRequestImage(next.request_id), null);
});
