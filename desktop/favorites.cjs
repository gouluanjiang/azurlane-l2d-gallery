// Favorite skins, kept per computer in .desktop-data/favorites.json and never uploaded.
// Ids that are not in the current catalog are kept (a rollback may bring them back).
const fs = require('node:fs');
const path = require('node:path');

const MAX_FAVORITES = 5000;
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

class FavoritesStore {
  constructor(libraryRoot) { this.file = path.join(libraryRoot, '.desktop-data/favorites.json'); }
  list() {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(value?.ids) ? [...new Set(value.ids.filter(validId))].slice(0, MAX_FAVORITES) : [];
    } catch { return []; }
  }
  set(id, on) {
    if (!validId(id)) throw new Error('无效的皮肤编号');
    if (typeof on !== 'boolean') throw new Error('无效的收藏状态');
    const ids = this.list().filter(item => item !== id);
    if (on) { if (ids.length >= MAX_FAVORITES) throw new Error('收藏数量已达上限'); ids.push(id); }
    const temp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify({ schemaVersion: 1, ids }, null, 2) + '\n');
    fs.renameSync(temp, this.file);
    return ids;
  }
}

module.exports = { FavoritesStore, MAX_FAVORITES };
