import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncCatalog, rollbackLast, acquireLock, safePath } from '../scripts/lib/sync-engine.mjs';
import { stableSkinId, serializeCatalog, validateCatalog } from '../scripts/lib/catalog.mjs';
import { sha256, fetchImage, allowedImageUrl } from '../scripts/lib/transport.mjs';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const skin = name => ({ id: stableSkinId('测试角色',name), character:'测试角色',name,variant:'换装',type:'L2D',releaseDate:'2026-09-08',artworkPath:`assets/skins/${stableSkinId('测试角色',name)}.png`,guidePath:null,artworkSource:'https://patchwiki.biligame.com/images/blhx/test.png',guideSource:null,guideConfirmed:false,artworkSha256:sha256(image),artworkBytes:image.length });
function setup(t) {
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'l2d-sync-'));
  t.after(()=>fs.rmSync(rootDir,{recursive:true,force:true}));
  const current={schemaVersion:2,version:'old',updatedTo:'2026-09-08',checkedAt:null,skins:[skin('旧皮肤')]};
  fs.mkdirSync(path.join(rootDir,'data'),{recursive:true}); fs.mkdirSync(path.join(rootDir,'assets/skins'),{recursive:true});
  fs.writeFileSync(path.join(rootDir,current.skins[0].artworkPath),image);
  const originalJson=JSON.stringify(current,null,2)+'\n', originalJs=serializeCatalog(current);
  fs.writeFileSync(path.join(rootDir,'data/catalog.json'),originalJson); fs.writeFileSync(path.join(rootDir,'data/skins-data.js'),originalJs);
  const next=structuredClone({...current,version:'new',checkedAt:'2026-09-12T00:00:00.000Z',skins:[...current.skins,skin('新皮肤')]});
  return {rootDir,current,next,originalJson,originalJs};
}
const fetchOk=async()=>new Response(image,{status:200,headers:{'content-type':'image/png'}});
test('successful sync adds an image and record; repeat does not download or duplicate',async t=>{
  const x=setup(t);let requests=0;
  const fetchImpl=async()=>{requests++;return fetchOk();};
  const first=await syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl});
  assert.equal(first.added,1); assert.equal(first.downloaded,1); assert.equal(first.count,2); assert.equal(requests,1);
  const second=await syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl});
  assert.equal(second.status,'unchanged'); assert.equal(requests,1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(x.rootDir,'data/catalog.json'),'utf8')),x.next);
});
test('wrong remote image hash never changes existing catalog or existing artwork',async t=>{
  const x=setup(t);x.next.skins[1].artworkSha256='0'.repeat(64);
  await assert.rejects(syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:fetchOk}),/校验/);
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/catalog.json'),'utf8'),x.originalJson);
  assert.equal(fs.existsSync(path.join(x.rootDir,x.next.skins[1].artworkPath)),false);
});
test('interruption between JS and JSON restores both, and retry reuses verified asset',async t=>{
  const x=setup(t);
  await assert.rejects(syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:fetchOk,fault:step=>{if(step==='after-script')throw new Error('power interruption');}}),/power interruption/);
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/catalog.json'),'utf8'),x.originalJson);
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/skins-data.js'),'utf8'),x.originalJs);
  const result=await syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:()=>{throw new Error('should reuse asset');}});
  assert.equal(result.added,1); assert.equal(result.downloaded,0);
});
test('rollback restores exact prior files and retains downloaded originals',async t=>{
  const x=setup(t); await syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:fetchOk});
  assert.equal(rollbackLast(x.rootDir).status,'rolled_back');
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/catalog.json'),'utf8'),x.originalJson);
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/skins-data.js'),'utf8'),x.originalJs);
  assert.ok(fs.existsSync(path.join(x.rootDir,x.next.skins[1].artworkPath)));
});
test('interrupted rollback resumes automatically before another rollback',async t=>{
  const x=setup(t); await syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:fetchOk});
  assert.throws(()=>rollbackLast(x.rootDir,{fault:step=>{if(step==='after-restore-catalog.json')throw new Error('shutdown during rollback');}}),/shutdown/);
  assert.ok(fs.existsSync(path.join(x.rootDir,'.l2d-update/rollback.json')));
  assert.equal(rollbackLast(x.rootDir).status,'rolled_back');
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/catalog.json'),'utf8'),x.originalJson);
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/skins-data.js'),'utf8'),x.originalJs);
});
test('edits made while network download awaits are retained and update refuses commit',async t=>{
  const x=setup(t);const manual={...x.current,version:'manual-edit'};
  await assert.rejects(syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:async()=>{
    fs.writeFileSync(path.join(x.rootDir,'data/catalog.json'),JSON.stringify(manual,null,2)+'\n');
    fs.writeFileSync(path.join(x.rootDir,'data/skins-data.js'),serializeCatalog(manual));
    return fetchOk();
  }}),/下载期间/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(x.rootDir,'data/catalog.json'),'utf8')).version,'manual-edit');
});
test('local edits refuse overwrite and rollback refuses unrelated post-update changes',async t=>{
  const x=setup(t); await syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:fetchOk});
  const edited=fs.readFileSync(path.join(x.rootDir,'data/skins-data.js'),'utf8')+'// custom edit';
  fs.writeFileSync(path.join(x.rootDir,'data/skins-data.js'),edited);
  assert.throws(()=>rollbackLast(x.rootDir),/本地修改/);
  assert.equal(fs.readFileSync(path.join(x.rootDir,'data/skins-data.js'),'utf8'),edited);
});
test('cannot remove or change existing identity/image during update',async t=>{
  const x=setup(t);const changed=structuredClone(x.next);changed.skins.shift();
  await assert.rejects(syncCatalog({rootDir:x.rootDir,nextCatalog:changed,fetchImpl:fetchOk}),/移除/);
  const replaced=structuredClone(x.next);replaced.skins[0].artworkSha256='1'.repeat(64);
  await assert.rejects(syncCatalog({rootDir:x.rootDir,nextCatalog:replaced,fetchImpl:fetchOk}),/冲突/);
});
test('existing confirmed guide source and variant cannot be silently downgraded',async t=>{
  const x=setup(t);x.current.skins[0].guideConfirmed=true;x.current.skins[0].guideSource='https://075fac25.pinme.dev/guide.png';
  fs.writeFileSync(path.join(x.rootDir,'data/catalog.json'),JSON.stringify(x.current,null,2)+'\n');
  fs.writeFileSync(path.join(x.rootDir,'data/skins-data.js'),serializeCatalog(x.current));
  await assert.rejects(syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:fetchOk}),/来源发生冲突/);
  x.next.skins[0]=structuredClone(x.current.skins[0]);x.next.skins[0].variant='换装99';
  await assert.rejects(syncCatalog({rootDir:x.rootDir,nextCatalog:x.next,fetchImpl:fetchOk}),/variant/);
});
test('simultaneous updater is rejected and can proceed after lock release',t=>{
  const x=setup(t);const release=acquireLock(x.rootDir);
  assert.throws(()=>acquireLock(x.rootDir),/正在运行/);release();const release2=acquireLock(x.rootDir);release2();
});
test('path traversal is rejected before filesystem mutation',t=>{
  const x=setup(t); for(const bad of ['../outside','assets/../outside','C:/outside','assets\\outside','assets//outside'])assert.throws(()=>safePath(x.rootDir,bad));
});
test('image download refuses HTML masquerading as image and offsite redirect',async()=>{
  await assert.rejects(fetchImage('https://patchwiki.biligame.com/image.jpg',{fetchImpl:async()=>new Response('<html>'+'.'.repeat(80)+'</html>'),retries:0}),/图片格式/);
  await assert.rejects(fetchImage('https://patchwiki.biligame.com/image.jpg',{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}),retries:0}),/来源/);
});
test('the retired guide hosts are no longer allowed',()=>{
  assert.equal(allowedImageUrl('https://patchwiki.biligame.com/image.png').hostname,'patchwiki.biligame.com');
  for(const host of ['075fac25.pinme.dev','417ce07b.pinme.dev','ed6b1227.pinme.dev','arbitrary.pinme.dev']) assert.throws(()=>allowedImageUrl(`https://${host}/image.png`),/来源/);
});
test('missing images the current catalog already references are restored in place, and partial progress survives a failure',async t=>{
  const x=setup(t);const extra=skin('另一款');
  const fresh={...x.current,skins:[...x.current.skins,extra]};
  fs.writeFileSync(path.join(x.rootDir,'data/catalog.json'),JSON.stringify(fresh,null,2)+'\n');fs.writeFileSync(path.join(x.rootDir,'data/skins-data.js'),serializeCatalog(fresh));
  fs.unlinkSync(path.join(x.rootDir,x.current.skins[0].artworkPath));
  let calls=0;const flaky=async()=>(++calls===1?fetchOk():new Response('no',{status:503}));
  const failed=await syncCatalog({rootDir:x.rootDir,nextCatalog:fresh,fetchImpl:flaky}).catch(e=>e);
  assert.match(failed.message,/1 张本地图像未能补齐，已下载的 1 张已保留/);assert.equal(failed.repaired,1);
  const kept=[x.current.skins[0],extra].filter(s=>fs.existsSync(path.join(x.rootDir,s.artworkPath)));assert.equal(kept.length,1);
  const result=await syncCatalog({rootDir:x.rootDir,nextCatalog:fresh,fetchImpl:fetchOk});
  assert.equal(result.status,'unchanged');assert.equal(result.repaired,1);
  for(const s of fresh.skins)assert.equal(sha256(fs.readFileSync(path.join(x.rootDir,s.artworkPath))),s.artworkSha256);
  assert.equal(fs.existsSync(path.join(x.rootDir,'.l2d-update/backups')),false);
});
test('a fresh install fetches the newest artworks first and no guides',async t=>{
  const x=setup(t);
  const dated=(name,date,guide)=>({...skin(name),releaseDate:date,artworkSource:`https://patchwiki.biligame.com/images/blhx/${encodeURIComponent(name)}.png`,
    ...(guide?{guidePath:`assets/guides/${stableSkinId('测试角色',name)}.png`,guideSource:`https://patchwiki.biligame.com/images/blhx/${encodeURIComponent(name)}-guide.png`,guideSha256:sha256(image),guideBytes:image.length}:{})});
  const fresh={...x.current,skins:[dated('旧皮肤','2020-01-01',true),dated('中间','2023-05-05',false),dated('最新','2026-09-08',true)]};
  fs.mkdirSync(path.join(x.rootDir,'assets/guides'),{recursive:true});
  for(const s of x.current.skins)fs.unlinkSync(path.join(x.rootDir,s.artworkPath));
  fs.writeFileSync(path.join(x.rootDir,'data/catalog.json'),JSON.stringify(fresh,null,2)+'\n');fs.writeFileSync(path.join(x.rootDir,'data/skins-data.js'),serializeCatalog(fresh));
  const order=[];const fetchImpl=async url=>{order.push(decodeURIComponent(new URL(url).pathname.split('/').pop()));return fetchOk();};
  const result=await syncCatalog({rootDir:x.rootDir,nextCatalog:fresh,fetchImpl});
  assert.equal(result.repaired,3);
  assert.deepEqual(order,['最新.png','中间.png','旧皮肤.png']);
  // Guide records stay in the catalog, but their files are neither downloaded nor required.
  assert.deepEqual(fs.readdirSync(path.join(x.rootDir,'assets/guides')),[]);
  assert.equal(validateCatalog(fresh,{rootDir:x.rootDir,checkFiles:true}).guideCount,2);
});
