// Opens newly synced skins in the tryout without a new build: the gallery looks
// them up on l2d.su (site-lookup.cjs) in a hidden window and keeps the verified
// mappings on this computer. Anything not exact stays in review and is retried later.
const fs = require('node:fs');
const path = require('node:path');
const { lookupScript, recordFrom } = require('./site-lookup.cjs');

const STORE = '.desktop-data/tryout-auto-verify.json';
const emptyStore = () => ({ schemaVersion: 1, records: [], attempts: {} });

function loadStore(libraryRoot) {
  const file = path.join(libraryRoot, STORE);
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value?.schemaVersion !== 1 || !Array.isArray(value.records) || typeof value.attempts !== 'object') throw new Error('format');
    return value;
  } catch (error) {
    if (error.code !== 'ENOENT') { try { fs.copyFileSync(file, `${file}.unreadable-${Date.now()}`); } catch { /* keep going with an empty store */ } }
    return emptyStore();
  }
}
function saveStore(libraryRoot, store) {
  const file = path.join(libraryRoot, STORE), temp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(store, null, 2) + '\n'); fs.renameSync(temp, file);
}

// Skins still in review, never verified here, and not tried within retryDays.
function pendingSkins(catalog, availability, store, { now = Date.now(), retryDays = 3, limit = 20 } = {}) {
  const verified = new Set(store.records.map(r => r.id));
  const reviewIds = new Set(availability.filter(row => row.status === 'review').map(row => row.id));
  return catalog.skins.filter(skin => reviewIds.has(skin.id) && !verified.has(skin.id))
    .filter(skin => { const at = Date.parse(store.attempts[skin.id]?.at || ''); return !(at > now - retryDays * 86400000); })
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, limit);
}

// Records a lookup outcome; only exact matches become records.
function applyResult(store, skin, result, at = new Date().toISOString()) {
  const record = recordFrom(skin, result, at.slice(0, 10));
  store.attempts[skin.id] = { at, status: record.status, reason: record.reason };
  if (record.status === 'matched') store.records = [...store.records.filter(r => r.id !== skin.id), { ...record, verifiedAt: at, method: 'site-lookup' }];
  return record;
}

class AutoVerifier {
  constructor({ libraryRoot, partition = 'persist:l2d-auto-verify' }) { this.libraryRoot = libraryRoot; this.partition = partition; }
  async verify(skins, { progress = () => {} } = {}) {
    if (!skins.length) return { checked: 0, opened: [], unresolved: [] };
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({ show: false, width: 1280, height: 840, webPreferences: { partition: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const wc = win.webContents;
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (event, url) => { if (!url.startsWith('https://l2d.su/')) event.preventDefault(); });
    wc.session.on('will-download', event => event.preventDefault());
    const store = loadStore(this.libraryRoot), opened = [], unresolved = [];
    const open = async () => {
      await wc.loadURL('https://l2d.su/azurlane/skins/818011/');
      for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 700)); if (await wc.executeJavaScript("!!document.querySelector('.model-settings-inline')")) return; }
      throw new Error('l2d.su 页面未就绪');
    };
    const run = query => Promise.race([wc.executeJavaScript(lookupScript(query)), new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 90000))]);
    try {
      await open();
      for (const [index, skin] of skins.entries()) {
        progress(`正在核对试玩模型 ${index + 1}/${skins.length}：${skin.character}「${skin.name}」`);
        let result;
        try { result = await run(skin); if (!result.error && !result.ships.length) { await open(); result = await run(skin); } }
        catch (error) { result = { ships: [], candidates: [], error: error.message }; try { await open(); } catch { /* next skin retries */ } }
        const record = applyResult(store, skin, result);
        (record.status === 'matched' ? opened : unresolved).push({ id: skin.id, character: skin.character, name: skin.name, reason: record.reason });
        saveStore(this.libraryRoot, store);
      }
    } finally { if (!win.isDestroyed()) win.destroy(); }
    return { checked: skins.length, opened, unresolved };
  }
}

module.exports = { STORE, loadStore, saveStore, pendingSkins, applyResult, AutoVerifier };
