import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = 2;
export const SKIN_TYPES = Object.freeze(['L2D', 'L2D+', '双形态']);

export function stableSkinId(character, name) {
  if (typeof character !== 'string' || typeof name !== 'string') throw new TypeError('character and name must be strings');
  return `azl-${createHash('sha256').update(`${character}\0${name}`, 'utf8').digest('hex').slice(0, 16)}`;
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export class CatalogValidationError extends Error {
  constructor(errors) {
    super(`Catalog validation failed:\n${errors.map(value => `- ${value}`).join('\n')}`);
    this.name = 'CatalogValidationError';
    this.errors = errors;
  }
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.length > 0 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
function isSource(value) {
  if (value === null) return true;
  if (!isText(value)) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

// Paths are local, never URL encoded. Reject Windows aliases and traversal too.
export function isSafeAssetPath(value, folder) {
  if (!isText(value) || !value.startsWith(`assets/${folder}/`)) return false;
  if (/[\\%?#<>:"|*\u0000-\u001f\u007f]/u.test(value)) return false;
  if (value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return false;
  return /\.(?:png|jpe?g|webp|gif|avif)$/i.test(value);
}

export function legacyGuidePath(character, name) {
  const stem = character === '瑟堡' && name === '布偶熊里面的是……？' ? '瑟堡-布偶熊里面的是' : `${character}-${name}`;
  return `assets/guides/${stem}-玩法图.png`;
}

function guideBelongsToSkin(skin) {
  const stem = path.posix.basename(skin.guidePath, path.posix.extname(skin.guidePath));
  return stem === skin.id || stem === path.posix.basename(legacyGuidePath(skin.character, skin.name), '.png');
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Synchronous validation. Metadata-only by default. With checkFiles=true,
 * rootDir is required; every local file and optional size/hash is verified.
 * Returns counts/date bounds or throws CatalogValidationError with errors[].
 */
export function validateCatalog(catalog, { rootDir, checkFiles = false } = {}) {
  const errors = [];
  if (!isRecord(catalog)) throw new CatalogValidationError(['catalog must be an object']);
  if (catalog.schemaVersion !== SCHEMA_VERSION) errors.push('schemaVersion must be 2');
  if (!isText(catalog.version)) errors.push('version must be a nonempty string');
  if (!isValidDate(catalog.updatedTo)) errors.push('updatedTo must be a real YYYY-MM-DD date');
  if (catalog.checkedAt !== null && (typeof catalog.checkedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(catalog.checkedAt) ||
      !isValidDate(catalog.checkedAt.slice(0, 10)) || Number.isNaN(Date.parse(catalog.checkedAt)) ||
      Number(catalog.checkedAt.slice(11, 13)) > 23 || Number(catalog.checkedAt.slice(14, 16)) > 59 || Number(catalog.checkedAt.slice(17, 19)) > 59)) {
    errors.push('checkedAt must be null or a valid UTC ISO timestamp');
  }
  if (!Array.isArray(catalog.skins) || catalog.skins.length === 0) {
    errors.push('skins must be a nonempty array');
    throw new CatalogValidationError(errors);
  }
  let projectRoot;
  if (checkFiles) {
    if (!rootDir) errors.push('rootDir is required when checkFiles=true');
    else { try { projectRoot = realpathSync(rootDir); } catch { errors.push(`rootDir does not exist: ${rootDir}`); } }
  }
  const ids = new Set(), identities = new Set(), assetPaths = new Set(), dates = [];
  let guideCount = 0, pendingGuideCount = 0, missingGuideCount = 0, referencedFileCount = 0;
  for (const [index, skin] of catalog.skins.entries()) {
    const label = `skins[${index}]`;
    if (!isRecord(skin)) { errors.push(`${label} must be an object`); continue; }
    for (const field of ['character', 'name', 'variant']) {
      if (!isText(skin[field])) errors.push(`${label}.${field} must be a nonempty string without surrounding whitespace/control characters`);
    }
    if (typeof skin.id !== 'string' || !/^azl-[a-f0-9]{16}$/.test(skin.id)) errors.push(`${label}.id must use azl- plus 16 lowercase SHA-256 hex characters`);
    if (ids.has(skin.id)) errors.push(`${label}.id is duplicated: ${skin.id}`);
    ids.add(skin.id);
    if (typeof skin.character === 'string' && typeof skin.name === 'string') {
      if (skin.id !== stableSkinId(skin.character, skin.name)) errors.push(`${label}.id does not match character/name identity`);
      const identity = `${skin.character}\0${skin.name}`;
      if (identities.has(identity)) errors.push(`${label} duplicates character/name identity`);
      identities.add(identity);
    }
    if (!SKIN_TYPES.includes(skin.type)) errors.push(`${label}.type must be L2D, L2D+ or 双形态`);
    if (!isValidDate(skin.releaseDate)) errors.push(`${label}.releaseDate must be a real YYYY-MM-DD date`);
    else dates.push(skin.releaseDate);
    if ('guideConfirmed' in skin && typeof skin.guideConfirmed !== 'boolean') errors.push(`${label}.guideConfirmed must be boolean`);
    for (const source of ['artworkSource', 'guideSource']) {
      if (!isSource(skin[source])) errors.push(`${label}.${source} must be null or an http(s) URL without credentials`);
    }
    if (skin.guidePath !== null && typeof skin.guidePath !== 'string') errors.push(`${label}.guidePath must be null or a local path`);
    if (typeof skin.guidePath === 'string') {
      guideCount++;
      if (isText(skin.character) && isText(skin.name) && !guideBelongsToSkin(skin)) errors.push(`${label}.guidePath does not belong to this skin identity`);
    } else if (skin.guideConfirmed || skin.guideSource) pendingGuideCount++;
    else missingGuideCount++;
    for (const [kind, folder] of [['artwork', 'skins'], ['guide', 'guides']]) {
      const value = skin[`${kind}Path`], bytes = skin[`${kind}Bytes`], hash = skin[`${kind}Sha256`];
      if (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes <= 0)) errors.push(`${label}.${kind}Bytes must be a positive safe integer`);
      if (hash !== undefined && (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) errors.push(`${label}.${kind}Sha256 must be a lowercase SHA-256 hash`);
      if (kind === 'guide' && value === null) {
        if (bytes !== undefined || hash !== undefined) errors.push(`${label} has guide file evidence without guidePath`);
        continue;
      }
      if (!isSafeAssetPath(value, folder)) { errors.push(`${label}.${kind}Path must be a safe relative image path under assets/${folder}/`); continue; }
      referencedFileCount++;
      const canonicalPath = value.toLocaleLowerCase('en-US');
      if (assetPaths.has(canonicalPath)) errors.push(`${label}.${kind}Path is duplicated: ${value}`);
      assetPaths.add(canonicalPath);
      if (!checkFiles || !projectRoot) continue;
      try {
        const absolute = realpathSync(path.resolve(projectRoot, ...value.split('/')));
        if (!inside(path.resolve(projectRoot, 'assets', folder), absolute)) { errors.push(`${label}.${kind}Path resolves outside assets/${folder}`); continue; }
        const file = statSync(absolute);
        if (!file.isFile() || file.size === 0) { errors.push(`${label}.${kind}Path is not a nonempty file: ${value}`); continue; }
        if (bytes !== undefined && file.size !== bytes) errors.push(`${label}.${kind}Bytes does not match file size: ${value}`);
        if (hash !== undefined && createHash('sha256').update(readFileSync(absolute)).digest('hex') !== hash) errors.push(`${label}.${kind}Sha256 does not match file contents: ${value}`);
      } catch (error) { errors.push(`${label}.${kind}Path cannot be read: ${value} (${error.code || error.message})`); }
    }
  }
  dates.sort();
  const minReleaseDate = dates[0] ?? null, maxReleaseDate = dates.at(-1) ?? null;
  if (maxReleaseDate !== catalog.updatedTo) errors.push(`updatedTo must equal latest releaseDate (${maxReleaseDate}), never the detection date`);
  if (errors.length) throw new CatalogValidationError(errors);
  return {
    schemaVersion: catalog.schemaVersion, version: catalog.version, updatedTo: catalog.updatedTo, checkedAt: catalog.checkedAt,
    count: catalog.skins.length, artworkCount: catalog.skins.length, guideCount, pendingGuideCount, missingGuideCount,
    withoutGuideCount: catalog.skins.length - guideCount, minReleaseDate, maxReleaseDate, referencedFileCount,
  };
}

/** JSON is canonical; this mirror supports double-click/file:// without fetch. */
export function serializeCatalog(catalog) {
  validateCatalog(catalog);
  return `window.L2D_SKINS_DATA = ${JSON.stringify(catalog, null, 2)};\n`;
}

/** Read the generated mirror without evaluating JavaScript. */
export function parseCatalogScript(text) {
  const match = /^\s*window\.L2D_SKINS_DATA\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(text.replace(/^\uFEFF/, ''));
  if (!match) throw new CatalogValidationError(['JS mirror must assign window.L2D_SKINS_DATA']);
  return JSON.parse(match[1]);
}
