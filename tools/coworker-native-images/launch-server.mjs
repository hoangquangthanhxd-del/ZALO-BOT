// Create the audit store in the server process so its atomic replacement uses
// the same process/file ownership as later requests; preserve the copied source.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const run = process.cwd();
await writeFile(join(run, 'data/coworkerapi.json'), await readFile(join(run, 'data/coworkerapi.snapshot.json')), { flag:'wx', mode:0o600 });
await import(pathToFileURL(join(process.env.COWORKER_POC_APP_DIR, 'dist/src/server.js')).href);
