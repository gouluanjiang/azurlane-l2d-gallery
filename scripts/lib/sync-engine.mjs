import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateCatalog, serializeCatalog, parseCatalogScript } from './catalog.mjs';
import { fetchImage, sha256, imageFormat } from './transport.mjs';

export function safePath(rootDir, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || /[:\x00]/.test(relative)) throw new Error('不安全的相对路径');
  const root = path.resolve(rootDir), target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('路径超出项目目录');
  let cursor = root;
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('项目目录不能是链接');
  for (const part of relative.split('/')) { cursor = path.join(cursor, part); if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('路径中不能有符号链接或目录联接'); }
  return target;
}
export function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx');
    try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export const jsonText = value => JSON.stringify(value, null, 2) + '\n';
export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
export function acquireLock(rootDir) {
  const filename = safePath(rootDir, '.l2d-update/update.lock'); fs.mkdirSync(path.dirname(filename), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try { const fd = fs.openSync(filename, 'wx'); fs.writeFileSync(fd, jsonText({ pid: process.pid, createdAt: new Date().toISOString() })); fs.closeSync(fd); return () => { if (readJson(filename).pid === process.pid) fs.unlinkSync(filename); }; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous; try { previous = readJson(filename); } catch { throw new Error('更新锁文件损坏，请保留现场后修复，不能同时更新'); }
      if (!Number.isInteger(previous.pid) || previous.pid <= 0) throw new Error('更新锁文件无效');
      try { process.kill(previous.pid, 0); throw new Error('另一个更新任务正在运行，请等待它完成'); }
      catch (probe) { if (probe.code !== 'ESRCH') throw probe; fs.unlinkSync(filename); }
    }
  }
  throw new Error('无法取得更新锁');
}
export function checkCompatibility(current, next) {
  const byId = new Map(next.skins.map(s => [s.id, s]));
  if (next.updatedTo < current.updatedTo) throw new Error('云端数据比本地旧，已保留当前图鉴');
  for (const old of current.skins) {
    const fresh = byId.get(old.id);
    if (!fresh) throw new Error(`更新试图移除已有皮肤：${old.character} ${old.name}`);
    for (const field of ['character','name','variant','releaseDate','type','artworkPath','artworkSha256','artworkBytes']) {
      if (old[field] != null && old[field] !== fresh[field]) throw new Error(`已有皮肤的 ${field} 发生冲突：${old.name}，请人工核对`);
    }
    if (old.guidePath && (old.guidePath !== fresh.guidePath || old.guideSha256 !== fresh.guideSha256)) throw new Error(`已有图解发生冲突：${old.name}`);
    for (const field of ['artworkSource','guideSource']) if (old[field] && old[field] !== fresh[field]) throw new Error(`已有来源发生冲突：${old.name} ${field}`);
    if (old.guideConfirmed === true && fresh.guideConfirmed !== true) throw new Error(`已确认的图解状态发生冲突：${old.name}`);
  }
}
function assetEntries(catalog) {
  return catalog.skins.flatMap(s => [{ file: s.artworkPath, source: s.artworkSource, hash: s.artworkSha256, bytes: s.artworkBytes }, ...(s.guidePath ? [{ file: s.guidePath, source: s.guideSource, hash: s.guideSha256, bytes: s.guideBytes }] : [])]);
}
function verifyBytes(entry, bytes) {
  imageFormat(bytes);
  if (!/^[a-f0-9]{64}$/.test(entry.hash || '') || !Number.isInteger(entry.bytes) || entry.bytes < 32) throw new Error(`更新未包含可信的图片校验值：${entry.file}`);
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.hash) throw new Error(`图片内容校验不一致，未应用更新：${entry.file}`);
}
function restoreTransaction(rootDir, journal, { requireNext = false, dryRun = false, fault = () => {} } = {}) {
  if (journal.schemaVersion !== 1 || !/^[a-zA-Z0-9-]+$/.test(journal.id) || journal.backup !== `.l2d-update/backups/${journal.id}`) throw new Error('更新事务格式无效');
  const pairs = [['data/catalog.json','catalog.json'], ['data/skins-data.js','skins-data.js']];
  for (const [relative, name] of pairs) {
    const original = safePath(rootDir, `${journal.backup}/${name}`), file = safePath(rootDir, relative);
    const before = fs.readFileSync(original), actual = sha256(fs.readFileSync(file));
    if (sha256(before) !== journal.oldHashes[name]) throw new Error('备份损坏，停止回退');
    if (actual !== journal.oldHashes[name] && actual !== journal.newHashes[name]) throw new Error('检测到事务之外的本地修改，停止自动回退');
    if (requireNext && actual !== journal.newHashes[name]) throw new Error('当前版本已改变，不能回退这次更新');
  }
  if (dryRun) return;
  for (const [relative, name] of pairs) {
    atomicWrite(safePath(rootDir, relative), fs.readFileSync(safePath(rootDir, `${journal.backup}/${name}`)));
    fault(`after-restore-${name}`);
  }
}
export function recoverInterrupted(rootDir) {
  const rollbackFile = safePath(rootDir, '.l2d-update/rollback.json');
  let recovered = false;
  if (fs.existsSync(rollbackFile)) {
    const rollback = readJson(rollbackFile);
    restoreTransaction(rootDir, rollback);
    finishRollback(rootDir, rollback);
    recovered = true;
  }
  const file = safePath(rootDir, '.l2d-update/transaction.json');
  if (!fs.existsSync(file)) return recovered;
  const journal = readJson(file);
  if (journal.phase === 'committed') {
    atomicWrite(safePath(rootDir, '.l2d-update/last-success.json'), jsonText(journal));
  } else restoreTransaction(rootDir, journal);
  fs.unlinkSync(file); return true;
}
function finishRollback(rootDir, journal) {
  atomicWrite(safePath(rootDir, '.l2d-update/last-rollback.json'), jsonText({ ...journal, rolledBackAt: new Date().toISOString() }));
  const success = safePath(rootDir, '.l2d-update/last-success.json');
  if (fs.existsSync(success)) {
    if (readJson(success).id !== journal.id) throw new Error('回退记录发生冲突，停止处理');
    fs.unlinkSync(success);
  }
  const marker = safePath(rootDir, '.l2d-update/rollback.json');
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
}
export function rollbackLast(rootDir, { fault = () => {} } = {}) {
  const release = acquireLock(rootDir);
  try {
    const hadRollback = fs.existsSync(safePath(rootDir, '.l2d-update/rollback.json'));
    recoverInterrupted(rootDir);
    if (hadRollback) return { status: 'rolled_back', version: readJson(safePath(rootDir, 'data/catalog.json')).version };
    const file = safePath(rootDir, '.l2d-update/last-success.json');
    if (!fs.existsSync(file)) throw new Error('没有可回退的本次同步备份');
    const journal = readJson(file);
    restoreTransaction(rootDir, journal, { requireNext: true, dryRun: true });
    atomicWrite(safePath(rootDir, '.l2d-update/rollback.json'), jsonText(journal));
    restoreTransaction(rootDir, journal, { fault });
    finishRollback(rootDir, journal);
    return { status: 'rolled_back', version: readJson(safePath(rootDir, 'data/catalog.json')).version };
  } finally { release(); }
}

export async function syncCatalog({ rootDir, nextCatalog, fetchImpl = fetch, sourceCommit = null, progress = () => {}, fault = () => {} }) {
  const release = acquireLock(rootDir);
  let journal;
  try {
    recoverInterrupted(rootDir);
    const currentFile = safePath(rootDir, 'data/catalog.json'), scriptFile = safePath(rootDir, 'data/skins-data.js');
    const current = readJson(currentFile);
    if (!isDeepStrictEqual(current, parseCatalogScript(fs.readFileSync(scriptFile, 'utf8')))) throw new Error('本地 JSON 与页面数据不一致，已保留手工修改，请先核对');
    const baselineJson = fs.readFileSync(currentFile), baselineJs = fs.readFileSync(scriptFile);
    validateCatalog(current); validateCatalog(nextCatalog); checkCompatibility(current, nextCatalog);
    const nextJson = jsonText(nextCatalog), nextJs = serializeCatalog(nextCatalog);
    const id = `${Date.now()}-${randomUUID()}`, staged = `.l2d-update/staging/${id}`;
    const entries = assetEntries(nextCatalog), pending = [];
    for (const entry of entries) {
      const destination = safePath(rootDir, entry.file);
      if (fs.existsSync(destination)) { verifyBytes(entry, fs.readFileSync(destination)); continue; }
      if (!entry.source) throw new Error(`缺少本地图像且没有下载来源：${entry.file}`);
      progress(`下载并校验原图 ${pending.length + 1}：${entry.file}`);
      const downloaded = await fetchImage(entry.source, { fetchImpl }); verifyBytes(entry, downloaded.bytes);
      const stagedFile = safePath(rootDir, `${staged}/${entry.file}`);
      atomicWrite(stagedFile, downloaded.bytes); pending.push({ ...entry, stagedFile });
    }
    fault('after-stage');
    if (sha256(fs.readFileSync(currentFile)) !== sha256(baselineJson) || sha256(fs.readFileSync(scriptFile)) !== sha256(baselineJs)) throw new Error('下载期间本地图鉴发生修改，本次同步已停止并保留修改');
    if (fs.readFileSync(currentFile, 'utf8') === nextJson && fs.readFileSync(scriptFile, 'utf8') === nextJs && !pending.length) return { status: 'unchanged', added: 0, count: current.skins.length, version: current.version, sourceCommit };
    const backup = `.l2d-update/backups/${id}`;
    atomicWrite(safePath(rootDir, `${backup}/catalog.json`), baselineJson);
    atomicWrite(safePath(rootDir, `${backup}/skins-data.js`), baselineJs);
    journal = { schemaVersion: 1, id, backup, phase: 'prepared', sourceCommit, oldHashes: { 'catalog.json': sha256(baselineJson), 'skins-data.js': sha256(baselineJs) }, newHashes: { 'catalog.json': sha256(nextJson), 'skins-data.js': sha256(nextJs) } };
    atomicWrite(safePath(rootDir, '.l2d-update/transaction.json'), jsonText(journal));
    for (const entry of pending) {
      const destination = safePath(rootDir, entry.file); fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (fs.existsSync(destination)) verifyBytes(entry, fs.readFileSync(destination));
      else fs.linkSync(entry.stagedFile, destination);
      fs.unlinkSync(entry.stagedFile);
    }
    fault('after-assets');
    if (sha256(fs.readFileSync(currentFile)) !== journal.oldHashes['catalog.json'] || sha256(fs.readFileSync(scriptFile)) !== journal.oldHashes['skins-data.js']) throw new Error('提交前检测到本地图鉴被修改，已停止同步');
    atomicWrite(scriptFile, nextJs); fault('after-script');
    atomicWrite(currentFile, nextJson); fault('after-catalog');
    const statistics = validateCatalog(nextCatalog, { rootDir, checkFiles: true });
    journal.phase = 'committed'; journal.completedAt = new Date().toISOString();
    atomicWrite(safePath(rootDir, '.l2d-update/transaction.json'), jsonText(journal));
    atomicWrite(safePath(rootDir, '.l2d-update/last-success.json'), jsonText(journal));
    fs.unlinkSync(safePath(rootDir, '.l2d-update/transaction.json'));
    return { status: 'updated', added: nextCatalog.skins.length - current.skins.length, downloaded: pending.length, count: nextCatalog.skins.length, version: nextCatalog.version, backup, sourceCommit, statistics };
  } catch (error) {
    if (journal?.phase === 'prepared') {
      try { recoverInterrupted(rootDir); } catch (recovery) { throw new Error(`${error.message}；恢复尚未完成：${recovery.message}`); }
    }
    throw error;
  } finally { release(); }
}
