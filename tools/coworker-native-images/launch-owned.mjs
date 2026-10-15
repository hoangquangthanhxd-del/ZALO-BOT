// Starts only the copied POC app with copied configuration and private IPC.
// This file never prints credentials or changes the installed application.
import { fork } from 'node:child_process';
import { copyFile, mkdir, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const original = process.argv[4] || 'C:/Users/Admin/AppData/Local/coworkerapi';
const app = join(root, '.cache/coworker-native-app');
const run = resolve(process.argv[2] || join(root, '.cache/coworker-native-run'));
const mode = process.argv[3] || 'poc';
if (!['poc', 'runtime'].includes(mode)) throw new Error('GATEWAY_MODE_INVALID');
if (!/^coworker-native-run(?:-\d+)?$/.test(relative(join(root, '.cache'),run))) throw new Error('POC_RUN_OUTSIDE_CACHE');
// Never overwrite a previous run, its configuration or its audit evidence.
await mkdir(run);
await mkdir(join(run, 'data'));
await new Promise((yes, no) => {
  const server = createServer(); server.once('error', no);
  server.listen(3211, '127.0.0.1', () => server.close(error => error ? no(error) : yes()));
});
await copyFile(join(original, '.env'), join(run, '.env'));
for (const name of ['coworkerapi.json', 'tunnel-settings.json', 'tunnel-credentials.json']) {
  try { await copyFile(join(original, 'data', name), join(run, 'data', name === 'coworkerapi.json' ? 'coworkerapi.snapshot.json' : name)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const child = fork(fileURLToPath(new URL('./launch-server.mjs', import.meta.url)), [], {
  cwd: run, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  env: { ...process.env, PORT: '3211', HOST: '127.0.0.1', COWORKER_DATA_DIR: join(run, 'data'), COWORKER_POC_APP_DIR:app, COWORKER_NATIVE_POC:mode === 'poc' ? '1' : '0',
    ...(mode === 'runtime' ? {COWORKER_WIDGET_SELECTION_FILE:join(original,'selected-worker.json')} : {}) },
});
await writeFile(join(run, 'owner.json'), JSON.stringify({ parentPid: process.pid, childPid: child.pid,
  app, run, mode, startedAt: new Date().toISOString() }, null, 2), 'utf8');
console.log(JSON.stringify({ event: 'native_image_gateway_started', mode, parentPid: process.pid, childPid: child.pid, port: 3211 }));
let stopping = false;
const timer = setInterval(async () => {
  if (stopping) return;
  try { await access(join(run, 'stop')); } catch { return; }
  stopping = true;
  if (child.connected) child.send({ type: 'coworkerapi:shutdown' });
}, 500);
child.on('exit', async (code, signal) => {
  clearInterval(timer);
  await writeFile(join(run, 'stopped.json'), JSON.stringify({ code, signal, stoppedAt: new Date().toISOString() }), 'utf8');
  process.exitCode = code ?? 1;
});
