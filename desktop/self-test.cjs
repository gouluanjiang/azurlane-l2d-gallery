const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(check, label, timeout=15000) {
  const end = Date.now()+timeout;
  while(Date.now()<end){ const result=await check(); if(result)return result; await wait(100); }
  throw new Error(`等待超时：${label}`);
}
exports.run = async ({window,libraryRoot,errors,currentState,liveSync}) => {
  const evaluate = code => window.webContents.executeJavaScript(code,true);
  await until(()=>evaluate("document.documentElement.dataset.desktopReady === 'true'"),'图形界面初始化');
  const initial = await evaluate(`({cards:document.querySelectorAll('article.card').length,originals:document.querySelectorAll('[data-open-artwork]').length,guides:document.querySelectorAll('[data-open-guide]').length,bridge:typeof window.l2dDesktop.start,nodeExposed:typeof window.require,buttons:[...document.querySelectorAll('.desktop-actions button')].map(b=>b.textContent),title:document.title})`);
  assert.equal(initial.cards,currentState().total);
  assert.equal(initial.originals,initial.cards);
  assert.equal(initial.guides,68);
  assert.equal(initial.nodeExposed,'undefined');
  assert.equal(initial.bridge,'function');
  await evaluate("document.querySelector('#search').value='午夜频道';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));");
  assert.equal(await evaluate("document.querySelectorAll('article.card').length"),1);
  await evaluate("document.querySelector('[data-open-artwork]').click()");
  const original = await until(()=>evaluate("(()=>{const i=document.querySelector('#guideImage');return !document.querySelector('#guideModal').hidden&&i.complete&&i.naturalWidth?{width:i.naturalWidth,height:i.naturalHeight,src:i.getAttribute('src'),alt:i.alt}:null})()"),'打开高清原图');
  assert.equal(original.width,1000); assert.equal(original.height,1500);
  await evaluate("document.querySelector('#guideClose').click();document.querySelector('#clearSearch').click();document.querySelector('[data-open-guide]').click()");
  const guide = await until(()=>evaluate("(()=>{const i=document.querySelector('#guideImage');return !document.querySelector('#guideModal').hidden&&i.complete&&i.naturalWidth&&i.getAttribute('src').startsWith('assets/guides/')?{width:i.naturalWidth,height:i.naturalHeight,src:i.getAttribute('src')}:null})()"),'打开玩法图解');
  assert.ok(guide.width>0&&guide.height>0);
  await evaluate("document.querySelector('#guideClose').click();document.querySelector('#desktop-settings').click()");
  assert.equal(await evaluate("document.querySelector('#desktop-settings-dialog').open"),true);
  await evaluate("document.querySelector('#desktop-settings-dialog [data-close]').click();document.querySelector('#desktop-details').click()");
  assert.equal(await evaluate("document.querySelector('#desktop-log-dialog').open"),true);
  await evaluate("document.querySelector('#desktop-log-dialog [data-close]').click()");
  let synchronization;
  if(liveSync){
    const reloaded = new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
    await evaluate("document.querySelector('#desktop-sync').click()");
    await until(()=>currentState().job.phase==='running','软件内开始同步');
    assert.equal(await evaluate("document.querySelector('#desktop-sync').disabled"),true);
    const duplicate = await evaluate("window.l2dDesktop.start('sync')");
    assert.equal(duplicate.busy,true);
    await until(()=>currentState().job.phase!=='running','真实云端同步',120000);
    synchronization = currentState().job;
    assert.equal(synchronization.phase,'success',JSON.stringify(synchronization));
    await Promise.race([reloaded,wait(15000).then(()=>{throw new Error('同步后的页面未完成重载');})]);
    await until(()=>evaluate("document.documentElement.dataset.desktopReady === 'true' && !document.querySelector('#desktop-sync').disabled"),'同步后刷新');
  }
  const final = await evaluate("({cards:document.querySelectorAll('article.card').length,message:document.querySelector('#desktop-message').textContent,ready:document.documentElement.dataset.desktopReady})");
  assert.equal(final.cards,currentState().total);
  await until(()=>evaluate("[...document.querySelectorAll('img.thumb')].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).every(i=>i.complete&&i.naturalWidth>0)"),'首屏图片加载');
  await until(()=>evaluate("document.querySelector('.desktop-brand img').complete && document.querySelector('.desktop-brand img').naturalWidth>0"),'应用图标');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const verification=path.join(libraryRoot,'verification'); fs.mkdirSync(verification,{recursive:true});
  const capture = await window.webContents.capturePage();
  fs.writeFileSync(path.join(verification,'desktop-preview.png'),capture.toPNG());
  const report={status:'passed',testedAt:new Date().toISOString(),execution:'Actual packaged Windows executable, native Electron BrowserWindow and bundled utility process',initial,original,guide,settingsAndLogsOpened:true,synchronization,final,consoleErrors:errors,screenshot:'verification/desktop-preview.png'};
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(verification,'desktop-acceptance.json'),JSON.stringify(report,null,2)+'\n');
};
