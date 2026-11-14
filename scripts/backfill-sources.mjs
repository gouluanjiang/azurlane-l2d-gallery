// One-time backfill: give the original gallery artwork (migrated without a
// download address) its public WIKI source, so a fresh machine can rebuild the
// gallery from the repository alone. A source is recorded only when the WIKI
// file's SHA-1 equals the local file byte for byte; the catalog is committed
// through the regular transactional sync, so a failure leaves it unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseWikiCatalog, requestJson, WIKI_API } from './lib/sources.mjs';
import { validateCatalog } from './lib/catalog.mjs';
import { allowedImageUrl, sha256 } from './lib/transport.mjs';
import { readJson, safePath, syncCatalog } from './lib/sync-engine.mjs';

const root = process.env.L2D_DATA_ROOT
  ? path.resolve(process.env.L2D_DATA_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const api = params => `${WIKI_API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
const wikiText = async title => {
  const data = await requestJson(
    api({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', redirects: '1', titles: title })
  );
  const revision = data.query?.pages?.[0]?.revisions?.[0];
  if (typeof revision?.slots?.main?.content !== 'string') throw new Error(`WIKI 页面缺少正文: ${title}`);
  return revision.slots.main.content;
};
const loose = value => value.replace(/\s+/g, '');

const current = readJson(path.join(root, 'data/catalog.json'));
validateCatalog(current);
const table = parseWikiCatalog(await wikiText('换装图鉴'), { clothListText: await wikiText('模块:ClothList/json') });
// The WIKI lists some retrofits under a suffixed name (天城 → 天城CV), so a row
// matches on the same skin name with the same or a suffixed character name.
const rowFor = skin => {
  const rows = table.rows.filter(
    r => loose(r.name) === loose(skin.name) && loose(r.character).startsWith(loose(skin.character))
  );
  return rows.find(r => loose(r.character) === loose(skin.character)) ?? (rows.length === 1 ? rows[0] : null);
};

const next = structuredClone(current),
  filled = [],
  skipped = [];
for (const skin of next.skins.filter(s => !s.artworkSource)) {
  const row = rowFor(skin);
  if (!row) {
    skipped.push(`${skin.character}「${skin.name}」：WIKI 中没有唯一对应的换装`);
    continue;
  }
  const info = (
    await requestJson(api({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|sha1', titles: row.wikiImage }))
  ).query?.pages?.[0]?.imageinfo?.[0];
  const local = fs.readFileSync(safePath(root, skin.artworkPath));
  if (sha256(local) !== skin.artworkSha256) throw new Error(`本地原图与图鉴记录不一致：${skin.artworkPath}`);
  try {
    allowedImageUrl(info?.url);
  } catch {
    skipped.push(`${skin.character}「${skin.name}」：WIKI 原图地址不可用`);
    continue;
  }
  if (info.sha1 !== createHash('sha1').update(local).digest('hex') || info.size !== local.length) {
    skipped.push(`${skin.character}「${skin.name}」：WIKI 文件与本地原图不同`);
    continue;
  }
  Object.assign(skin, { artworkSource: info.url, wikiSource: row.wikiSource, wikiImage: row.wikiImage });
  filled.push(`${skin.character}「${skin.name}」 ← ${row.wikiImage}`);
}
for (const line of filled) console.log(`补来源：${line}`);
for (const line of skipped) console.log(`未补：${line}`);
console.log(`补来源 ${filled.length} 款，未补 ${skipped.length} 款`);
if (dryRun || !filled.length) process.exit(0);
next.version = `${new Date().toISOString().replace(/[-:.]/g, '')}-${sha256(JSON.stringify(next.skins)).slice(0, 12)}`;
validateCatalog(next);
const result = await syncCatalog({ rootDir: root, nextCatalog: next, progress: console.log });
console.log(
  JSON.stringify(
    { status: result.status, filled: filled.length, count: result.count, version: result.version },
    null,
    2
  )
);
