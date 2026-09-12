import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRemoteCatalog } from './lib/transport.mjs';
import { syncCatalog, rollbackLast, readJson, atomicWrite, jsonText } from './lib/sync-engine.mjs';
import { validateCatalog } from './lib/catalog.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  let result;
  if (process.argv.includes('--rollback')) result = rollbackLast(rootDir);
  else {
    console.log('正在读取云端图鉴的确定版本……');
    const { catalog, commit } = getRemoteCatalog(rootDir, readJson(path.join(rootDir, 'update-config.json')));
    validateCatalog(catalog);
    result = await syncCatalog({ rootDir, nextCatalog: catalog, sourceCommit: commit, progress: console.log });
  }
  atomicWrite(path.join(rootDir, 'data/sync-status.json'), jsonText({ ...result, checkedAt: new Date().toISOString() }));
  console.log(result.status === 'unchanged' ? '已经是最新版本，未重复下载或收录。' : result.status === 'rolled_back' ? `已回退到版本 ${result.version}。` : `同步完成：新增 ${result.added} 款，当前共 ${result.count} 款。`);
  console.log('现在重新打开或刷新图鉴即可。');
} catch (error) {
  console.error(`更新失败：${error.message}\n原有图鉴和图片已保留；修复网络或配置后可以重试。`);
  try { atomicWrite(path.join(rootDir, 'data/sync-status.json'), jsonText({ status: 'failed', checkedAt: new Date().toISOString(), error: error.message })); } catch {}
  process.exitCode = 1;
}
