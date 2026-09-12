import { createHash } from 'node:crypto';
import { stableSkinId, isValidDate } from './catalog.mjs';

export const OFFICIAL_API = 'https://api.biligame.com';
export const WIKI_API = 'https://wiki.biligame.com/blhx/api.php';
const wikiUrl = title => `https://wiki.biligame.com/blhx/${encodeURIComponent(title)}`;
const officialUrl = id => `https://game.bilibili.com/blhx/news/#news_detail_id=${id}`;
const digest = value => createHash('sha256').update(value).digest('hex');
const plain = value => htmlToText(value).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target).replace(/'''?/g, '').trim();

export function htmlToText(value) {
  return String(value ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|div|li|h[1-6]|tr)\b[^>]*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => { const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return n <= 0x10ffff ? String.fromCodePoint(n) : ''; })
    .replace(/&(nbsp|amp|quot|apos|lt|gt|middot|ldquo|rdquo|lsquo|rsquo|hellip|mdash|ndash|times|yen);/gi, (_, key) => ({ nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', middot: '·', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–', times: '×', yen: '¥' })[key.toLowerCase()])
    .replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizeType(value) {
  const s = plain(value).replace(/\s/g, '').replace(/＋/g, '+');
  if (/^(?:Live2D|L2D)\+$/i.test(s)) return 'L2D+';
  if (/^(?:Live2D|L2D)$/i.test(s)) return 'L2D';
  if (/^双形态(?:换装)?$/.test(s)) return '双形态';
  return null;
}

export function dateFromText(text, fallbackYear) {
  const m = String(text).match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  if (!m || !(m[1] || fallbackYear)) return null;
  const date = `${m[1] || fallbackYear}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isValidDate(date) ? date : null;
}

// Only sale sections establish a new release. Rental tickets, gift boxes, repairs,
// and returning sales may mention the same names and must not become new skins.
export function parseAnnouncement({ id, title, content, url = officialUrl(id) }) {
  const text = htmlToText(content);
  const date = dateFromText(title);
  if (!date || !/维护|港区改建/.test(title) || !/改建内容/.test(text) || !/发放(?:时间|对象)/.test(text)) {
    throw new Error(`公告缺少可核验的完整维护正文: ${title}`);
  }
  const skins = [], review = [];
  let inShop = false, kind = 'unclassified', releaseDate = date;
  for (const raw of text.split('\n')) {
    const line = plain(raw);
    if (!line) continue;
    if (/^(?:\d+[.．、]|[一二三四五六七八九十]+、)/.test(line)) {
      inShop = /换装商店.*上架.*换装/.test(line);
      kind = /全新|新增/.test(line) ? 'new' : /重返|复刻|再次/.test(line) ? 'returning' : 'unclassified';
      releaseDate = inShop ? dateFromText(line, date.slice(0, 4)) : date;
    }
    if (!inShop) continue;
    if (/^[◆◇【〖]?全新上架[◆◇】〗]?(?:[（(].*)?$/.test(line)) { kind = 'new'; releaseDate = dateFromText(line, date.slice(0, 4)) || releaseDate; continue; }
    if (/^[◆◇【〖]?(?:重返上架|复刻上架|再次上架|常驻上架)[◆◇】〗]?(?:[（(].*)?$/.test(line)) { kind = 'returning'; releaseDate = dateFromText(line, date.slice(0, 4)) || releaseDate; continue; }
    if (/^[（(]/.test(line) && dateFromText(line, date.slice(0, 4))) { releaseDate = dateFromText(line, date.slice(0, 4)); continue; }
    const match = line.match(/^([^「\n]+?)\s*[-－—]\s*「(.+)」\s*[【〖\[]([^】〗\]]+)[】〗\]]\s*[；;。]?$/);
    if (!match) {
      if (!/^※/.test(line) && /Live2D|L2D|双形态/i.test(line) && /「/.test(line)) review.push({ reason: 'UNPARSED_SKIN_LINE', evidence: line, announcementUrl: url });
      continue;
    }
    const type = normalizeType(match[3]);
    if (!type) continue;
    const item = { announcedCharacter: match[1].trim(), name: match[2], type, releaseDate, kind, announcementDate: date, announcementId: id, announcementTitle: title, announcementUrl: url, evidence: line };
    if (!releaseDate || kind === 'unclassified') review.push({ ...item, reason: 'UNPROVEN_NEW_RELEASE' });
    else skins.push(item);
  }
  return { id, title, url, date, bodySha256: digest(content), bodyCharacters: text.length, skins, review };
}

function splitTopLevel(text) {
  const fields = []; let start = 0, braces = 0, links = 0;
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { braces++; i++; } else if (pair === '}}') { braces--; i++; }
    else if (pair === '[[') { links++; i++; } else if (pair === ']]') { links--; i++; }
    else if (text[i] === '|' && !braces && !links) { fields.push(text.slice(start, i).trim()); start = i + 1; }
  }
  fields.push(text.slice(start).trim()); return fields;
}

export function extractTemplates(wikitext, wanted) {
  const text = String(wikitext).replace(/<!--[\s\S]*?-->/g, '');
  const found = [], stack = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text.slice(i, i + 2) === '{{') { stack.push(i); i++; }
    else if (text.slice(i, i + 2) === '}}' && stack.length) {
      const start = stack.pop(), fields = splitTopLevel(text.slice(start + 2, i));
      if (fields[0].replace(/^模板:/, '').trim() === wanted) found.push(fields.slice(1));
      i++;
    }
  }
  return found;
}

export function parseWikiCatalog(text) {
  const rows = [], review = [];
  for (const fields of extractTemplates(text, '换装图鉴列表')) {
    const type = normalizeType(fields[9]);
    if (!type) continue;
    const [character, , , name, variant] = fields.map(plain);
    const releaseDate = dateFromText(plain(fields[13]));
    if (fields.length !== 14 || !character || !name || !/^(?:换装(?:[2-9]|1\d)?|誓约)$/.test(variant) || !releaseDate || /[{}\[\]]/.test(character + name)) {
      review.push({ reason: 'INVALID_WIKI_ROW', character, name, evidence: fields.join('|') }); continue;
    }
    rows.push({ character, name, variant, type, releaseDate, wikiImage: `File:${character}${variant}.jpg`, wikiSource: wikiUrl('换装图鉴') });
  }
  if (!rows.length) throw new Error('WIKI 换装模板未识别到有效 L2D 记录；不能将格式变化当作无更新');
  return { rows, review };
}

// Gallery captions bind an exact skin name to an original image slot. Used when
// the overview table is late; type and first release date still come from the
// official new-sale section, never from guessing the highest image slot.
export function parseWikiGallery(text, title) {
  const rows = [];
  for (const gallery of String(text).matchAll(/<gallery\b[^>]*>([\s\S]*?)<\/gallery>/gi)) {
    for (const line of gallery[1].split('\n')) {
      const m = line.trim().match(/^(?:File:|文件:)?([^|]+\.jpg)\s*\|\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]([\s\S]+)$/i);
      if (!m) continue;
      const caption = htmlToText(m[3]), name = caption.match(/「(.+?)」/), image = m[1].match(/^(.+?)(换装(?:[2-9]|1\d)?|誓约)\.jpg$/);
      if (!name || !image || image[1] !== m[2]) continue;
      rows.push({ character: m[2], name: name[1], variant: image[2], wikiImage: `File:${m[1]}`, wikiSource: wikiUrl(title), type: normalizeType(caption.match(/[【〖]([^】〗]+)[】〗]/)?.[1]) });
    }
  }
  return rows;
}

export async function requestJson(url, { fetchImpl = fetch, retries = 2, timeoutMs = 30000, retryDelayMs = 600 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Mozilla/5.0 L2DLocalGallery/1.0', Referer: 'https://wiki.biligame.com/blhx/', Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const data = await response.json();
      if (!data || typeof data !== 'object' || data.error || (data.code !== undefined && data.code !== 0)) throw new Error(`来源接口返回错误: ${JSON.stringify(data.error || data.code)}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries && retryDelayMs) await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

function apiUrl(params) { return `${WIKI_API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`; }

/** Reads public sources only. Any missing/unprovable candidate remains in review.
 * Throws on incomplete network scans; callers must not publish an all-clear then.
 */
export async function getUpdates(catalog, options = {}) {
  const checkedAt = new Date(options.now ?? Date.now()).toISOString();
  const today = new Date(new Date(checkedAt).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const lookback = new Date(new Date(checkedAt).getTime() - 45 * 86400000).toISOString().slice(0, 10);
  const since = options.since ?? [catalog.updatedTo, lookback].sort()[0];
  if (!isValidDate(since)) throw new Error('更新扫描起始日期无效');
  const report = { checkedAt, since, sources: [], announcements: [], warnings: [] };
  const review = [], candidates = [], seen = new Set(catalog.skins.map(skin => skin.id));
  const request = url => requestJson(url, options);
  const pageCache = new Map();
  async function wikiPage(title, optional = false) {
    if (pageCache.has(title)) return pageCache.get(title);
    const url = apiUrl({ action: 'query', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main', redirects: '1', titles: title });
    const data = await request(url), page = data.query?.pages?.[0];
    if (!page || page.missing || typeof page.revisions?.[0]?.slots?.main?.content !== 'string') {
      if (optional && page?.missing) { pageCache.set(title, null); return null; }
      throw new Error(`WIKI 页面缺少正文: ${title}`);
    }
    const revision = page.revisions[0];
    const result = { title: page.title, text: revision.slots.main.content, redirects: data.query.redirects ?? [], revisionId: revision.revid };
    pageCache.set(title, result);
    report.sources.push({ name: page.title, url: wikiUrl(page.title), apiUrl: url, revisionId: revision.revid, revisionTimestamp: revision.timestamp, bodySha256: digest(result.text) });
    return result;
  }

  const listed = new Map(); let finished = false, recognizableNotices = 0;
  for (let pageNum = 1; pageNum <= (options.maxPages ?? 20); pageNum++) {
    const url = `${OFFICIAL_API}/news/list?${new URLSearchParams({ gameExtensionId: '103', positionId: '2', typeId: '1', pageNum: String(pageNum), pageSize: '30' })}`;
    const data = await request(url);
    if (!Array.isArray(data.data) || !Number.isFinite(data.totalNum) || Number(data.pageNo) !== pageNum) throw new Error('官网新闻列表结构不完整');
    const dates = [];
    for (const article of data.data) {
      if (typeof article.title !== 'string' || !Number.isSafeInteger(article.id)) throw new Error('官网新闻条目缺少标题或 ID');
      const date = dateFromText(article.title);
      if (!date || !/维护|港区改建/.test(article.title)) continue;
      dates.push(date); recognizableNotices++;
      if (date >= since && date <= today) {
        if (!Number.isSafeInteger(article.id)) throw new Error('官网新闻 ID 无效');
        listed.set(article.id, article);
      }
    }
    report.sources.push({ name: '碧蓝航线官网公告列表', url, page: pageNum, items: data.data.length });
    // A pinned old notice can appear before current notices; stop only on a
    // whole older page (or the true end), not the first old item in a page.
    if ((dates.length && dates.every(date => date < since)) || pageNum * 30 >= data.totalNum) { finished = true; break; }
  }
  if (!finished) throw new Error('达到公告分页上限，扫描未完成');
  if (!recognizableNotices) throw new Error('公告列表未包含可识别的维护日期，不能确认无更新');
  const wiki = await wikiPage('换装图鉴'), table = parseWikiCatalog(wiki.text);
  review.push(...table.review);
  for (const article of [...listed.values()].sort((a, b) => dateFromText(a.title).localeCompare(dateFromText(b.title)))) {
    const api = `${OFFICIAL_API}/news/${article.id}`, detail = await request(api);
    if (detail.data?.id !== article.id || detail.data?.gameExtensionId !== 103 || typeof detail.data?.content !== 'string') throw new Error(`官网公告正文结构不完整: ${article.id}`);
    const parsed = parseAnnouncement(detail.data);
    const entry = { id: parsed.id, title: parsed.title, date: parsed.date, url: parsed.url, apiUrl: api, bodySha256: parsed.bodySha256, bodyCharacters: parsed.bodyCharacters, newSkins: parsed.skins.filter(s => s.kind === 'new'), returningSkins: parsed.skins.filter(s => s.kind === 'returning'), acceptedIds: [], reviewCount: parsed.review.length };
    report.announcements.push(entry); review.push(...parsed.review);
    let galleries;
    async function supplementaryRows() {
      if (galleries) return galleries;
      galleries = [];
      const [y, m, d] = parsed.date.split('-').map(Number);
      const hour = parsed.title.match(/日(\d{1,2}:\d{2})/)?.[1] ?? '10:00';
      const mirror = await wikiPage(`${y}年${m}月${d}日${hour}港区改建`, true);
      if (!mirror) return galleries;
      for (const fields of extractTemplates(mirror.text, '专题传送门')) {
        for (const topic of fields.filter(t => t && !/[={}\[\]]/.test(t)).slice(0, 8)) {
          const page = await wikiPage(topic, true);
          if (page) galleries.push(...parseWikiGallery(page.text, page.title));
        }
      }
      return galleries;
    }
    for (const item of parsed.skins.filter(s => s.kind === 'new')) {
      if (item.releaseDate > today) { review.push({ ...item, reason: 'FUTURE_RELEASE' }); entry.reviewCount++; continue; }
      let matches = table.rows.filter(row => row.name === item.name);
      if (!matches.length) matches = (await supplementaryRows()).filter(row => row.name === item.name);
      matches = [...new Map(matches.map(row => [`${row.character}\0${row.name}\0${row.variant}`, row])).values()];
      if (matches.length !== 1) { review.push({ ...item, reason: matches.length ? 'AMBIGUOUS_WIKI_IDENTITY' : 'WIKI_SKIN_NOT_READY' }); entry.reviewCount++; continue; }
      const match = matches[0];
      if (match.releaseDate && match.releaseDate !== item.releaseDate) { review.push({ ...item, reason: 'RELEASE_DATE_CONFLICT', wikiRecord: match }); entry.reviewCount++; continue; }
      if (match.character !== item.announcedCharacter) {
        const [canonical, alias] = await Promise.all([wikiPage(match.character, true), wikiPage(item.announcedCharacter, true)]);
        const harmony = canonical && extractTemplates(canonical.text, '舰娘图鉴').some(fields => fields.some(field => /^和谐名\s*=/.test(field) && plain(field.replace(/^和谐名\s*=\s*/, '')) === item.announcedCharacter));
        if (!(harmony || alias?.title === match.character)) { review.push({ ...item, reason: 'UNVERIFIED_CHARACTER_ALIAS', wikiRecord: match }); entry.reviewCount++; continue; }
      }
      const id = stableSkinId(match.character, match.name);
      if (seen.has(id)) continue;
      if (match.type && match.type !== item.type) report.warnings.push({ id, reason: 'WIKI_TYPE_DIFFERS_FROM_OFFICIAL', officialType: item.type, wikiType: match.type, officialSource: item.announcementUrl, wikiSource: match.wikiSource });
      const imageApi = apiUrl({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|sha1', titles: match.wikiImage });
      const imageData = await request(imageApi), image = imageData.query?.pages?.[0]?.imageinfo?.[0];
      let imageUrl;
      try { imageUrl = new URL(image?.url); } catch { /* absent image is a review item */ }
      if (!imageUrl || imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'patchwiki.biligame.com' || imageUrl.username || imageUrl.password || imageUrl.port || !/^image\/(?:jpeg|png|webp)$/.test(image?.mime) || !(image?.width > 0 && image?.height > 0)) {
        review.push({ ...item, reason: 'WIKI_ORIGINAL_IMAGE_NOT_READY', wikiRecord: match }); entry.reviewCount++; continue;
      }
      const ext = image.mime === 'image/png' ? 'png' : image.mime === 'image/webp' ? 'webp' : 'jpg';
      const skin = { id, character: match.character, name: match.name, variant: match.variant, type: item.type, releaseDate: item.releaseDate, artworkPath: `assets/skins/${id}.${ext}`, guidePath: null, artworkSource: image.url, guideSource: null, guideConfirmed: false, announcementSource: item.announcementUrl, announcementApi: api, announcementBodySha256: parsed.bodySha256, announcedCharacter: item.announcedCharacter, wikiSource: match.wikiSource, wikiImage: match.wikiImage };
      candidates.push(skin); seen.add(id); entry.acceptedIds.push(id);
    }
  }
  report.newCount = candidates.length; report.reviewCount = review.length;
  report.latestAnnouncement = report.announcements.at(-1)?.date ?? null;
  return { candidates, review, report };
}
