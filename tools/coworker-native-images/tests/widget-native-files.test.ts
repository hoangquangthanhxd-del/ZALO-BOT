import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext, Script } from 'node:vm';
import { WIDGET_NATIVE_FILES_JS } from '../src/widget-native-files.js';

const data = Buffer.from('fixture bytes').toString('base64');
function harness({ available = true, current = () => true, valid = true }: { available?: boolean; current?: () => boolean; valid?: boolean } = {}) {
  const calls: number[] = [], uploads: Array<{ name: string; type: string; library: boolean }> = [];
  class FixtureFile { constructor(_bytes: unknown, readonly name: string, readonly options: { type: string }) {} }
  const browser = createContext({
    Uint8Array, File: FixtureFile, atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    current,
    callHostTool: async (_name: string, args: { request_id: string; image_index: number }) => {
      calls.push(args.image_index);
      return { structuredContent: { request_id: valid ? args.request_id : 'foreign-request', image_count: 2, image_index: args.image_index },
        content: [{ type: 'text', text: 'metadata' }, { type: 'image', data, mimeType: 'image/png' }] };
    },
    window: { openai: available ? {
      uploadFile: async (file: FixtureFile, options: { library: boolean }) => {
        uploads.push({ name: file.name, type: file.options.type, library: options.library });
        return { fileId: 'file_fixture_' + uploads.length };
      }, setWidgetState: () => {}, sendFollowUpMessage: () => {},
    } : {} },
  });
  new Script(WIDGET_NATIVE_FILES_JS).runInContext(browser);
  return { browser, calls, uploads };
}

test('native files upload only current request images in stable order without adding them to the library', async () => {
  const host = harness();
  const ids = await new Script("uploadNativeRequestImages('request-fixture', 2, current)").runInContext(host.browser);
  assert.deepEqual(Array.from(ids), ['file_fixture_1', 'file_fixture_2']);
  assert.deepEqual(host.calls, [0, 1]);
  assert.deepEqual(host.uploads, [
    { name: 'request-image-1.png', type: 'image/png', library: false },
    { name: 'request-image-2.png', type: 'image/png', library: false },
  ]);
});
test('missing native-file host capability fails before reading or sending anything', async () => {
  const host = harness({ available: false });
  await assert.rejects(new Script("uploadNativeRequestImages('request-fixture', 2, current)").runInContext(host.browser), /host_native_files_unavailable/);
  assert.equal(host.calls.length, 0); assert.equal(host.uploads.length, 0);
});
test('foreign image metadata is rejected before uploading its bytes', async () => {
  const host = harness({ valid: false });
  await assert.rejects(new Script("uploadNativeRequestImages('request-fixture', 2, current)").runInContext(host.browser), /native_image_read_failed/);
  assert.equal(host.uploads.length, 0);
});
test('a superseded request never uploads or returns IDs for a later turn', async () => {
  const host = harness({ current: () => false });
  await assert.rejects(new Script("uploadNativeRequestImages('request-fixture', 2, current)").runInContext(host.browser), /native_request_superseded/);
  assert.equal(host.calls.length, 0); assert.equal(host.uploads.length, 0);
});
