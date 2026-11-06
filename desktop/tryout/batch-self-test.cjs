const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=100000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await pause(150);}throw new Error('Timed out: '+label);}
async function run({window,tryout,libraryRoot,testRound,errors}) {
  const out=path.join(libraryRoot,`verification/${tryout.reportScope}/round-${testRound}`);fs.mkdirSync(out,{recursive:true});
  const sampleCount=tryout.samples.length,reviewCount=tryout.availability.filter(s=>s.status==='review').length;
  const modeIndex=process.argv.indexOf('--test-mode');
  const mode=modeIndex>=0?process.argv[modeIndex+1]:Number(testRound)===1?'regression':Number(testRound)===3?'interaction':'portraits';
  assert(['regression','portraits','interaction'].includes(mode),'Unknown batch test mode');
  const report={status:'running',round:Number(testRound),mode,startedAt:new Date().toISOString(),steps:[],errors};
  const write=()=>fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
  const step=(name,details={})=>{report.steps.push({name,at:new Date().toISOString(),...details});write();};
  const hash=file=>fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
  const build=JSON.parse(fs.readFileSync(path.join(libraryRoot,`verification/${tryout.reportScope}/build.json`),'utf8'));
  const protectedFiles=build.protectedFiles.map(row=>({file:row.file,sha256:hash(path.join(libraryRoot,row.file))}));
  const local=script=>tryout.window.webContents.executeJavaScript(script);
  const remote=script=>tryout.model.contents.executeJavaScript(script);
  const gallery=script=>window.webContents.executeJavaScript(script);
  const click=id=>local(`document.getElementById(${JSON.stringify(id)}).click()`);
  async function ready(id){return until(()=>{if(tryout.model.state.phase==='error')throw new Error(tryout.model.state.error+': '+tryout.model.state.message);return tryout.model.state.phase==='ready'&&tryout.model.state.sampleId===id;},'model ready '+id);}
  async function paint(){await local('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');await pause(150);}
  async function capture(name){await paint();const wc=tryout.model.contents;fs.writeFileSync(path.join(out,`${name}-model.png`),(await wc.capturePage()).toPNG());fs.writeFileSync(path.join(out,`${name}-shell.png`),(await tryout.window.webContents.capturePage()).toPNG());return {model:name+'-model.png',shell:name+'-shell.png',bounds:tryout.model.bounds};}
  async function choose(id){await click('choose-skin');await until(()=>local('document.getElementById("skin-picker").open'),'picker open',4000);assert.equal(tryout.model.occluded,true);await local(`(()=>{document.getElementById('skin-search').value='';document.getElementById('skin-status').value='playable';document.getElementById('skin-search').dispatchEvent(new Event('input'));document.querySelector('.sample-choice[data-skin-id="${id}"]').click();})()`);await until(()=>local(`document.body.dataset.skinId===${JSON.stringify(id)}`),'selection applied',5000);await ready(id);assert.equal(tryout.model.occluded,false);}
  const pointer=async p=>{const wc=tryout.model.contents;tryout.window.focus();wc.focus();wc.sendInputEvent({type:'mouseMove',x:p.x,y:p.y});wc.sendInputEvent({type:'mouseDown',x:p.x,y:p.y,button:'left',clickCount:1});await pause(120);wc.sendInputEvent({type:'mouseUp',x:p.x,y:p.y,button:'left',clickCount:1});};
  async function silent(){let since=0;await until(()=>{if(tryout.model.contents.isCurrentlyAudible()){since=0;return false;}since ||=Date.now();return Date.now()-since>700;},'previous audio ends',50000);}
  async function touchHead(sample){
    // Centers of the actual colored head regions, read from round-2 screenshots.
    // Those PNGs are 1332 x 823 pixels for this 1065 x 658 DIP model viewport.
    const points={'818011':[.582,.529],'205162':[.615,.345],'499053':[.563,.362],'307083':[.659,.388],'205161':[.691,.516],'305103':[.565,.386],'403143':[.545,.429],'237031':[.589,.382]};
    assert(Math.abs(tryout.model.bounds.width-1065)<=2&&Math.abs(tryout.model.bounds.height-658)<=2,'Reobserve touch targets when the viewport changes');
    await silent();await remote(`document.querySelector('button[aria-label="触摸区域"]:not([aria-pressed="true"])')?.click()`);await pause(350);
    const p=(tryout.batch>=2?JSON.parse(fs.readFileSync(path.join(libraryRoot,`verification/${tryout.reportScope}/head-points.json`),'utf8')):points)[sample.onlineId];assert(p,'No visually verified head target: '+sample.onlineId);const point={x:Math.round(p[0]*tryout.model.bounds.width),y:Math.round(p[1]*tryout.model.bounds.height)};
      const capabilityFile=path.join(libraryRoot,`verification/${tryout.reportScope}/head-capabilities.json`);
      const capability=fs.existsSync(capabilityFile)?JSON.parse(fs.readFileSync(capabilityFile,'utf8'))[sample.onlineId]:null;
      if(capability?.expectedVoice===false){
        // The source defines a head motion but no corresponding normal/extra voice line.
        const sourceFile=path.resolve(libraryRoot,`verification/${tryout.reportScope}`,capability.sourceFile);
        assert.equal(hash(sourceFile),capability.sourceSha256);
        const source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
        const skin=source.ship.skins.find(s=>String(s.id)===sample.onlineId);
        assert(skin.l2dAnimations.includes('touch_head'));
        assert(![...skin.words,...skin.extraWords].some(w=>w.l2dAction==='touch_head'));
        await remote(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='动作');if(button?.getAttribute('aria-expanded')!=='true')button?.click();})()`);
        const motion=()=>remote(`(()=>{const list=document.querySelector('.live2d-action-list');return {name:list?.querySelector('.spine-action-item.active .spine-action-name')?.textContent.trim()||'',playing:!!list?.classList.contains('has-animation-progress'),progress:Number(list?.style.getPropertyValue('--spine-animation-progress')||-1)};})()`);
        const before=await motion();assert.notEqual(before.name,'touch_head');
        await pointer(point);
        const observed=await until(async()=>{const m=await motion();return m.name==='touch_head'&&m.playing&&m.progress>=0?m:false;},'native head animation '+sample.onlineId,10000);
        // The 2026-11 site refreshes its progress value less often; allow up to 3 s for it to move.
        const advanced=await until(async()=>{const m=await motion();assert.equal(m.name,'touch_head');return m.progress>observed.progress?m:false;},'Head animation advances after canvas click',3000);
        const audible=tryout.model.contents.isCurrentlyAudible();assert.equal(audible,false);
        const headCapture=await capture('head-'+sample.onlineId);
        const audioFallback=await action('touch_body');assert(audioFallback.dialogue.includes('普通触摸'));
        step('native-head-touch',{sampleId:sample.id,onlineId:sample.onlineId,point,expectedVoice:false,audible,headAnimation:{before,observed,advanced},capture:headCapture,audioFallback,capabilitySource:capability.sourceFile});
        return;
      }
      await pointer(point);await until(()=>tryout.model.contents.isCurrentlyAudible(),'native head audio '+sample.onlineId,15000);
    const dialogue=await until(async()=>{const value=await remote("document.querySelector('.dialogue-toast')?.innerText||''");return value.includes('摸头')?value:false;},'head-specific dialogue '+sample.onlineId,10000);
    step('native-head-touch',{sampleId:sample.id,onlineId:sample.onlineId,point,audible:true,dialogue,capture:await capture('head-'+sample.onlineId)});
  }
  async function action(label){
    const rect=label=>remote(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().replace(/^\\d+\\s*/,'')===${JSON.stringify(label)}&&!b.disabled&&b.getBoundingClientRect().height>0);if(!b)return null;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),expanded:b.getAttribute('aria-expanded')}})()`);
    await silent();const header=await until(()=>rect('动作'),'action menu',7000);if(header.expanded!=='true'){await pointer(header);await pause(350);}
    const before=await remote("document.querySelector('.dialogue-toast')?.innerText||''");
    const point=await until(()=>rect(label),'motion '+label,7000);await pointer(point);
    await until(()=>tryout.model.contents.isCurrentlyAudible(),'audio '+label,15000);
    const dialogue=await until(async()=>{const text=await remote("document.querySelector('.dialogue-toast')?.innerText||''");return text&&text!==before?text:false;},'new dialogue '+label,8000);
    return {label,point,audible:true,dialogue};
  }
  try {
    window.show();step('runtime',{libraryRoot,executable:process.execPath,versions:process.versions});
    step('resource-probe',{results:await gallery("Promise.all(['l2d://gallery/data/skins-data.js','l2d://gallery/desktop/renderer.js'].map(async url=>{try{const r=await fetch(url);return {url,status:r.status,headers:[...r.headers],text:(await r.text()).slice(0,200)};}catch(e){return {url,error:e.message}}}))")});
    await until(()=>gallery('document.documentElement.dataset.desktopReady==="true"'),'gallery',12000);
    await until(()=>gallery(`document.querySelectorAll('[data-tryout]').length===${sampleCount}&&document.querySelectorAll('[data-model-status]').length===${tryout.availability.length-sampleCount}`),'gallery availability badges',12000);
    const original=await gallery("({cards:document.querySelectorAll('.card').length,originals:document.querySelectorAll('[data-open-artwork]').length,guides:document.querySelectorAll('[data-open-guide]').length})");
    // The catalog keeps growing through cloud sync; compare with the loaded catalog, not a fixed size.
    const catalogSize=tryout.availability.length,guideCount=tryout.availability.filter(s=>s.guidePath).length;
    assert.deepEqual(original,{cards:catalogSize,originals:catalogSize,guides:guideCount});
    await gallery("document.getElementById('search').value='午夜频道';document.getElementById('search').dispatchEvent(new Event('input',{bubbles:true}));");
    await until(()=>gallery('document.querySelectorAll("[data-tryout]").length===1'),'filtered entry',4000);
    await gallery("document.getElementById('clearSearch').click()");
    await until(()=>gallery(`document.querySelectorAll('[data-tryout]').length===${sampleCount}`),'entries after search',4000);
    step('gallery-regression',original);
    await gallery(`document.querySelector('[data-tryout="${tryout.samples[0].id}"]').click()`);
    await until(()=>tryout.window&&!tryout.window.isDestroyed(),'player window',10000);
    await until(()=>local('document.documentElement.dataset.tryoutReady==="true"'),'player shell',12000);
    step('player-window',{visible:tryout.window.isVisible(),focused:tryout.window.isFocused(),minimized:tryout.window.isMinimized(),bounds:tryout.model.bounds});
    await pause(4000);
    step('initial-model-state',{nativeVisible:tryout.model.view?.getVisible(),occluded:tryout.model.occluded,body:await remote('document.body.innerText.slice(0,2200)'),viewport:await remote('({width:innerWidth,height:innerHeight,visibility:document.visibilityState})')});
    await ready(tryout.samples[0].id);
    await click('choose-skin');await until(()=>local('document.getElementById("skin-picker").open'),'skin picker',5000);
    const counts=await local("({playable:document.querySelectorAll('.sample-choice').length,text:document.getElementById('mapping-summary').textContent})");assert.equal(counts.playable,sampleCount);
    await local("document.getElementById('skin-search').value='狮';document.getElementById('skin-search').dispatchEvent(new Event('input'));");
    const lionIds=['azl-24a8b69272bcc3f0','azl-789bced6e0969a71'];
    if(tryout.samples.some(s=>s.id==='azl-87f08799adbabb12'))lionIds.push('azl-87f08799adbabb12');
    assert.deepEqual(await local("[...document.querySelectorAll('.sample-choice')].map(e=>e.dataset.skinId).sort()"),lionIds.sort());
    await local("document.getElementById('skin-search').value='信浓';document.getElementById('skin-search').dispatchEvent(new Event('input'));");
    const shinanoIds=['azl-7f76cef9141cdab6'];
    if(tryout.samples.some(s=>s.id==='azl-406b71d0160fadb4'))shinanoIds.push('azl-406b71d0160fadb4');
    assert.deepEqual(await local("[...document.querySelectorAll('.sample-choice')].map(e=>e.dataset.skinId).sort()"),shinanoIds.sort());
    if(tryout.batch>=4){
      await local("document.getElementById('skin-search').value='腓特烈·卡尔';document.getElementById('skin-search').dispatchEvent(new Event('input'));");
      assert.deepEqual(await local("[...document.querySelectorAll('.sample-choice')].map(e=>e.dataset.skinId).sort()"),['azl-604a37a57691b511','azl-9b55443b7f67aba2'].sort());
    }
    await local("document.getElementById('skin-search').value='';document.getElementById('skin-status').value='review';document.getElementById('skin-status').dispatchEvent(new Event('change'));");
    assert.equal(await local("document.querySelectorAll('.sample-choice:disabled').length"),reviewCount);
    const denied=await local("window.l2dTryout.select('azl-4ca72f96fc1f3915').then(()=>false,()=>true)");assert.equal(denied,true);
    await local("document.getElementById('skin-status').value='all';document.getElementById('skin-status').dispatchEvent(new Event('change'));");
    assert.equal(await local("document.querySelectorAll('.sample-choice').length"),tryout.availability.length);
    await paint();fs.writeFileSync(path.join(out,'picker.png'),(await tryout.window.webContents.capturePage()).toPNG());
    await click('close-picker');await until(()=>!tryout.model.occluded,'picker restored model',3000);
    step('search-filter-and-review-guard',counts);
    const deep=mode==='regression';
    const regressionAnchors=['azl-e6548902747dbc36','azl-24a8b69272bcc3f0','azl-604a37a57691b511','azl-406b71d0160fadb4'];
    const coveredIds=deep&&tryout.batch>=4?[...regressionAnchors,...tryout.release.newIds]:deep?tryout.release.enabledIds:tryout.release.newIds;
    let subjects=tryout.batch?tryout.samples.filter(s=>coveredIds.includes(s.id)):tryout.samples;
    const onlyIndex=process.argv.indexOf('--test-only-skin');
    if(onlyIndex>=0){assert.equal(mode,'interaction');const id=process.argv[onlyIndex+1];assert(subjects.some(s=>s.id===id),'Unknown diagnostic skin');subjects=subjects.filter(s=>s.id===id);}
    step('coverage-plan',{available:sampleCount,testedIds:subjects.map(s=>s.id),newIds:tryout.release.newIds,method:deep&&tryout.batch>=4?'All new skins plus four accepted regression anchors':'Full batch or new-only according to mode'});
    for(let index=0;index<subjects.length;index++) {
      const sample=subjects[index];if(tryout.selected.id!==sample.id)await choose(sample.id);
      const load={sampleId:sample.id,character:sample.character,skinName:sample.name,url:sample.url,milliseconds:tryout.model.state.readyMs,ui:tryout.model.attempt.observations.at(-1)};
      assert(tryout.model.retired.every(row=>row.destroyed));
      if(deep){
        load.action=await action('login');
        await remote(`document.querySelector('button[aria-label="触摸区域"]:not([aria-pressed="true"])')?.click()`);await pause(350);
        load.capture=await capture(`skin-${sample.onlineId}`);
        await remote(`document.querySelector('button[aria-label="触摸区域"][aria-pressed="true"]')?.click()`);
        await click('guide-tab');
        if(sample.guidePath){await until(()=>local('document.getElementById("small-image").naturalWidth>1000'),'guide image',8000);load.guideWidth=await local('document.getElementById("small-image").naturalWidth');}
        else assert.equal(await local('document.getElementById("guide-empty").hidden'),false);
        await click('notes-tab');
        assert.equal(tryout.notes.get(sample.id).entries.length,0,'fresh test profile');
        await local(`(()=>{const values={'note-location':${JSON.stringify(sample.character+' '+sample.onlineId)},'note-steps':'点击动作菜单进行验证','note-result':'本批隔离测试记录'};for(const [id,value]of Object.entries(values)){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('note-triggered').checked=true;document.getElementById('note-triggered').dispatchEvent(new Event('input'));})()`);
        await click('save-note');await until(()=>tryout.notes.get(sample.id).entries.length===1,'skin-specific note saved',6000);
      }
      if(mode==='interaction')await touchHead(sample);
      if(!deep){await silent();await remote(`document.querySelector('button[aria-label="触摸区域"]:not([aria-pressed="true"])')?.click()`);await pause(500);load.capture=await capture('idle-'+sample.onlineId);}
      const prefs=tryout.model.contents.getLastWebPreferences();assert.equal(prefs.sandbox,true);assert.equal(prefs.nodeIntegration,false);
      assert.deepEqual(await remote('({require:typeof window.require,notes:typeof window.l2dTryout})'),{require:'undefined',notes:'undefined'});
      step('skin-verified',load);
    }
    if(deep){
      await choose(tryout.samples[0].id);await click('guide-tab');
      await click('expand-guide');await until(()=>local('document.getElementById("guide-dialog").open'),'guide dialog',3000);assert.equal(tryout.model.occluded,true);await click('close-guide');await until(()=>!tryout.model.occluded,'model restored',3000);
      await click('mute');await until(()=>tryout.model.contents.isAudioMuted(),'mute',3000);await click('mute');
      tryout.window.setContentSize(1120,740);await pause(600);
      const layout=await local("({overflow:document.body.scrollWidth>innerWidth,stage:document.getElementById('stage').getBoundingClientRect().toJSON(),sidebar:document.getElementById('sidebar').getBoundingClientRect().toJSON()})");assert.equal(layout.overflow,false);assert(layout.stage.width>500&&layout.stage.height>350);step('guide-mute-and-minimum-window',layout);
      tryout.window.setContentSize(1527,944);await pause(500);
      const generation=tryout.model.generation;
      tryout.model.session.webRequest.onBeforeRequest({urls:['https://l2d.su/*']},(_d,cb)=>cb({cancel:true}));
      await click('retry');await until(()=>tryout.model.attempt?.generation>generation,'retry attempt',5000);await until(()=>tryout.model.state.phase==='error','error shown',7000);
      await until(()=>!tryout.model.contents&&tryout.model.retired.every(row=>row.destroyed),'failed renderer released',4000);
      assert.equal(await local('document.getElementById("failure-actions").hidden'),false);
      tryout.model.session.webRequest.onBeforeRequest(null);await click('stage-retry');await until(()=>tryout.model.state.phase!=='error','retry starts',5000);await ready(tryout.samples[0].id);
      step('failure-retry-and-release',{method:'Request failure in isolated test session'});
      await click('notes-tab');await local("document.getElementById('note-location').value='关闭前的未保存草稿';document.getElementById('note-location').dispatchEvent(new Event('input')); ");
      await click('back-gallery');await until(()=>!tryout.window,'player closed',8000);
      await tryout.open(tryout.samples[0].id);await until(()=>local('document.documentElement.dataset.tryoutReady==="true"'),'reopen',12000);
      assert.equal(await local('document.getElementById("note-location").value'),'关闭前的未保存草稿');
      for(const sample of subjects)assert.equal(tryout.notes.get(sample.id).entries[0].location,sample.character+' '+sample.onlineId);
      await ready(tryout.samples[0].id);step('tested-skin-notes-and-draft-persist',{skins:subjects.length,ids:subjects.map(s=>s.id)});
    }
    await tryout.model.stop();assert(tryout.model.retired.every(row=>row.destroyed));
    for(const row of protectedFiles)assert.equal(hash(path.join(libraryRoot,row.file)),row.sha256,row.file);
    step('accepted-build-and-user-notes-preserved',{protectedFiles});
    report.status='passed';report.finishedAt=new Date().toISOString();write();
  }catch(error){report.status='failed';report.error=error.stack;report.finishedAt=new Date().toISOString();try{report.galleryUI=await gallery("({url:location.href,ready:document.documentElement.dataset.desktopReady,bridge:typeof window.l2dDesktop,text:document.body.innerText.slice(0,3500),scripts:[...document.scripts].map(s=>s.src)})");fs.writeFileSync(path.join(out,'gallery-failure.png'),(await window.webContents.capturePage()).toPNG());}catch{}try{report.failureUI=await remote('document.body.innerText.slice(-6000)');await capture('failure');}catch{}write();throw error;}
}
module.exports={run};
