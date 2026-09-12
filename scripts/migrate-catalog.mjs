#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { legacyGuidePath, serializeCatalog, stableSkinId, validateCatalog } from './lib/catalog.mjs';

// Only the one-time, trusted local legacy inputs are evaluated, never a remote catalog.
export function readLegacyData(text) {
  const context = vm.createContext({ window: {} }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(text, context, { timeout: 1000 });
  return JSON.parse(JSON.stringify(context.window.L2D_SKINS_DATA));
}

export function extractLegacyGuides(html) {
  const match = /const\s+localGuides\s*=\s*new Set\((\[[\s\S]*?\])\);/.exec(html);
  if (!match) throw new Error('Legacy HTML localGuides mapping not found; supply the original backup with --legacy-html');
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  const values = vm.runInContext(match[1], context, { timeout: 1000 });
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error('Invalid legacy localGuides mapping');
  if (new Set(values).size !== values.length) throw new Error('Duplicate identity in legacy localGuides mapping');
  return new Set(values);
}

// Recover exact source URLs from the existing, human-checked download mapping.
export function extractGuideSources(script) {
  const sources = new Map();
  let base;
  for (const line of script.split(/\r?\n/)) {
    const source = /\bBase\s*=\s*'([^']+)'/.exec(line);
    if (source) base = source[1];
    const item = /@\('([^']+)',\s*'([^']+)'\)/.exec(line);
    if (item && base) {
      const target = `assets/guides/${item[2]}`;
      if (sources.has(target)) throw new Error(`Duplicate legacy guide download target: ${target}`);
      sources.set(target, `${base}/${encodeURIComponent(item[1])}`);
    }
  }
  return sources;
}

export function migrateLegacyCatalog(legacy, guides, { rootDir, guideSources = new Map(), includeFileEvidence = true } = {}) {
  if (!legacy || !Array.isArray(legacy.skins)) throw new Error('Legacy skins array is missing');
  const unusedGuides = new Set(guides);
  const skins = legacy.skins.map((row, index) => {
    if (!Array.isArray(row) || row.length !== 6 || ![0, 1].includes(row[5])) throw new Error(`Invalid legacy row ${index}`);
    const [character, name, variant, type, releaseDate, confirmed] = row;
    const identity = `${character}\0${name}`;
    const guidePath = guides.has(identity) ? legacyGuidePath(character, name) : null;
    unusedGuides.delete(identity);
    const skin = {
      id: stableSkinId(character, name), character, name, variant, type, releaseDate,
      artworkPath: `assets/skins/${String(index + 1).padStart(3, '0')}.jpg`,
      guidePath, artworkSource: null, guideSource: guidePath ? (guideSources.get(guidePath) ?? null) : null,
      guideConfirmed: Boolean(confirmed),
    };
    return skin;
  });
  if (unusedGuides.size) throw new Error(`Legacy guides have no skin record: ${[...unusedGuides].join(', ')}`);
  const catalog = {
    schemaVersion: 2, version: `${legacy.version}-schema2`,
    updatedTo: skins.map(skin => skin.releaseDate).sort().at(-1), checkedAt: null, skins,
  };
  // Validate identities and paths before reading any asset named by legacy data.
  validateCatalog(catalog, { rootDir, checkFiles: includeFileEvidence });
  if (includeFileEvidence) {
    for (const skin of skins) {
      for (const kind of ['artwork', 'guide']) {
        if (!skin[`${kind}Path`]) continue;
        const bytes = readFileSync(path.join(rootDir, ...skin[`${kind}Path`].split('/')));
        skin[`${kind}Bytes`] = bytes.length;
        skin[`${kind}Sha256`] = createHash('sha256').update(bytes).digest('hex');
      }
    }
  }
  return catalog;
}

export function main(args = process.argv.slice(2)) {
  let rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let dataPath, htmlPath, write = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--write') write = true;
    else if (['--root', '--legacy-data', '--legacy-html'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path`);
      if (arg === '--root') rootDir = path.resolve(value);
      if (arg === '--legacy-data') dataPath = path.resolve(value);
      if (arg === '--legacy-html') htmlPath = path.resolve(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  const canonicalPath = path.join(rootDir, 'data', 'catalog.json');
  // A rerun must keep stable paths rather than rebuild them from a reordered array.
  if (existsSync(canonicalPath)) {
    const catalog = JSON.parse(readFileSync(canonicalPath, 'utf8').replace(/^\uFEFF/, ''));
    const stats = validateCatalog(catalog, { rootDir, checkFiles: true });
    if (write) writeFileSync(path.join(rootDir, 'data', 'skins-data.js'), serializeCatalog(catalog));
    console.log(JSON.stringify({ action: write ? 'mirror-regenerated' : 'already-migrated', ...stats }, null, 2));
    return;
  }
  dataPath ??= path.join(rootDir, 'data', 'skins-data.js');
  htmlPath ??= path.join(rootDir, 'index-信浓泳装起.html');
  const legacy = readLegacyData(readFileSync(dataPath, 'utf8'));
  const guides = extractLegacyGuides(readFileSync(htmlPath, 'utf8'));
  const sourceScript = path.join(rootDir, 'download-guide-images.ps1');
  const guideSources = existsSync(sourceScript) ? extractGuideSources(readFileSync(sourceScript, 'utf8')) : new Map();
  const catalog = migrateLegacyCatalog(legacy, guides, { rootDir, guideSources });
  if (write) {
    mkdirSync(path.dirname(canonicalPath), { recursive: true });
    writeFileSync(canonicalPath, `${JSON.stringify(catalog, null, 2)}\n`);
    writeFileSync(path.join(rootDir, 'data', 'skins-data.js'), serializeCatalog(catalog));
  }
  console.log(JSON.stringify({ action: write ? 'migrated' : 'dry-run', ...validateCatalog(catalog) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
