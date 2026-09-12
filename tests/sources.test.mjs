import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stableSkinId } from '../scripts/lib/catalog.mjs';
import { dateFromText, htmlToText, normalizeType, parseAnnouncement, parseWikiCatalog, parseWikiGallery, requestJson, getUpdates } from '../scripts/lib/sources.mjs';

const fixture = name => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/sources/${name}`, import.meta.url)), 'utf8').replace(/^\uFEFF/, ''));
const pageText = page => page.response.query.pages[0].revisions[0].slots.main.content;
const pages = fixture('wiki-pages.json');
const baseCatalog = () => ({ updatedTo: '2026-07-23', skins: [{ id: stableSkinId('普利茅斯', '纯白天使的全身检查') }, { id: stableSkinId('冈依沙瓦号', '真我的显影') }] });
const runOptions = { now: '2026-09-12T08:00:00.000Z', retries: 0, retryDelayMs: 0 };
function fixtureFetch(mutate = (_url, data) => data) {
  return async url => {
    const parsed = new URL(url); let data;
    if (parsed.hostname === 'api.biligame.com') data = parsed.pathname === '/news/list' ? fixture(parsed.searchParams.get('pageNum') === '2' ? 'official-list-page2.json' : 'official-list.json') : fixture(`official-${parsed.pathname.split('/').at(-1)}.json`);
    else {
      const title = parsed.searchParams.get('titles');
      const list = parsed.searchParams.get('prop') === 'imageinfo' ? fixture('wiki-images.json') : fixture('wiki-pages.json');
      data = list.find(p => p.requestedTitle === title || p.response.query.pages[0].title === title)?.response ?? { query: { pages: [{ title, missing: true }] } };
    }
    data = mutate(parsed, data);
    return { ok: true, status: 200, json: async () => data };
  };
}

test('latest real official notice: four new skins, six returning, gift box repeats excluded', () => {
  const parsed = parseAnnouncement(fixture('official-18328.json').data);
  assert.equal(parsed.date, '2026-09-08');
  assert.equal(parsed.skins.filter(s => s.kind === 'new').length, 4);
  assert.equal(parsed.skins.filter(s => s.kind === 'returning').length, 6);
  assert.deepEqual(parsed.skins.filter(s => s.kind === 'new').map(s => [s.announcedCharacter, s.name, s.type]), [
    ['鮟', '午夜的瑰色电梯', '双形态'], ['腓德雷卡·卡尔', '午夜频道', 'L2D+'], ['狮', '夜巷中的诱引者', 'L2D+'], ['光辉', '幽影徘徊之夜', 'L2D+'],
  ]);
  assert.equal(parsed.review.length, 0);
});

test('August dates attached to subsection headers and separate returning date ranges', () => {
  const parsed = parseAnnouncement(fixture('official-18247.json').data);
  assert.deepEqual(parsed.skins.filter(s => s.kind === 'new').map(s => s.releaseDate), Array(3).fill('2026-08-13'));
  assert.equal(parsed.skins.filter(s => s.kind === 'returning').length, 7);
  assert.equal(parsed.skins.find(s => s.name === '斟酒女郎的赌局').releaseDate, '2026-08-20');
  assert.equal(parsed.review.length, 0);
});

test('maintenance without eligible new skins is an actual no-update result', () => {
  for (const id of [18315, 18214, 18192]) assert.deepEqual(parseAnnouncement(fixture(`official-${id}.json`).data).skins, []);
  const returningOnly = parseAnnouncement(fixture('official-18283.json').data);
  assert.equal(returningOnly.skins.filter(s => s.kind === 'new').length, 0);
  assert.equal(returningOnly.skins.filter(s => s.kind === 'returning').length, 1);
});

test('teasers and missing maintenance body are rejected', () => {
  const teaser = fixture('official-list.json').data.find(a => a.id === 18328);
  assert.throws(() => parseAnnouncement(teaser), /完整维护正文/);
  assert.throws(() => parseAnnouncement({ title: '维护公告', content: 'L2D更新' }), /完整维护正文/);
});

test('ambiguous sales never become a new release', () => {
  const article = { id: 1, title: '2026年9月8日维护公告', content: '改建内容\n1.换装商店限时上架以下换装（9月8日维护后）：\n角色-「皮肤」【Live2D+】\n发放时间' };
  const parsed = parseAnnouncement(article);
  assert.equal(parsed.skins.length, 0);
  assert.equal(parsed.review[0].reason, 'UNPROVEN_NEW_RELEASE');
  const undated = parseAnnouncement({ ...article, content: article.content.replace('限时上架以下换装（9月8日维护后）', '全新上架以下换装') });
  assert.equal(undated.skins.length, 0);
  assert.equal(undated.review[0].reason, 'UNPROVEN_NEW_RELEASE');
});

test('HTML entities preserve exact names and type normalization excludes dynamic art', () => {
  assert.equal(htmlToText('腓德雷卡&middot;卡尔<br>「&ldquo;魔女&rdquo;」'), '腓德雷卡·卡尔\n「“魔女”」');
  assert.equal(normalizeType('Live2D＋'), 'L2D+');
  assert.equal(normalizeType('双形态换装'), '双形态');
  assert.equal(normalizeType('特殊动态立绘'), null);
  assert.equal(dateFromText('2026年2月30日'), null);
});

test('real WIKI template separates nested pipes and excludes incomplete fields', () => {
  const parsed = parseWikiCatalog(pageText(pages[0]));
  const row = parsed.rows.find(s => s.name === '只为你献上的应援');
  assert.deepEqual([row.character, row.variant, row.releaseDate, row.type], ['武藏', '换装3', '2026-08-13', 'L2D+']);
  const nested = '{{换装图鉴列表|角色|航母|皇家|皮肤|换装|主题|1200|商店|差分|L2D+|背景|挂件|{{备注|a|b}}|2026年09月08日}}';
  assert.equal(parseWikiCatalog(nested).rows.length, 1);
  assert.throws(() => parseWikiCatalog(nested.replace('2026年09月08日', '待补充')), /未识别到有效/);
  assert.throws(() => parseWikiCatalog('服务器繁忙'), /格式变化/);
});

test('event gallery gives explicit image slots when overview is behind', () => {
  const rows = parseWikiGallery(pageText(pages[2]), pages[2].requestedTitle);
  assert.deepEqual(rows.slice(0, 4).map(r => [r.character, r.name, r.variant]), [
    ['安土', '午夜的瑰色电梯', '换装'], ['腓特烈·卡尔', '午夜频道', '换装3'], ['狮', '夜巷中的诱引者', '换装2'], ['光辉', '幽影徘徊之夜', '换装8'],
  ]);
  assert.equal(parseWikiGallery('<gallery>角色换装2.jpg|[[另一个角色]]「皮肤」【Live2D】</gallery>', '测试').length, 0);
});

test('full recorded public source scan produces exactly seven additions and no false reruns', async () => {
  const result = await getUpdates(baseCatalog(), { ...runOptions, fetchImpl: fixtureFetch() });
  assert.equal(result.candidates.length, 7);
  assert.equal(result.review.length, 0);
  assert.equal(result.report.latestAnnouncement, '2026-09-08');
  assert.equal(result.report.sources.filter(s => s.name === '碧蓝航线官网公告列表').length, 2);
  assert.equal(result.report.announcements.at(-1).returningSkins.length, 6);
  assert.equal(result.report.announcements.at(-1).acceptedIds.length, 4);
  assert.equal(result.report.warnings.length, 2);
  assert.deepEqual(result.candidates.map(s => s.character), ['本宁顿', '不挠', '武藏', '安土', '腓特烈·卡尔', '狮', '光辉']);
  for (const skin of result.candidates) {
    assert.equal(skin.id, stableSkinId(skin.character, skin.name));
    assert.match(skin.artworkSource, /^https:\/\/patchwiki.biligame.com\//);
    assert.equal(skin.guidePath, null);
    assert.equal(skin.guideConfirmed, false);
  }
  const rerun = await getUpdates({ ...baseCatalog(), updatedTo: '2026-09-08', skins: [...baseCatalog().skins, ...result.candidates] }, { ...runOptions, fetchImpl: fixtureFetch() });
  assert.equal(rerun.candidates.length, 0);
  assert.equal(rerun.review.length, 0);
});

test('unverified aliases stay in review instead of skin-name-only matching', async () => {
  const result = await getUpdates(baseCatalog(), { ...runOptions, fetchImpl: fixtureFetch((url, data) => {
    if (url.searchParams.get('titles') === '安土') data.query.pages[0].revisions[0].slots.main.content = '{{舰娘图鉴|名称=安土}}';
    return data;
  }) });
  assert.equal(result.candidates.length, 6);
  assert.equal(result.review[0].reason, 'UNVERIFIED_CHARACTER_ALIAS');
});

test('missing image and mismatched WIKI date remain pending', async () => {
  const result = await getUpdates(baseCatalog(), { ...runOptions, fetchImpl: fixtureFetch((url, data) => {
    const title = url.searchParams.get('titles');
    if (title === 'File:光辉换装8.jpg') delete data.query.pages[0].imageinfo;
    if (title === '换装图鉴') data.query.pages[0].revisions[0].slots.main.content = data.query.pages[0].revisions[0].slots.main.content.replace(/(本宁顿[^\n]+)2026年08月13日/, '$12026年08月12日');
    return data;
  }) });
  assert.equal(result.candidates.length, 5);
  assert.deepEqual(result.review.map(r => r.reason), ['RELEASE_DATE_CONFLICT', 'WIKI_ORIGINAL_IMAGE_NOT_READY']);
});

test('non-200 and malformed source responses throw and never report successful no-update', async () => {
  let attempts = 0;
  await assert.rejects(() => requestJson('https://example.test/', { fetchImpl: async () => { attempts++; return { ok: false, status: 503 }; }, retries: 2, retryDelayMs: 0 }), /HTTP 503/);
  assert.equal(attempts, 3);
  await assert.rejects(() => getUpdates(baseCatalog(), { ...runOptions, fetchImpl: async () => ({ ok: true, json: async () => ({ code: 0 }) }) }), /列表结构不完整/);
  await assert.rejects(() => getUpdates(baseCatalog(), { ...runOptions, fetchImpl: fixtureFetch((url, data) => { if (url.pathname === '/news/18328') delete data.data.content; return data; }) }), /正文结构不完整/);
  await assert.rejects(() => getUpdates(baseCatalog(), { ...runOptions, fetchImpl: async () => ({ ok: true, json: async () => ({ code: 0, pageNo: 1, totalNum: 0, data: [] }) }) }), /不能确认无更新/);
});
