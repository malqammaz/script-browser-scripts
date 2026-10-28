import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Parse as an async function body, matching the mobile app's await/return format.
// Validation does not execute downloaded scripts.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let count = 0;
for (const directory of await readdir('scripts', { withFileTypes: true })) {
  if (!directory.isDirectory()) throw new Error('Put scripts inside a domain folder');
  for (const file of await readdir(join('scripts', directory.name), { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.js')) continue;
    const path = join('scripts', directory.name, file.name);
    try { new AsyncFunction(await readFile(path, 'utf8')); }
    catch (error) { throw new Error(`${path}: ${error.message}`); }
    count++;
  }
}
console.log(`Validated ${count} JavaScript scripts`);
