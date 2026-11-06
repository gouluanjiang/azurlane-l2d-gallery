import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const batch = require('../desktop/tryout/batch.cjs');
const auto = require('../desktop/tryout/auto-verify.cjs');
const { normalizeName, recordFrom } = require('../desktop/tryout/site-lookup.cjs');
const catalog = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const synced = { id: 'azl-0123456789abcdef', character: '测试舰', name: '新上线的换装', variant: '换装', type: 'L2D', releaseDate: '2026-12-01' };
const withSynced = { ...catalog, skins: [...catalog.skins, synced] };
const found = (id, kind = 'LIVE2D', plus = false) => ({ onlineId: id, dynamicType: kind === 'SPINE' ? 'spine' : 'live2d', isLive2d: kind !== 'SPINE', isLive2dPlus: plus, title: `${synced.character} ·「 ${synced.name}」- 碧蓝航线` });

test('names match across spacing, quotes, accents and full-width punctuation', () => {
  for (const [a, b] of [['甜蜜夏日', '“甜蜜”夏日'], ['Loisirsbalneaires', 'Loisirs balnéaires'], ['HappyDating！', 'Happy Dating!'], ['CharmingRabbit', 'Charming Rabbit']]) assert.equal(normalizeName(a), normalizeName(b));
  assert.notEqual(normalizeName('突袭！黑暗基地！'), normalizeName('突袭！暗黑基地！'));
});

test('only one Live2D (plus at most one Spine) on the same character becomes a match', () => {
  const ships = ['测试舰 #99999'];
  assert.equal(recordFrom(synced, { ships, candidates: [found('9999901')] }, '2026-12-02').status, 'matched');
  assert.deepEqual(recordFrom(synced, { ships, candidates: [found('9999901'), found('9999902', 'SPINE')] }, 'x').candidates.map(c => c.dynamicType), ['live2d', 'spine']);
  assert.equal(recordFrom(synced, { ships, candidates: [found('9999901'), found('9999903')] }, 'x').status, 'review');
  assert.equal(recordFrom(synced, { ships, candidates: [found('9999902', 'SPINE')] }, 'x').status, 'review');
  assert.equal(recordFrom(synced, { ships, candidates: [{ ...found('9999901'), title: '别的舰船 ·「 新上线的换装」' }] }, 'x').status, 'review');
  assert.equal(recordFrom(synced, { ships: [], candidates: [] }, 'x').status, 'review');
  assert.equal(recordFrom(synced, { ships, candidates: [], error: 'TIMEOUT' }, 'x').status, 'review');
});

test('a skin verified on this computer opens in the full release only, and shipped records win', () => {
  const store = { schemaVersion: 1, records: [], attempts: {} };
  assert.equal(batch.batchFrom(withSynced, batch.fullRelease).availability.at(-1).status, 'review');
  auto.applyResult(store, synced, { ships: ['测试舰'], candidates: [found('9999901')] }, '2026-12-02T00:00:00.000Z');
  const opened = batch.batchFrom(withSynced, batch.fullRelease, { extraRecords: store.records });
  const sample = opened.samples.find(s => s.id === synced.id);
  assert.equal(sample.onlineId, '9999901'); assert.equal(sample.label, '本机自动核对'); assert.equal(sample.verifiedAt, '2026-12-02');
  assert.equal(batch.batchFrom(withSynced, 4, { extraRecords: store.records }).availability.at(-1).status, 'review');
  const shipped = catalog.skins[0];
  const conflicting = [{ ...store.records[0], id: shipped.id, character: shipped.character, name: shipped.name, type: shipped.type, candidates: [{ ...store.records[0].candidates[0], onlineId: '1' }] }];
  const full = batch.batchFrom(catalog, batch.fullRelease), overridden = batch.batchFrom(catalog, batch.fullRelease, { extraRecords: conflicting });
  assert.equal(overridden.samples.find(s => s.id === shipped.id).onlineId, full.samples.find(s => s.id === shipped.id).onlineId);
});

test('pending skins: review only, newest first, skip verified and recent attempts, keep a limit', () => {
  const availability = batch.batchFrom(withSynced, batch.fullRelease).availability;
  const store = { schemaVersion: 1, records: [], attempts: {} };
  assert.deepEqual(auto.pendingSkins(withSynced, availability, store).map(s => s.id), [synced.id]);
  const now = Date.parse('2026-12-02T00:00:00Z');
  store.attempts[synced.id] = { at: '2026-12-01T00:00:00.000Z', status: 'review' };
  assert.equal(auto.pendingSkins(withSynced, availability, store, { now }).length, 0);
  assert.equal(auto.pendingSkins(withSynced, availability, store, { now: now + 4 * 86400000 }).length, 1);
  auto.applyResult(store, synced, { ships: ['测试舰'], candidates: [found('9999901')] });
  assert.equal(auto.pendingSkins(withSynced, availability, store, { now: now + 9 * 86400000 }).length, 0);
  const many = { ...catalog, skins: [...catalog.skins, ...Array.from({ length: 30 }, (_, i) => ({ ...synced, id: `azl-${String(i).padStart(16, '0')}`, name: `换装${i}` }))] };
  assert.equal(auto.pendingSkins(many, batch.batchFrom(many, batch.fullRelease).availability, { schemaVersion: 1, records: [], attempts: {} }).length, 20);
});

test('the local store survives a restart and an unreadable file is set aside, not trusted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l2d-auto-'));
  try {
    assert.deepEqual(auto.loadStore(root), { schemaVersion: 1, records: [], attempts: {} });
    const store = auto.loadStore(root); auto.applyResult(store, synced, { ships: ['测试舰'], candidates: [found('9999901')] }); auto.saveStore(root, store);
    assert.equal(auto.loadStore(root).records[0].candidates[0].onlineId, '9999901');
    fs.writeFileSync(path.join(root, auto.STORE), '{broken');
    assert.equal(auto.loadStore(root).records.length, 0);
    assert(fs.readdirSync(path.join(root, '.desktop-data')).some(name => name.includes('unreadable')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a stalled page is reopened through the other accepted address of the same skin', () => {
  const { alternateModelUrl, allowedModelUrl } = require('../desktop/tryout/samples.cjs');
  const sample = { onlineId: '299034' };
  const fromNew = alternateModelUrl('https://l2d.su/azurlane/skins/299034/', sample), fromOld = alternateModelUrl('https://l2d.su/cn/skins/299034/', sample);
  assert.equal(fromNew, 'https://l2d.su/cn/skins/299034/'); assert.equal(fromOld, 'https://l2d.su/azurlane/skins/299034/');
  for (const url of [fromNew, fromOld, alternateModelUrl('', sample)]) assert.equal(allowedModelUrl(url, sample), true);
});
