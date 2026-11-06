// Finds l2d.su online IDs for gallery skins through the site's own UI: its ship
// search, the costume tiles (name and Live2D / Live2D+ / Spine tag) and the
// model label shown after a tile is opened. The site's catalog files are
// encrypted; they are neither read nor decoded here.

// Names differ in spacing, quotes, accents and full-width punctuation between the WIKI and the site
// (甜蜜夏日 / “甜蜜”夏日, Loisirsbalneaires / Loisirs balnéaires).
function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFKC').replace(/[\s　"'“”‘’「」『』]+/g, '').replace(/[·•・]/g, '·').replace(/[～〜]/g, '~').toLowerCase();
}

// Runs inside an l2d.su page. Returns {character,name,ships,candidates,error?}.
async function lookupInPage(query) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  // Same rule as normalizeName (this function is serialized into the page).
  const norm = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFKC').replace(/[\s　"'“”‘’「」『』]+/g, '').replace(/[·•・]/g, '·').replace(/[～〜]/g, '~').toLowerCase();
  const label = () => document.querySelector('.model-settings-inline')?.textContent.trim() || '';
  async function until(check, ms) { const end = Date.now() + ms; while (Date.now() < end) { const value = check(); if (value) return value; await sleep(150); } return null; }
  async function showList() {
    if (document.querySelector('nav[aria-label="舰船列表"]')) return true;
    document.querySelector('.model-settings-inline')?.click();
    return Boolean(await until(() => document.querySelector('nav[aria-label="舰船列表"]'), 3000));
  }
  const out = { character: query.character, name: query.name, ships: [], candidates: [] };
  if (!await showList()) return { ...out, error: 'SHIP_LIST_NOT_FOUND' };
  const input = document.querySelector('input[aria-label="搜索"]');
  if (!input) return { ...out, error: 'SEARCH_NOT_FOUND' };
  const setSearch = value => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
  const matchingShips = () => [...(document.querySelector('nav[aria-label="舰船列表"]')?.querySelectorAll('button') || [])].filter(b => /#\d+/.test(b.innerText) && b.innerText.split('\n')[0].trim().split(/\s+/)[0] === query.character);
  // The list fills asynchronously (and slowly right after a page load): wait for real results.
  setSearch(''); await sleep(200); setSearch(query.character);
  await until(() => matchingShips().length ? true : null, 6000);
  const ships = matchingShips();
  out.ships = ships.map(b => b.innerText.replace(/\n+/g, ' ').slice(0, 60));
  for (let shipIndex = 0; shipIndex < ships.length; shipIndex++) {
    if (!await showList()) return { ...out, error: 'SHIP_LIST_LOST' };
    const ship = [...document.querySelector('nav[aria-label="舰船列表"]').querySelectorAll('button')].filter(b => /#\d+/.test(b.innerText) && b.innerText.split('\n')[0].trim().split(/\s+/)[0] === query.character)[shipIndex];
    if (!ship) break;
    if (ship.getAttribute('aria-expanded') !== 'true') ship.click();
    await until(() => document.querySelector('.ship-skin-tile') ? true : null, 5000); await sleep(300);
    const tiles = () => [...document.querySelectorAll('.ship-skin-tile')].filter(t => norm(t.getAttribute('title')) === norm(query.name));
    const count = tiles().length;
    for (let i = 0; i < count; i++) {
      const tile = tiles()[i]; if (!tile) break;
      const tag = (/(Live2D\+|Live2D|Spine)\s*$/.exec(tile.innerText.trim()) || [])[1] || '';
      const previous = label(); tile.click();
      const shown = await until(() => { const text = label(); return text !== previous && /(LIVE2D|SPINE) #(\d+)/.exec(text) ? text : null; }, 8000);
      const m = shown && /(LIVE2D|SPINE) #(\d+)/.exec(shown);
      if (m) out.candidates.push({ onlineId: m[2], dynamicType: m[1] === 'SPINE' ? 'spine' : 'live2d', isLive2d: m[1] !== 'SPINE', isLive2dPlus: tag === 'Live2D+', tileTag: tag, title: document.title });
      else out.candidates.push({ error: 'LABEL_NOT_SHOWN', tileTag: tag });
      if (!document.querySelector('.ship-skin-tile')) { await showList(); const again = [...document.querySelector('nav[aria-label="舰船列表"]').querySelectorAll('button')].filter(b => /#\d+/.test(b.innerText) && b.innerText.split('\n')[0].trim().split(/\s+/)[0] === query.character)[shipIndex]; again?.click(); await sleep(900); }
    }
  }
  return out;
}

// Turns one lookup into a mapping record, or a review reason when it is not exact.
function recordFrom(skin, result, verifiedAt) {
  const base = { id: skin.id, character: skin.character, name: skin.name, type: skin.type };
  if (result.error) return { ...base, status: 'review', reason: `网站查找失败：${result.error}`, candidates: [] };
  const good = result.candidates.filter(c => c.onlineId && c.title.includes(skin.character));
  const live = good.filter(c => c.dynamicType === 'live2d'), spine = good.filter(c => c.dynamicType === 'spine');
  const candidates = [...live, ...spine].map(c => ({ character: skin.character, name: skin.name, onlineId: c.onlineId, dynamicType: c.dynamicType, isLive2d: c.isLive2d, isLive2dPlus: c.isLive2dPlus }));
  if (!result.ships.length) return { ...base, status: 'review', reason: '网站上没有找到同名舰船', candidates };
  if (!result.candidates.length) return { ...base, status: 'review', reason: '网站上有这艘舰船，但没有同名皮肤（可能尚未上线或名称写法不同）', candidates };
  if (live.length !== 1 || spine.length > 1 || good.length !== result.candidates.length) return { ...base, status: 'review', reason: live.length ? '网站上同名皮肤对应多个模型，需人工确认' : '网站上没有该皮肤的 Live2D 模型', candidates };
  if (skin.type === '双形态' && !spine.length) return { ...base, status: 'matched', reason: `网站逐页查找一致（${verifiedAt}）；本地标为双形态，网站只提供 Live2D`, candidates };
  return { ...base, status: 'matched', reason: `网站逐页查找一致（${verifiedAt}）`, candidates };
}

module.exports = { normalizeName, lookupInPage, recordFrom, lookupScript: query => `(${lookupInPage.toString()})(${JSON.stringify({ character: query.character, name: query.name })})` };
