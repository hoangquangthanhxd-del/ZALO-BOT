// Reproduce the isolated POC from the installed gateway, never patch it in place.
import { readFile, readdir, cp, mkdir, access, symlink, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = process.argv[2] || 'C:/Users/Admin/AppData/Local/coworkerapi/app';
const destination = join(root, '.cache/coworker-native-app');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of ['widget-bridge.ts', 'widget-mcp.ts', 'widget-host-bridge.ts', 'app.ts', 'tool-schema.ts']) {
  const baseline = await readFile(new URL('./baseline/' + file, import.meta.url));
  const installed = await readFile(join(source, 'src', file));
  if (hash(baseline) !== hash(installed)) throw new Error('GATEWAY_BASELINE_CHANGED: re-audit source before applying the POC.');
}
let runs = [];
try { runs = (await readdir(join(root, '.cache'))).filter(name => /^coworker-native-run(?:-\d+)?$/.test(name)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const directory of runs) {
  let owner;
  try { owner = JSON.parse(await readFile(join(root, '.cache', directory, 'owner.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  try { await access(join(root, '.cache', directory, 'stopped.json')); continue; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { process.kill(owner.childPid, 0); }
  catch (error) { if (error.code === 'ESRCH') continue; throw error; }
  throw new Error('POC_PROCESS_ACTIVE: stop the owned POC before replacing its source.');
}
await mkdir(destination, { recursive: true });
for (const name of ['src', 'tests', 'scripts', 'bin', 'assets', 'tools', 'package.json', 'package-lock.json', 'tsconfig.json']) {
  await cp(join(source, name), join(destination, name), { recursive: true });
}
try { await access(join(destination, 'node_modules')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await symlink(join(source, 'node_modules'), join(destination, 'node_modules'), 'junction');
}
for (const file of ['widget-bridge.ts', 'widget-mcp.ts', 'widget-images.ts', 'widget-native-files.ts', 'widget-host-bridge.ts', 'app.ts', 'tool-schema.ts']) {
  await copyFile(new URL('./gateway-src/' + file, import.meta.url), join(destination, 'src', file));
}
for (const file of ['widget-native-images.test.ts', 'widget-native-files.test.ts', 'widget-runtime.test.ts', 'widget-chat-policy-mcp.test.ts', 'widget-host-bridge.test.ts', 'widget-mcp.test.ts', 'tool-schema-startup.test.ts']) {
  await copyFile(new URL('./tests/' + file, import.meta.url), join(destination, 'tests', file));
}
console.log(JSON.stringify({ status: 'POC_SOURCE_PREPARED', destination, installedGatewayModified: false }));
