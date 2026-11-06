import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {NotesStore,blankDraft}=require('../desktop/tryout/notes.cjs');
const {samplesFrom,definitions,allowedModelUrl}=require('../desktop/tryout/samples.cjs');
const {modelIsReady}=require('../desktop/tryout/readiness.cjs');
function storeTest(fn){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'l2d-notes-'));try{fn(new NotesStore(folder,['old','new']),folder);}finally{fs.rmSync(folder,{recursive:true,force:true});}}
test('notes and unsaved drafts survive reopening and remain separate per skin',()=>storeTest((store,folder)=>{
  let state=store.update('old',0,'draft',{...blankDraft(),location:'头部',steps:'点击一次',result:'出现台词',triggered:true});
  assert.equal(new NotesStore(folder,['old','new']).get('old').draft.location,'头部');
  state=store.update('old',state.revision,'commit',state.draft);
  const reopened=new NotesStore(folder,['old','new']);
  assert.equal(reopened.get('old').entries[0].triggered,true);
  assert.equal(reopened.get('new').entries.length,0);assert.equal(reopened.get('old').draft.steps,'');
}));
test('editing updates one entry and removal can be undone without changing another skin',()=>storeTest(store=>{
  let s=store.update('old',0,'commit',{...blankDraft(),location:'帽子'});
  const id=s.entries[0].id;
  s=store.update('old',s.revision,'commit',{...blankDraft(),editingId:id,location:'帽沿',triggered:true});
  assert.equal(s.entries.length,1);assert.equal(s.entries[0].id,id);
  s=store.update('old',s.revision,'remove',id);assert.equal(s.entries.length,0);
  s=store.update('old',s.revision,'undo');assert.equal(s.entries[0].location,'帽沿');assert.equal(s.removed,null);
  assert.equal(store.get('new').revision,0);
}));
test('stale saves, invalid paths and oversized notes cannot overwrite existing notes',()=>storeTest((store,folder)=>{
  store.update('old',0,'commit',{...blankDraft(),location:'保存的记录'});
  const before=fs.readFileSync(store.file,'utf8');
  assert.throws(()=>store.update('old',0,'draft',blankDraft()),/其他操作/);
  assert.throws(()=>store.update('../outside',0,'draft',blankDraft()),/样例/);
  assert.throws(()=>store.update('old',1,'draft',{...blankDraft(),steps:'x'.repeat(4001)}),/过长/);
  assert.equal(fs.readFileSync(store.file,'utf8'),before);
  fs.writeFileSync(store.file,'broken json');
  assert.throws(()=>new NotesStore(folder,['old']).update('old',1,'draft',blankDraft()),/原文件已保留/);
  assert.equal(fs.readFileSync(store.file,'utf8'),'broken json');
}));
test('literal markup in a note remains text in storage',()=>storeTest(store=>{
  const note='<img src=x onerror=alert(1)> & "test"';
  const s=store.update('old',0,'commit',{...blankDraft(),steps:note});assert.equal(s.entries[0].steps,note);
}));
test('two explicit sample mappings require the matching stable identity and skin name',()=>{
  const catalog={skins:definitions.map(d=>({...d,guidePath:null}))};
  const samples=samplesFrom(catalog);assert.equal(samples.length,2);
  assert.equal(samples[0].url,'https://l2d.su/cn/skins/818011/');
  catalog.skins[0].name='另一款换装';assert.throws(()=>samplesFrom(catalog),/不匹配/);
  for(const url of ['https://l2d.su/cn/skins/205162/','https://l2d.su.evil.test/cn/skins/818011/','file:///C:/data','https://user@l2d.su/cn/skins/818011/'])assert.equal(allowedModelUrl(url,samples[0]),false);
});
test('HTML load and an enabled artwork button cannot count as an interactive model',()=>{
  const sample={url:'https://l2d.su/cn/skins/818011/',character:'瑟堡'};
  const state={url:sample.url,title:'瑟堡',modelLoaded:false,canvas:{width:800,height:600},loading:'',error:'',staticButtonEnabled:true};
  assert.equal(modelIsReady(state,sample),false);
  state.modelLoaded=true;assert.equal(modelIsReady(state,sample),true);
  assert.equal(modelIsReady({...state,loading:'准备中'},sample),false);
  assert.equal(modelIsReady({...state,url:'https://l2d.su/cn/skins/205162/'},sample),false);
  assert.equal(modelIsReady({...state,error:'资源错误'},sample),false);
});
