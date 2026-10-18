import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Worker } from 'node:worker_threads';
import { createToolSchemaValidator } from '../src/tool-schema.js';

const checks = [{ schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } } }];
class ControlledWorker extends EventEmitter {
  terminated = false;
  received: unknown[] = [];
  reply = true;
  postMessage(value: unknown) {
    this.received.push(value);
    if (this.reply) queueMicrotask(() => this.emit('message', { valid: true }));
  }
  async terminate() { this.terminated = true; return 0; }
}
const asWorker = (worker: ControlledWorker) => worker as unknown as Worker;

test('trusted bootstrap does not consume the untrusted schema execution budget', async () => {
  const worker = new ControlledWorker();
  const validate = createToolSchemaValidator({ makeWorker: () => asWorker(worker), startupTimeoutMs: 1000 });
  const result = validate(checks, 20);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(worker.received, [], 'no untrusted input before readiness');
  worker.emit('message', { ready: true });
  assert.equal(await result, true);
  assert.deepEqual(worker.received, [checks]);
  assert.equal(worker.terminated, true);
});

test('startup failure is a bounded service failure, not a client schema rejection', async () => {
  const worker = new ControlledWorker();
  const validate = createToolSchemaValidator({ makeWorker: () => asWorker(worker), startupTimeoutMs: 20 });
  await assert.rejects(validate(checks), { code: 'tool_schema_unavailable' });
  assert.equal(worker.terminated, true);
  assert.deepEqual(worker.received, []);
});

test('worker construction failures release capacity and do not expose host details', async () => {
  const validate = createToolSchemaValidator({ makeWorker: () => { throw new Error('private host path'); } });
  for (let attempt = 0; attempt < 6; attempt++) {
    await assert.rejects(validate(checks), error => {
      assert.equal((error as { code: string }).code, 'tool_schema_unavailable');
      assert.ok(!(error as Error).message.includes('private host path'));
      return true;
    });
  }
});

test('untrusted work retains its own timeout and termination after readiness', async () => {
  const worker = new ControlledWorker(); worker.reply = false;
  const validate = createToolSchemaValidator({ makeWorker: () => {
    queueMicrotask(() => worker.emit('message', { ready: true })); return asWorker(worker);
  } });
  await assert.rejects(validate(checks, 20), { code: 'tool_schema_timeout' });
  assert.equal(worker.terminated, true);
});

test('capacity is bounded during bootstrap and released after every failure', async () => {
  const workers: ControlledWorker[] = [];
  const validate = createToolSchemaValidator({ makeWorker: () => {
    const worker = new ControlledWorker(); workers.push(worker); return asWorker(worker);
  }, startupTimeoutMs: 1000 });
  const waiting = Array.from({ length: 4 }, () => validate(checks));
  await assert.rejects(validate(checks), { code: 'tool_schema_capacity' });
  for (const worker of workers) worker.emit('error', new Error('private bootstrap detail'));
  const results = await Promise.allSettled(waiting);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'tool_schema_unavailable'));
  const next = validate(checks);
  workers.at(-1)!.emit('message', { ready: true });
  assert.equal(await next, true);
});

test('real worker still compiles schemas and checks arguments without coercion', async () => {
  const validate = createToolSchemaValidator();
  assert.equal(await validate(checks), true);
  assert.equal(await validate([{ ...checks[0], arguments: { ok: true } }]), true);
  assert.equal(await validate([{ ...checks[0], arguments: { ok: 'true' } }]), false);
  await assert.rejects(validate([{ schema: { $ref: 'https://example.invalid/schema' } }]), { code: 'invalid_tool_schema' });
});
