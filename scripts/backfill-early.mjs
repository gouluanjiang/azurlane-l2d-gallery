// One-time backfill: add the L2D costumes released before the gallery's original
// start date (2023-09-21). Identity, type, date and original image come from the
// WIKI costume list, the same source the regular updater verifies against.
// Images are downloaded and hash-checked first; the catalog is then committed
// through the regular transactional sync, so a failure leaves the gallery as it was.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWikiCatalog, requestJson, WIKI_API } from './lib/sources.mjs';
import { validateCatalog, stableSkinId } from './lib/catalog.mjs';
import { fetchImage, sha256 } from './lib/transport.mjs';
import { atomicWrite, readJson, safePath, syncCatalog } from './lib/sync-engine.mjs';

const root = process.env.L2D_DATA_ROOT ? path.resolve(process.env.L2D_DATA_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const before = process.argv.includes('--before') ? process.argv[process.argv.indexOf('--before') + 1] : '2023-09-21';
const dryRun = process.argv.includes('--dry-run');
const api = params => `${WIKI_API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
const wikiText = async title => {
  const data = await requestJson(api({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', redirects: '1', titles: title }));
  const revision = data.query?.pages?.[0]?.revisions?.[0];
  if (typeof revision?.slots?.main?.content !== 'string') throw new Error(`WIKI 页面缺少正文: ${title}`);
  return revision.slots.main.content;
};
const loose = value => value.replace(/\s+/g, '');

const current = readJson(path.join(root, 'data/catalog.json'));
validateCatalog(current);
const table = parseWikiCatalog(await wikiText('换装图鉴'), { clothListText: await wikiText('模块:ClothList/json') });
const known = new Set(current.skins.map(s => `${loose(s.character)}\0${loose(s.name)}`));
const rows = table.rows.filter(row => row.releaseDate < before && !known.has(`${loose(row.character)}\0${loose(row.name)}`))
  .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.character.localeCompare(b.character, 'zh'));
console.log(`WIKI 中 ${before} 之前的 L2D 换装待补录 ${rows.length} 款`);
if (dryRun) { for (const r of rows) console.log(`${r.releaseDate} ${r.character}「${r.name}」${r.type}`); process.exit(0); }

const added = [];
for (const [index, row] of rows.entries()) {
  const id = stableSkinId(row.character, row.name);
  const info = (await requestJson(api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|sha1', titles: row.wikiImage }))).query?.pages?.[0]?.imageinfo?.[0];
  let url;
  try { url = new URL(info?.url); } catch { /* reported below */ }
  if (!url || url.protocol !== 'https:' || url.hostname !== 'patchwiki.biligame.com' || !/^image\/(?:jpeg|png|webp)$/.test(info?.mime)) throw new Error(`WIKI 原图不可用：${row.character}「${row.name}」${row.wikiImage}`);
  const ext = info.mime === 'image/png' ? 'png' : info.mime === 'image/webp' ? 'webp' : 'jpg';
  const artworkPath = `assets/skins/${id}.${ext}`, destination = safePath(root, artworkPath);
  let bytes;
  if (fs.existsSync(destination)) bytes = fs.readFileSync(destination);
  else {
    const image = await fetchImage(info.url);
    if (image.format !== ext) throw new Error(`来源图片格式不一致：${row.name}`);
    bytes = image.bytes; atomicWrite(destination, bytes); // unreferenced until the catalog commits
  }
  console.log(`原图 ${index + 1}/${rows.length}：${row.character}「${row.name}」 ${(bytes.length / 1048576).toFixed(1)} MB`);
  added.push({ id, character: row.character, name: row.name, variant: row.variant, type: row.type, releaseDate: row.releaseDate, artworkPath, guidePath: null,
    artworkSource: info.url, guideSource: null, guideConfirmed: false, wikiSource: row.wikiSource, wikiImage: row.wikiImage, artworkSha256: sha256(bytes), artworkBytes: bytes.length, source: 'wiki-backfill' });
}
const next = structuredClone(current);
next.skins = [...added, ...next.skins];
next.version = `${new Date().toISOString().replace(/[-:.]/g, '')}-${sha256(JSON.stringify(next.skins)).slice(0, 12)}`;
validateCatalog(next);
const result = await syncCatalog({ rootDir: root, nextCatalog: next, progress: console.log });
console.log(JSON.stringify({ status: result.status, added: added.length, count: result.count, version: result.version }, null, 2));
