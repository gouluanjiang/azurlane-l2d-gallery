import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogValidationError, isValidDate, legacyGuidePath, parseCatalogScript, serializeCatalog, stableSkinId, validateCatalog } from '../scripts/lib/catalog.mjs';
import { extractGuideSources, extractLegacyGuides, migrateLegacyCatalog } from '../scripts/migrate-catalog.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture(count = 2) {
  const skins = Array.from({ length: count }, (_, index) => {
    const character = `测试角色${index}`, name = `测试换装${index}`;
    const id = stableSkinId(character, name);
    return { id, character, name, variant: '换装', type: 'L2D', releaseDate: '2026-07-23', artworkPath: `assets/skins/${id}.jpg`, guidePath: null, artworkSource: null, guideSource: null, guideConfirmed: false };
  });
  return { schemaVersion: 2, version: 'test-v2', updatedTo: '2026-07-23', checkedAt: null, skins };
}

function temporaryRoot(t) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'l2d-catalog-test-'));
  t.after(() => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(rootDir));
    assert.match(relative, /^l2d-catalog-test-[^\\/]+$/);
    rmSync(rootDir, { recursive: true, force: true });
  });
  return rootDir;
}

test('canonical JSON and offline JavaScript mirror are identical valid metadata', () => {
  const json = JSON.parse(readFileSync(path.join(projectRoot, 'data/catalog.json'), 'utf8'));
  const js = parseCatalogScript(readFileSync(path.join(projectRoot, 'data/skins-data.js'), 'utf8'));
  assert.deepEqual(js, json);
  assert.equal(validateCatalog(json).count, json.skins.length);
});

test('a 96th record and a future year are accepted without renumbering existing artwork', () => {
  const catalog = fixture(95);
  const before = new Map(catalog.skins.map(skin => [skin.id, skin.artworkPath]));
  const next = fixture(96).skins[95];
  next.releaseDate = '2027-01-02';
  catalog.skins.push(next);
  catalog.updatedTo = next.releaseDate;
  assert.equal(validateCatalog(catalog).count, 96);
  catalog.skins.reverse();
  assert.equal(validateCatalog(catalog).maxReleaseDate, '2027-01-02');
  for (const skin of catalog.skins.filter(skin => before.has(skin.id))) assert.equal(skin.artworkPath, before.get(skin.id));
  assert.deepEqual(parseCatalogScript(serializeCatalog(catalog)), catalog);
});

test('identity hashing separates ambiguous text concatenations and rejects forged/duplicate identities', () => {
  assert.notEqual(stableSkinId('ab', 'c'), stableSkinId('a', 'bc'));
  const catalog = fixture();
  catalog.skins[1] = structuredClone(catalog.skins[0]);
  assert.throws(() => validateCatalog(catalog), error => error instanceof CatalogValidationError && error.errors.some(item => item.includes('duplicates character/name')) && error.errors.some(item => item.includes('id is duplicated')));
  const forged = fixture();
  forged.skins[0].name = '另一个名字';
  assert.throws(() => validateCatalog(forged), /does not match character\/name identity/);
});

test('real dates, type enum and latest-release metadata are enforced independently of detection time', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-7-23', 'not-a-date']) {
    const catalog = fixture();
    catalog.skins[0].releaseDate = date;
    assert.throws(() => validateCatalog(catalog), /releaseDate must be a real/);
  }
  const checked = fixture();
  checked.checkedAt = '2027-03-04T12:34:56.789Z';
  assert.equal(validateCatalog(checked).updatedTo, '2026-07-23');
  checked.updatedTo = '2027-03-04';
  assert.throws(() => validateCatalog(checked), /never the detection date/);
  for (const timestamp of ['2026-02-30T00:00:00Z', '2026-07-23T25:00:00Z', '2026-07-23']) {
    const catalog = fixture(); catalog.checkedAt = timestamp;
    assert.throws(() => validateCatalog(catalog), /checkedAt must/);
  }
  const invalidType = fixture(); invalidType.skins[0].type = '动态';
  assert.throws(() => validateCatalog(invalidType), /type must be/);
});

test('path traversal, URLs, Windows aliases and duplicated file references are rejected', () => {
  for (const unsafe of ['../outside.jpg', '/assets/skins/a.jpg', 'https://example.com/a.jpg', 'assets/skins/../a.jpg', 'assets/skins/../../a.jpg', 'assets/skins/%2e%2e/a.jpg', 'assets\\skins\\a.jpg', 'assets/skins/a.jpg:stream', 'assets/skins/con.jpg', 'assets/skins/a.jpg?x=1']) {
    const catalog = fixture(); catalog.skins[0].artworkPath = unsafe;
    assert.throws(() => validateCatalog(catalog), /safe relative image path/, unsafe);
  }
  const duplicate = fixture(); duplicate.skins[1].artworkPath = duplicate.skins[0].artworkPath.toUpperCase().replace('ASSETS/SKINS/', 'assets/skins/');
  assert.throws(() => validateCatalog(duplicate), /Path is duplicated/);
});

test('guide paths belong to their record, including the preserved Cherbourg filename', () => {
  const catalog = fixture();
  for (const skin of catalog.skins) skin.guidePath = `assets/guides/${skin.id}.png`;
  assert.equal(validateCatalog(catalog).guideCount, 2);
  [catalog.skins[0].guidePath, catalog.skins[1].guidePath] = [catalog.skins[1].guidePath, catalog.skins[0].guidePath];
  assert.throws(() => validateCatalog(catalog), /does not belong to this skin identity/);
  const special = fixture(1), skin = special.skins[0];
  skin.character = '瑟堡'; skin.name = '布偶熊里面的是……？'; skin.id = stableSkinId(skin.character, skin.name);
  skin.guidePath = legacyGuidePath(skin.character, skin.name);
  assert.equal(skin.guidePath, 'assets/guides/瑟堡-布偶熊里面的是-玩法图.png');
  assert.equal(validateCatalog(special).guideCount, 1);
});

test('guide source or confirmation without a local guide remains pending', () => {
  const catalog = fixture(3);
  catalog.skins[0].guideSource = 'https://example.com/guide.png';
  catalog.skins[1].guideConfirmed = true;
  const stats = validateCatalog(catalog);
  assert.equal(stats.pendingGuideCount, 2);
  assert.equal(stats.missingGuideCount, 1);
  catalog.skins[0].guideSource = 'javascript:alert(1)';
  assert.throws(() => validateCatalog(catalog), /guideSource must/);
});

test('optional file verification finds missing, empty, altered-size and same-size corrupted images', t => {
  const rootDir = temporaryRoot(t), catalog = fixture(1), skin = catalog.skins[0];
  mkdirSync(path.join(rootDir, 'assets/skins'), { recursive: true });
  const target = path.join(rootDir, skin.artworkPath);
  assert.equal(validateCatalog(catalog).count, 1);
  assert.throws(() => validateCatalog(catalog, { rootDir, checkFiles: true }), /cannot be read/);
  writeFileSync(target, 'image-contents');
  skin.artworkBytes = Buffer.byteLength('image-contents');
  skin.artworkSha256 = createHash('sha256').update('image-contents').digest('hex');
  assert.equal(validateCatalog(catalog, { rootDir, checkFiles: true }).referencedFileCount, 1);
  writeFileSync(target, 'IMAGE-contents');
  assert.throws(() => validateCatalog(catalog, { rootDir, checkFiles: true }), /Sha256 does not match/);
  writeFileSync(target, 'short');
  assert.throws(() => validateCatalog(catalog, { rootDir, checkFiles: true }), /Bytes does not match/);
  writeFileSync(target, '');
  assert.throws(() => validateCatalog(catalog, { rootDir, checkFiles: true }), /not a nonempty file/);
  assert.throws(() => validateCatalog(catalog, { checkFiles: true }), /rootDir is required/);
});

test('legacy migration preserves artwork numbering, explicit guide mapping and confirmation', () => {
  const legacy = { version: 'legacy', skins: [['甲', '春', '换装', 'L2D', '2025-01-01', 1], ['乙', '夏', '换装2', '双形态', '2026-07-23', 0]] };
  const guides = extractLegacyGuides("const localGuides=new Set(['乙\\u0000夏']);");
  const sources = extractGuideSources("Base = 'https://example.com/ipfs/test'\n@('source.png', '乙-夏-玩法图.png')");
  const catalog = migrateLegacyCatalog(legacy, guides, { guideSources: sources, includeFileEvidence: false });
  assert.equal(catalog.skins[0].artworkPath, 'assets/skins/001.jpg');
  assert.equal(catalog.skins[1].artworkPath, 'assets/skins/002.jpg');
  assert.equal(catalog.skins[1].guidePath, 'assets/guides/乙-夏-玩法图.png');
  assert.equal(catalog.skins[1].guideSource, 'https://example.com/ipfs/test/source.png');
  assert.equal(validateCatalog(catalog).pendingGuideCount, 1);
  assert.throws(() => migrateLegacyCatalog(legacy, new Set(['未知\0未知']), { includeFileEvidence: false }), /have no skin record/);
});

test('JS mirror parser rejects executable input and supports a BOM', () => {
  assert.deepEqual(parseCatalogScript(`\uFEFF${serializeCatalog(fixture())}`), fixture());
  assert.throws(() => parseCatalogScript('window.L2D_SKINS_DATA = (() => { throw new Error(); })();'));
});
