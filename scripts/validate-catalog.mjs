#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseCatalogScript, validateCatalog } from './lib/catalog.mjs';

const args = process.argv.slice(2);
let rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let catalogPath, mirrorPath, checkFiles = true, checkMirror = true;
try {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--metadata-only') checkFiles = false;
    else if (arg === '--no-mirror') checkMirror = false;
    else if (['--root', '--catalog', '--mirror'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path`);
      if (arg === '--root') rootDir = path.resolve(value);
      if (arg === '--catalog') catalogPath = path.resolve(value);
      if (arg === '--mirror') mirrorPath = path.resolve(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  catalogPath ??= path.join(rootDir, 'data', 'catalog.json');
  mirrorPath ??= path.join(rootDir, 'data', 'skins-data.js');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''));
  const stats = validateCatalog(catalog, { rootDir, checkFiles });
  if (checkMirror && !isDeepStrictEqual(catalog, parseCatalogScript(readFileSync(mirrorPath, 'utf8')))) throw new Error('data/skins-data.js does not match canonical catalog.json; regenerate the mirror');
  console.log(JSON.stringify({ ...stats, checkFiles, checkMirror }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
