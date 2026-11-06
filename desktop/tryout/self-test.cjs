const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=100000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await pause(150);}throw new Error('Timed out: '+label);}
async function run({window,tryout,libraryRoot,testRound,errors}){
  const out=path.join(libraryRoot,`verification/two-skin-sample/round-${testRound}`);fs.mkdirSync(out,{recursive:true});
  const report={status:'running',round:Number(testRound),startedAt:new Date().toISOString(),steps:[],errors};
  const write=()=>fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
  const step=(name,details={})=>{report.steps.push({name,at:new Date().toISOString(),...details});write();};
  const initialCatalogHash=createHash('sha256').update(fs.readFileSync(path.join(libraryRoot,'data/catalog.json'))).digest('hex');
  const local=script=>tryout.window.webContents.executeJavaScript(script);
  const remote=script=>tryout.model.contents.executeJavaScript(script);
  async function capture(name){const wc=tryout.model.contents;const img=await wc.capturePage();fs.writeFileSync(path.join(out,`${name}-model.png`),img.toPNG());const host=await tryout.window.webContents.capturePage();fs.writeFileSync(path.join(out,`${name}-shell.png`),host.toPNG());return {image:img.getSize(),bounds:tryout.model.bounds,model:name+'-model.png',shell:name+'-shell.png'};}
  async function ready(id){return until(()=>{if(tryout.model.state.phase==='error')throw new Error(tryout.model.state.error+': '+tryout.model.state.message);return tryout.model.state.phase==='ready'&&tryout.model.state.sampleId===id;},'interactive model '+id);}
  const click=async id=>local(`document.getElementById(${JSON.stringify(id)}).click()`);
  async function reload(id='retry'){const generation=tryout.model.generation;await click(id);await until(()=>tryout.model.attempt?.generation>generation,'new retry attempt',7000);}
  const pointer=async p=>{const wc=tryout.model.contents;tryout.window.focus();wc.focus();wc.sendInputEvent({type:'mouseMove',x:p.x,y:p.y});wc.sendInputEvent({type:'mouseDown',x:p.x,y:p.y,button:'left',clickCount:1});await pause(120);wc.sendInputEvent({type:'mouseUp',x:p.x,y:p.y,button:'left',clickCount:1});};
  async function silent(){let since=0;await until(()=>{if(tryout.model.contents.isCurrentlyAudible()){since=0;return false;}since ||=Date.now();return Date.now()-since>700;},'previous audio ends',40000);}
  async function touchHead(){
    await silent();
    // Locations were read from this sample's captured 1065 x 663 DIP viewport.
    const fraction=tryout.selected.onlineId==='818011'?{x:.582,y:.529}:{x:.611,y:.344};
    const point={x:Math.round(tryout.model.bounds.width*fraction.x),y:Math.round(tryout.model.bounds.height*fraction.y)};
    const before=await remote("document.querySelector('.dialogue-toast')?.innerText||''");
    await remote(`document.querySelector('button[aria-label="触摸区域"]:not([aria-pressed="true"])')?.click()`);await pause(300);
    step('head-tap-target',{point,capture:await capture('target-'+tryout.selected.onlineId)});
    await pointer(point);
    await until(()=>tryout.model.contents.isCurrentlyAudible(),'character head tap audio',12000);
    const dialogue=await remote("document.querySelector('.dialogue-toast')?.innerText||''");
    assert(dialogue&&dialogue!==before,'The character tap should display a new dialogue');
    step('character-head-tap',{sampleId:tryout.selected.id,point,audible:true,dialogue,capture:await capture('head-'+tryout.selected.onlineId)});
    await remote(`document.querySelector('button[aria-label="触摸区域"][aria-pressed="true"]')?.click()`);
  }
  async function motion(label){
    const wc=tryout.model.contents;
    const rect=async label=>remote(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().replace(/^\\d+\\s*/,'')===${JSON.stringify(label)}&&!b.disabled&&b.getBoundingClientRect().width>0&&b.getBoundingClientRect().height>0);if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),expanded:b.getAttribute('aria-expanded')}})()`);
    await silent();
    const header=await until(()=>rect('动作'),'action menu',5000);if(header.expanded!=='true'){await pointer(header);await pause(300);}
    const action=await until(()=>rect(label),'motion '+label,5000);await pointer(action);
    const audible=await until(()=>wc.isCurrentlyAudible(),'motion audio '+label,12000);
    const subtitle=await remote('document.body.innerText.slice(-800)');
    step('motion-and-audio',{sampleId:tryout.selected.id,label,audible,subtitle});
  }
  try{
    window.show();
    await until(()=>window.webContents.executeJavaScript('document.documentElement.dataset.desktopReady === "true"'),'gallery ready',12000);
    await until(()=>window.webContents.executeJavaScript('document.querySelectorAll("[data-tryout]").length === 2'),'two gallery card entries',12000);
    await window.webContents.executeJavaScript(`document.querySelector('[data-tryout="${tryout.samples[0].id}"]').click()`);
    await until(()=>tryout.window&&!tryout.window.isDestroyed(),'sample window',10000);
    await until(()=>local('document.documentElement.dataset.tryoutReady === "true"'),'sample shell',12000);
    step('sample-shell-open',{samples:tryout.samples.map(s=>({id:s.id,onlineId:s.onlineId,name:s.name,hasGuide:Boolean(s.guidePath)})),size:tryout.window.getContentSize()});
    await ready(tryout.samples[0].id);
    const firstCapture=await capture('01-cherbourg');
    step('old-skin-ready',{milliseconds:tryout.model.state.readyMs,ui:tryout.model.attempt.observations.at(-1),capture:firstCapture,backgroundThrottling:tryout.model.contents.getLastWebPreferences().backgroundThrottling});
    if(Number(testRound)===2){await touchHead();await motion('login');}
    if(Number(testRound)===1){
      await motion('login');
      await until(()=>local('document.getElementById("small-image").naturalWidth > 1000'),'local guide decoded',10000);
      await local('document.querySelector("[data-viewer=small][data-zoom=in]").click()');
      assert.notEqual(await local('document.getElementById("small-scale").textContent'),'适应');
      await click('expand-guide');await until(()=>local('document.getElementById("guide-dialog").open'),'expanded guide',3000);
      assert.equal(tryout.model.occluded,true);await click('close-guide');await until(()=>!tryout.model.occluded,'guide closed',3000);
      step('guide-zoom-and-expand',{width:await local('document.getElementById("small-image").naturalWidth')});
      await click('mute');await until(()=>tryout.model.state.muted&&tryout.model.contents.isAudioMuted(),'mute applied',3000);
      await click('mute');await until(()=>!tryout.model.state.muted&&!tryout.model.contents.isAudioMuted(),'mute restored',3000);
      const originalWidth=tryout.model.bounds.width;
      await click('toggle-sidebar');await until(()=>tryout.model.bounds.width>originalWidth,'wider model viewport',3000);
      const expandedWidth=tryout.model.bounds.width;
      await click('toggle-sidebar');await until(()=>tryout.model.bounds.width===originalWidth,'sidebar restored',3000);
      step('mute-and-sidebar',{originalWidth,expandedWidth});
      await click('notes-tab');
      await local(`(()=>{const values={'note-location':'头部','note-steps':'点击一次，观察动作与台词。','note-result':'样例验收记录'};for(const [id,value]of Object.entries(values)){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('note-triggered').checked=true;document.getElementById('note-triggered').dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until(()=>tryout.notes.get(tryout.samples[0].id).draft.location==='头部','draft saved',7000);
      await click('save-note');await until(()=>tryout.notes.get(tryout.samples[0].id).entries.length===1,'note committed',7000);
      step('old-skin-note-saved',{entry:tryout.notes.get(tryout.samples[0].id).entries[0]});
    }
    await local(`document.querySelector('.sample-choice[data-skin-id="${tryout.samples[1].id}"]').click()`);
    await ready(tryout.samples[1].id);
    step('new-skin-ready',{milliseconds:tryout.model.state.readyMs,ui:tryout.model.attempt.observations.at(-1),capture:await capture('02-lion')});
    assert(tryout.model.retired.every(r=>r.destroyed),'Old WebContents must be destroyed');
    if(Number(testRound)===2){await touchHead();await motion('login');}
    if(Number(testRound)===1){
      await motion('login');
      assert.equal(await local('document.getElementById("note-count").textContent'),'0');
      await click('guide-tab');assert.equal(await local('document.getElementById("guide-empty").hidden'),false);
      await click('start-note');await local(`(()=>{const e=document.getElementById('note-location');e.value='新皮肤的待试操作';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('back-gallery');await until(()=>!tryout.window,'sample closed',7000);
      assert.equal(tryout.notes.get(tryout.samples[1].id).draft.location,'新皮肤的待试操作');
      await tryout.open(tryout.samples[1].id);
      await until(()=>local('document.documentElement.dataset.tryoutReady === "true"'),'reopened sample',12000);
      assert.equal(await local('document.getElementById("note-location").value'),'新皮肤的待试操作');
      await ready(tryout.samples[1].id);step('draft-and-notes-survive-reopen');
      tryout.model.session.webRequest.onBeforeRequest({urls:['https://l2d.su/*']},(_d,callback)=>callback({cancel:true}));
      await reload();await until(()=>tryout.model.state.phase==='error','request failure shown',7000);
      await until(()=>!tryout.model.contents&&tryout.model.retired.every(r=>r.destroyed),'failed renderer released',3000);
      assert.equal(await local('document.getElementById("failure-actions").hidden'),false);
      step('request-failure-shown',{method:'Blocked requests in the isolated sample test session only',state:tryout.model.state});
      tryout.model.session.webRequest.onBeforeRequest(null);
      await reload('stage-retry');await ready(tryout.samples[1].id);step('request-failure-recovered');
      const originalTimeout=tryout.model.timeoutMs;tryout.model.timeoutMs=20;
      await reload();await until(()=>tryout.model.state.error==='MODEL_TIMEOUT','hard deadline',7000);
      step('deadline-shown',{testTimeoutMs:20,productionTimeoutMs:originalTimeout});
      tryout.model.timeoutMs=originalTimeout;await reload('stage-retry');await ready(tryout.samples[1].id);
      step('deadline-recovered');
    }
    const preferences=tryout.model.contents.getLastWebPreferences();
    const exposed=await remote('({require:typeof window.require,process:typeof window.process,notes:typeof window.l2dTryout,gallery:typeof window.l2dDesktop})');
    assert.deepEqual(exposed,{require:'undefined',process:'undefined',notes:'undefined',gallery:'undefined'});
    assert.equal(preferences.sandbox,true);assert.equal(preferences.contextIsolation,true);assert.equal(preferences.nodeIntegration,false);
    step('remote-page-isolated',{exposed});
    await tryout.model.stop();assert(tryout.model.retired.every(r=>r.destroyed));
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(libraryRoot,'data/catalog.json'))).digest('hex'),initialCatalogHash);
    step('cleanup-and-catalog-preservation',{retired:tryout.model.retired,catalogSha256:initialCatalogHash});
    report.status='passed';report.finishedAt=new Date().toISOString();write();
  }catch(error){
    report.status='failed';report.error=error.stack;report.finishedAt=new Date().toISOString();
    try{report.modelFailureUI=await remote(`({body:document.body.innerText.slice(0,5000),sidebar:document.querySelector('.sidebar')?.getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).slice(0,35).map(b=>({text:b.textContent.trim(),aria:b.getAttribute('aria-label'),expanded:b.getAttribute('aria-expanded'),rect:b.getBoundingClientRect().toJSON()}))})`);}catch{}
    write();throw error;
  }
}
module.exports={run};
