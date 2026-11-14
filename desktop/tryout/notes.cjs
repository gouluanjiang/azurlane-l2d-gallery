const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const blankDraft = () => ({ editingId: null, location: '', steps: '', result: '', triggered: false });
function cleanDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('笔记格式不正确');
  const result = {};
  for (const [key, limit] of [
    ['location', 200],
    ['steps', 4000],
    ['result', 2000]
  ]) {
    if (typeof value[key] !== 'string' || value[key].length > limit) throw new Error(`笔记内容过长或格式错误：${key}`);
    result[key] = value[key].replace(/\u0000/g, '');
  }
  if (typeof value.triggered !== 'boolean') throw new Error('触发状态不正确');
  result.triggered = value.triggered;
  if (value.editingId != null && (typeof value.editingId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.editingId)))
    throw new Error('笔记编号不正确');
  result.editingId = value.editingId || null;
  return result;
}
class NotesStore {
  constructor(folder, allowedIds) {
    this.folder = folder;
    this.file = path.join(folder, 'play-notes.v1.json');
    this.allowed = new Set(allowedIds);
  }
  read() {
    if (!fs.existsSync(this.file)) return { schemaVersion: 1, skins: {} };
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      throw new Error('笔记文件无法读取，原文件已保留。请先备份后检查。');
    }
    if (data.schemaVersion !== 1 || !data.skins || Array.isArray(data.skins))
      throw new Error('笔记版本不兼容，原文件已保留。');
    return data;
  }
  get(id) {
    if (!this.allowed.has(id)) throw new Error('不是本轮样例皮肤');
    const state = this.read().skins[id] || { revision: 0, entries: [], draft: blankDraft(), removed: null };
    if (!Array.isArray(state.entries) || !Number.isSafeInteger(state.revision))
      throw new Error('该皮肤的笔记格式不正确，原文件已保留。');
    return state;
  }
  update(id, revision, operation, value) {
    const previous = this.get(id);
    if (revision !== previous.revision) throw new Error('笔记已在其他操作中更新，请重新打开该皮肤后再保存。');
    const state = structuredClone(previous);
    if (operation === 'draft') state.draft = cleanDraft(value);
    else if (operation === 'commit') {
      const draft = cleanDraft(value);
      if (![draft.location, draft.steps, draft.result].some(t => t.trim())) throw new Error('先写下一点玩法再保存。');
      const index = draft.editingId ? state.entries.findIndex(e => e.id === draft.editingId) : -1;
      if (draft.editingId && index < 0) throw new Error('要编辑的笔记已不存在');
      if (index < 0 && state.entries.length >= 100) throw new Error('每款皮肤最多保存 100 条笔记');
      const entry = {
        id: draft.editingId || randomUUID(),
        location: draft.location.trim(),
        steps: draft.steps.trim(),
        result: draft.result.trim(),
        triggered: draft.triggered,
        createdAt: index < 0 ? new Date().toISOString() : state.entries[index].createdAt,
        updatedAt: new Date().toISOString()
      };
      if (index < 0) state.entries.unshift(entry);
      else state.entries[index] = entry;
      state.draft = blankDraft();
    } else if (operation === 'remove') {
      const index = state.entries.findIndex(e => e.id === value);
      if (index < 0) throw new Error('笔记已不存在');
      state.removed = { index, entry: state.entries.splice(index, 1)[0] };
      if (state.draft.editingId === value) state.draft = blankDraft();
    } else if (operation === 'undo') {
      if (state.removed) {
        state.entries.splice(state.removed.index, 0, state.removed.entry);
        state.removed = null;
      }
    } else throw new Error('未知笔记操作');
    const data = this.read();
    state.revision++;
    data.skins[id] = state;
    data.updatedAt = new Date().toISOString();
    fs.mkdirSync(this.folder, { recursive: true });
    const temp = path.join(this.folder, `notes-${randomUUID()}.tmp`);
    try {
      const fd = fs.openSync(temp, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
      fs.renameSync(temp, this.file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return state;
  }
}
module.exports = { NotesStore, cleanDraft, blankDraft };
