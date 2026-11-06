import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matching from '../desktop/tryout/matching.cjs';
import batch from '../desktop/tryout/batch.cjs';
import inheritance from '../desktop/tryout/inherit-notes.cjs';
import notes from '../desktop/tryout/notes.cjs';
const local={id:'azl-test',character:'狮',name:'同名皮肤',type:'L2D'};
const skin={id:205161,name:local.name,dynamicType:'live2d',isLive2d:true,isLive2dPlus:false,prefab:'lion'};
const source=(skins=[skin],name='狮')=>({locale:'CN',ships:[{name,skins}]});
const audit=value=>matching.auditCatalog({skins:[local]},value)[0];
// The online mapping was audited against the 102-skin catalog of September 2026. Skins synced
// later are not in it and must stay in review, so release counts only cover audited records.
const audited=new Set(JSON.parse(fs.readFileSync(new URL('../desktop/tryout/online-mapping.json',import.meta.url),'utf8')).records.map(r=>r.id));
const auditedReview=rows=>rows.filter(s=>audited.has(s.id)&&s.status==='review').length;
const assertUnauditedInReview=rows=>{for(const s of rows)if(!audited.has(s.id))assert.equal(s.status,'review',s.id);};
test('exact character, costume and model type are all required',()=>{
  assert.equal(audit(source()).status,'matched');
  assert.equal(audit(source([skin],'另一角色')).status,'review');
  assert.equal(audit(source([{...skin,name:'同名皮肤！'}])).status,'review');
  assert.equal(audit(source([{...skin,isLive2dPlus:true}])).status,'review');
  assert.equal(audit(source([{...skin,isLive2d:false,dynamicType:'painting'}])).status,'no-model');
});
test('same-name forms, duplicate IDs and dual forms never silently pick the first result',()=>{
  assert.equal(audit(source([skin,{...skin,id:205162,dynamicType:'spine'}])).status,'review');
  assert.throws(()=>audit(source([skin,skin])),/重复/);
  assert.equal(matching.auditCatalog({skins:[{...local,type:'双形态'}]},source())[0].status,'review');
});
test('new or renamed local entries require review even when their stable ID was enabled',()=>{
  const manifest={records:[audit(source())]};
  assert.equal(matching.availabilityFrom({skins:[local]},manifest,[local.id])[0].status,'playable');
  assert.equal(matching.availabilityFrom({skins:[local]},manifest,[])[0].status,'matched');
  for(const change of [{name:'另一换装'},{character:'另一角色'},{type:'L2D+'},{id:'azl-new'}])assert.equal(matching.availabilityFrom({skins:[{...local,...change}]},manifest,[local.id,'azl-new'])[0].status,'review');
});
test('the current batch enables eight exact records and keeps same-character skins separate',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const result=batch.batchFrom(catalog);
  assert.equal(result.samples.length,8);assert.equal(batch.newIds.length,6);
  assert.equal(new Set(result.samples.map(s=>s.onlineId)).size,8);
  assert.deepEqual(result.samples.filter(s=>s.character==='狮').map(s=>s.onlineId).sort(),['205161','205162']);
  for(const sample of result.samples)assert.equal(sample.candidates[0].dynamicType,'live2d');
  assert.equal(result.availability.length,catalog.skins.length);
  assert.equal(result.availability.filter(row=>row.status==='playable').length,8);
  const updated=batch.batchFrom({...catalog,skins:[...catalog.skins,{...local,id:'azl-newly-synced'}]});
  assert.equal(updated.availability.at(-1).status,'review');
  assert.equal(updated.samples.length,8);
});
test('note inheritance copies once and leaves existing and original notes unchanged',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'l2d-inherit-'));
  try{
    const old=path.join(root,'old'),next=path.join(root,'next'),store=new notes.NotesStore(old,['old','new']);
    store.update('old',0,'commit',{...notes.blankDraft(),location:'已验收版本的笔记'});
    const original=fs.readFileSync(store.file);
    assert.equal(inheritance.inheritNotes(old,next,['old','new']),'inherited');
    const migrated=new notes.NotesStore(next,['old','new']);assert.equal(migrated.get('old').entries[0].location,'已验收版本的笔记');
    migrated.update('new',0,'draft',{...notes.blankDraft(),location:'新增皮肤草稿'});
    assert.equal(inheritance.inheritNotes(old,next,['old','new']),'existing');assert.equal(migrated.get('new').draft.location,'新增皮肤草稿');assert.deepEqual(fs.readFileSync(store.file),original);
    fs.writeFileSync(store.file,'bad json');assert.throws(()=>inheritance.inheritNotes(old,path.join(root,'bad'),['old']),/原文件已保留/);
    assert.equal(fs.existsSync(path.join(root,'bad','play-notes.v1.json')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('second release adds twelve exact models while preserving the accepted eight',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const first=batch.batchFrom(catalog,1),second=batch.batchFrom(catalog,2);
  assert.equal(second.samples.length,20);
  assert.deepEqual(second.samples.slice(0,8).map(s=>[s.id,s.onlineId,s.url]),first.samples.map(s=>[s.id,s.onlineId,s.url]));
  assert.equal(new Set(second.samples.map(s=>s.onlineId)).size,20);
  assert.equal(second.samples.filter(s=>s.label==='本批新增').length,12);
  for(const skin of second.samples.slice(8)){
    assert.equal(skin.candidates[0].dynamicType,'live2d');
    assert.equal(first.availability.find(s=>s.id===skin.id).status,'matched');
  }
  for(const skin of first.availability.filter(s=>s.status==='review'))assert.equal(second.availability.find(s=>s.id===skin.id).status,'review');
  const changed={...catalog,skins:catalog.skins.map(s=>s.id===batch.secondIds[0]?{...s,name:'尚未核对的新皮肤'}:s)};
  assert.throws(()=>batch.batchFrom(changed,2),/不匹配/);
  assert.equal(batch.batchFrom(changed,1).samples.length,8);
  for(const invalid of [0,6,1.5,'3'])assert.throws(()=>batch.releaseFrom(invalid),/未知/);
});

test('third release preserves all accepted mappings and separates the two Shinano costumes',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const previous=batch.batchFrom(catalog,2),current=batch.batchFrom(catalog,3);
  assert.equal(current.samples.length,32);
  assert.deepEqual(current.samples.slice(0,20).map(s=>[s.id,s.onlineId,s.url]),previous.samples.map(s=>[s.id,s.onlineId,s.url]));
  assert.equal(new Set(current.samples.map(s=>s.onlineId)).size,32);
  assert.equal(current.samples.filter(s=>s.label==='本批新增').length,12);
  assert.equal(current.availability.filter(s=>s.status==='matched').length,60);
  assert.equal(auditedReview(current.availability),10);assertUnauditedInReview(current.availability);
  assert.deepEqual(current.samples.filter(s=>s.character==='信浓').map(s=>s.onlineId).sort(),['307083','307085']);
  for(const skin of current.samples.slice(20))assert.equal(previous.availability.find(s=>s.id===skin.id).status,'matched');
  const changed={...catalog,skins:catalog.skins.map(s=>s.id===batch.thirdIds[0]?{...s,type:'双形态'}:s)};
  assert.throws(()=>batch.batchFrom(changed,3),/不匹配/);
  assert.equal(batch.batchFrom(changed,2).samples.length,20);
});

test('fourth release preserves 32 accepted models and separates the Karl costumes',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const previous=batch.batchFrom(catalog,3),current=batch.batchFrom(catalog,4);
  assert.equal(current.samples.length,44);
  assert.deepEqual(current.samples.slice(0,32).map(s=>[s.id,s.onlineId,s.url]),previous.samples.map(s=>[s.id,s.onlineId,s.url]));
  assert.equal(new Set(current.samples.map(s=>s.onlineId)).size,44);
  assert.equal(current.samples.filter(s=>s.label==='本批新增').length,12);
  assert.equal(current.availability.filter(s=>s.status==='matched').length,48);
  assert.equal(auditedReview(current.availability),10);assertUnauditedInReview(current.availability);
  assert.deepEqual(current.samples.filter(s=>s.character==='腓特烈·卡尔').map(s=>s.onlineId).sort(),['403142','403143']);
  for(const skin of current.samples.slice(32))assert.equal(previous.availability.find(s=>s.id===skin.id).status,'matched');
  const changed={...catalog,skins:catalog.skins.map(s=>s.id===batch.fourthIds[0]?{...s,character:'未经核对的角色'}:s)};
  assert.throws(()=>batch.batchFrom(changed,4),/不匹配/);
  assert.equal(batch.batchFrom(changed,3).samples.length,32);
});

test('the full release opens every verified skin, keeps accepted order and adds Spine forms',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const fourth=batch.batchFrom(catalog,4),full=batch.batchFrom(catalog,batch.fullRelease);
  assert.equal(full.release.label,'全部皮肤');
  assert.deepEqual(full.samples.slice(0,44).map(s=>[s.id,s.onlineId]),fourth.samples.map(s=>[s.id,s.onlineId]));
  assert.equal(new Set(full.samples.map(s=>s.onlineId)).size,full.samples.length);
  // Every catalog skin is either playable or explicitly left in review with a reason.
  assert.equal(full.samples.length,full.availability.filter(s=>s.status==='playable').length);
  assert.equal(full.availability.length,catalog.skins.length);
  for(const s of full.availability.filter(s=>s.status!=='playable'))assert(s.reason,s.id);
  for(const s of full.samples){assert.equal(s.forms[0].kind,'live2d');assert.equal(s.forms[0].onlineId,s.onlineId);assert(s.forms.length<=2);}
  const kinmu=full.samples.find(s=>s.id==='azl-a17232397b1db5bb');
  assert.deepEqual(kinmu.forms.map(f=>[f.onlineId,f.kind]),[['9600032','live2d'],['9600033','spine']]);
  // Frozen batches still read the September manifest only.
  assert.equal(fourth.availability.filter(s=>audited.has(s.id)&&s.status==='review').length,10);
  assert.equal(fourth.availability.filter(s=>audited.has(s.id)&&s.status==='matched').length,48);
  // A skin synced later and not yet verified stays in review even in the full release.
  const synced=batch.batchFrom({...catalog,skins:[...catalog.skins,{...catalog.skins[0],id:'azl-not-verified-yet',name:'尚未核对'}]},batch.fullRelease);
  assert.equal(synced.availability.at(-1).status,'review');
  assert.equal(synced.samples.length,full.samples.length);
});
test('form lists accept one Live2D plus at most one Spine and nothing else',()=>{
  const live={onlineId:'1',dynamicType:'live2d',isLive2dPlus:false},spine={onlineId:'2',dynamicType:'spine'};
  assert.deepEqual(batch.formsFrom([live,spine]).map(f=>f.kind),['live2d','spine']);
  assert.equal(batch.formsFrom([spine]),null);
  assert.equal(batch.formsFrom([live,{...live,onlineId:'3'}]),null);
  assert.equal(batch.formsFrom([live,spine,{...spine,onlineId:'4'}]),null);
  assert.equal(batch.formsFrom([live,{onlineId:'5',dynamicType:'painting'}]),null);
});

for(const number of [2,3,4,5])test(`release ${number} inherits previous notes and drafts without changing older files`,()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'l2d-second-inherit-'));
  try{
    const first=batch.releaseFrom(number-1),second=batch.releaseFrom(number);
    assert.equal(second.previousNotes,first.scope+'/tryout-notes');
    const previous=path.join(root,second.previousNotes),next=path.join(root,second.scope,'tryout-notes');
    const old=new notes.NotesStore(previous,first.enabledIds);
    old.update(first.newIds[0],0,'commit',{...notes.blankDraft(),location:'上批真实玩法记录'});
    old.update(first.enabledIds[1],0,'draft',{...notes.blankDraft(),location:'上批未提交草稿'});
    const original=fs.readFileSync(old.file);
    inheritance.inheritNotes(previous,next,second.enabledIds);
    const current=new notes.NotesStore(next,second.enabledIds);
    assert.equal(current.get(first.newIds[0]).entries[0].location,'上批真实玩法记录');
    assert.equal(current.get(first.enabledIds[1]).draft.location,'上批未提交草稿');
    current.update(second.newIds[0],0,'commit',{...notes.blankDraft(),location:'本批新记录'});
    const before=fs.readFileSync(current.file);
    assert.equal(inheritance.inheritNotes(previous,next,second.enabledIds),'existing');
    assert.deepEqual(fs.readFileSync(current.file),before);
    assert.deepEqual(fs.readFileSync(old.file),original);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
