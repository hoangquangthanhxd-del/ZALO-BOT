// Calls the real Coworker widget. Fixture answers are loaded ONLY after inference.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = process.argv[2];
if (!fixtures) throw new Error('Provide the fresh fixtures directory explicitly.');
const count = Number(process.argv[3] || '1');
const runDirectory = process.argv[4] || join(root, '.cache/coworker-native-run');
if (![1, 3].includes(count)) throw new Error('Select exactly one or three prepared images.');
const credentials = JSON.parse(await readFile('C:/Users/Admin/AppData/Local/coworkerapi/ptap-poc-credentials.json', 'utf8'));
if (!credentials.apiKey || credentials.baseUrl !== 'http://127.0.0.1:3211/v1' || credentials.model !== 'chatgpt-web') throw new Error('Existing Coworker credentials do not match this POC.');
const request = JSON.parse(await readFile(join(fixtures, 'request.json'), 'utf8'));
const selected = request.images.slice(0, count);
const content = [{ type: 'text', text: JSON.stringify({ question: request.question, images: selected.map(({ filename, ...image }) => image) }) }];
const imageHashes = [];
for (const image of selected) {
  const bytes = await readFile(join(fixtures, image.filename));
  imageHashes.push({ imageId: image.imageId, sha256: createHash('sha256').update(bytes).digest('hex') });
  content.push({ type: 'image_url', image_url: { url: 'data:' + image.mimeType + ';base64,' + bytes.toString('base64') }, image_id: image.imageId });
}
const schema = { type: 'object', additionalProperties: false, required: ['rows'], properties: { rows: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['code', 'dimensionsMm', 'color', 'shape', 'sourceImageIds'], properties: {
    code: { type: ['string', 'null'] }, dimensionsMm: { type: ['array', 'null'], items: { type: 'number' }, minItems: 3, maxItems: 3 },
    color: { type: 'string', enum: ['blue', 'orange', 'red', 'other'] }, shape: { type: 'string', enum: ['ring', 'square', 'other'] },
    sourceImageIds: { type: 'array', minItems: 1, items: { type: 'string' } },
  },
} } } };
const payload = { model: 'chatgpt-web', stream: false, messages: [
  { role: 'system', content: request.instructions + '\nUse English color/shape labels from the schema. Read ALL native images through workbench_api_read_request before answering. sourceImageIds MUST be the image_id values of the actual images read. The printed dimensions are labels, not physical measurements. Do not reuse transport-chat history. Use the required submit_image_analysis function to return the complete result.' },
  { role: 'user', content },
], tools: [{ type: 'function', function: { name: 'submit_image_analysis', description: 'Return the actual native-image analysis for this request.', parameters: schema } }],
tool_choice: 'required', parallel_tool_calls: false };
const startedAt = new Date().toISOString();
const startedEpoch = Date.now();
const outputDirectory = join(root, '.cache/native-image-evidence');
await mkdir(outputDirectory, { recursive: true });
const evidenceFile = join(outputDirectory, startedAt.replaceAll(':', '-') + '-' + count + '-images.json');
let evidence = { startedAt, selectedImages: count, imageHashes, status: 'NOT_RUN' };
try {
  const ready = await fetch('http://127.0.0.1:3211/health/inference', { signal: AbortSignal.timeout(5000) });
  const readyBody = await ready.json();
  if (!ready.ok || readyBody.status !== 'ready') throw Object.assign(new Error('Coworker worker is not ready.'), { code: 'COWORKER_NOT_READY' });
  const started = Date.now();
  const response = await fetch(credentials.baseUrl + '/chat/completions', { method: 'POST', redirect: 'error',
    headers: { authorization: 'Bearer ' + credentials.apiKey, 'content-type': 'application/json', 'x-coworker-native-poc':'1' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(250000) });
  const body = await response.json();
  const requestId = response.headers.get('x-request-id');
  evidence = { ...evidence, httpStatus: response.status, requestId, latencyMs: Date.now() - started };
  if (!response.ok) throw Object.assign(new Error('Coworker inference failed.'), { code: body.error?.code || 'HTTP_' + response.status });
  const calls = body.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length !== 1 || calls[0].function?.name !== 'submit_image_analysis') throw Object.assign(new Error('Required image analysis callback missing.'), { code: 'IMAGE_CALLBACK_INVALID' });
  const actual = JSON.parse(calls[0].function.arguments);
  // Do not expose expected answers to the model: no model/tool call follows this read.
  const expected = JSON.parse(await readFile(join(fixtures, 'expected.local.json'), 'utf8'));
  const selectedIds = selected.map(image => image.imageId);
  const desired = expected.rows.map(row => ({ ...row, sourceImageIds: row.sourceImageIds.filter(id => selectedIds.includes(id)) })).filter(row => row.sourceImageIds.length);
  const normalize = rows => rows.map(row => ({ code: row.code, dimensionsMm: row.dimensionsMm, color: row.color, shape: row.shape,
    sourceImageIds: [...row.sourceImageIds].sort() })).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const contentMatches = Array.isArray(actual.rows) && JSON.stringify(normalize(actual.rows)) === JSON.stringify(normalize(desired));
  const store = JSON.parse(await readFile(join(runDirectory, 'data/coworkerapi.json'), 'utf8'));
  const audit = store.requests?.find(row => row.id === requestId);
  const provenanceMatches = Boolean(requestId) && audit?.provider === 'coworker-widget' && audit.model === 'chatgpt-web' && audit.outcome === 'completed';
  evidence = { ...evidence, status: contentMatches && provenanceMatches ? 'PASS' : 'FAIL', contentMatches, provenanceMatches,
    actual, audit: audit ? { provider: audit.provider, model: audit.model, outcome: audit.outcome } : null };
  if (evidence.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  evidence = { ...evidence, status: 'FAIL', errorCode: error.name === 'TimeoutError' ? 'COWORKER_IMAGE_TIMEOUT' : String(error.code || error.name || 'INFERENCE_FAILED') };
  process.exitCode = 1;
}
evidence = { ...evidence, finishedAt:new Date().toISOString(), totalLatencyMs:Date.now()-startedEpoch };
await writeFile(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ ...evidence, actual: undefined, imageHashes: undefined, evidenceFile }));
