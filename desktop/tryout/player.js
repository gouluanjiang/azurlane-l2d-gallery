(() => {
  'use strict';
  const api=window.l2dTryout, $=id=>document.getElementById(id);
  let samples=[], availability=[], current, noteState, draftTimer, switching=false, closing=false, writeQueue=Promise.resolve(), lastDraft='', currentPhase='idle';
  const resource=relative=>'l2d://gallery/'+relative.split('/').map(encodeURIComponent).join('/');
  const draft=()=>({editingId:$('note-form').dataset.editingId||null,location:$('note-location').value,steps:$('note-steps').value,result:$('note-result').value,triggered:$('note-triggered').checked});
  function showError(error) { $('note-error').textContent=error.message||String(error);$('note-error').hidden=false; }
  function clearError() { $('note-error').hidden=true; }
  function renderForm(value) {
    $('note-form').dataset.editingId=value.editingId||'';
    $('note-location').value=value.location||'';$('note-steps').value=value.steps||'';$('note-result').value=value.result||'';$('note-triggered').checked=Boolean(value.triggered);
    $('save-note').textContent=value.editingId?'保存修改':'保存记录';$('new-note').hidden=!value.editingId;
    lastDraft=JSON.stringify(draft());$('draft-status').textContent=[value.location,value.steps,value.result].some(Boolean)?'草稿已保留':'尚未输入';
  }
  function queueNote(operation,value) {
    const id=current.id;
    const task=writeQueue.then(async()=>{
      if(current.id!==id)throw new Error('皮肤已切换，请重新打开笔记后保存');
      const state=await api.notes(id,noteState.revision,operation,value);noteState=state;return state;
    });
    writeQueue=task.catch(()=>{});return task;
  }
  async function flushDraft() {
    clearTimeout(draftTimer);
    await writeQueue;
    const value=draft(), serialized=JSON.stringify(value);
    if(!current||!noteState||serialized===lastDraft)return;
    $('draft-status').textContent='正在保留草稿…';
    await queueNote('draft',value);lastDraft=serialized;
    $('draft-status').textContent='草稿已保留';
  }
  for(const id of ['note-location','note-steps','note-result','note-triggered'])$(id).addEventListener('input',()=>{
    $('draft-status').textContent='正在保留草稿…';clearTimeout(draftTimer);draftTimer=setTimeout(()=>flushDraft().catch(showError),350);
  });
  function button(label,action,ariaLabel) { const b=document.createElement('button');b.type='button';b.textContent=label;if(ariaLabel)b.setAttribute('aria-label',ariaLabel);b.addEventListener('click',action);return b; }
  function renderNotes() {
    $('note-count').textContent=noteState.entries.length;$('record-count').textContent=`${noteState.entries.length} 条`;$('undo-row').hidden=!noteState.removed;
    const list=$('notes-list');list.replaceChildren();
    if(!noteState.entries.length){const p=document.createElement('p');p.className='notes-empty';p.textContent='还没有记录。试着触发一个动作，把方法写在上面。';list.append(p);return;}
    for(const entry of noteState.entries){
      const article=document.createElement('article');article.className='note-record';article.dataset.noteId=entry.id;
      const header=document.createElement('header'), title=document.createElement('h4');title.textContent=entry.location||'我的玩法发现';header.append(title);
      if(entry.triggered){const badge=document.createElement('span');badge.className='triggered';badge.textContent='✓ 已触发';header.append(badge);}article.append(header);
      for(const [text,cls] of [[entry.steps,'record-steps'],[entry.result,'record-result']]){if(text){const p=document.createElement('p');p.className=cls;p.textContent=text;article.append(p);}}
      const actions=document.createElement('div');actions.className='record-actions';const time=document.createElement('time');time.dateTime=entry.updatedAt;time.textContent=new Date(entry.updatedAt).toLocaleDateString('zh-CN');actions.append(time);
      actions.append(button('编辑',async()=>{try{await flushDraft();const value={editingId:entry.id,location:entry.location,steps:entry.steps,result:entry.result,triggered:entry.triggered};await queueNote('draft',value);renderForm(value);$('notes-panel').scrollTop=0;$('note-location').focus();}catch(e){showError(e);}},`编辑笔记：${entry.location||'我的玩法发现'}`));
      actions.append(button('移除',async()=>{try{await flushDraft();await queueNote('remove',entry.id);renderForm(noteState.draft);renderNotes();}catch(e){showError(e);}},`移除笔记：${entry.location||'我的玩法发现'}`));
      article.append(actions);list.append(article);
    }
  }
  $('note-form').addEventListener('submit',async event=>{event.preventDefault();$('save-note').disabled=true;clearError();try{await flushDraft();await queueNote('commit',draft());renderForm(noteState.draft);renderNotes();$('draft-status').textContent='记录已保存';}catch(e){showError(e);}finally{$('save-note').disabled=false;}});
  $('new-note').addEventListener('click',async()=>{try{await flushDraft();await queueNote('draft',{editingId:null,location:'',steps:'',result:'',triggered:false});renderForm(noteState.draft);}catch(e){showError(e);}});
  $('undo-note').addEventListener('click',async()=>{try{await flushDraft();await queueNote('undo');renderNotes();}catch(e){showError(e);}});

  function makeViewer(prefix) {
    const viewport=$(prefix+'-viewport'),image=$(prefix+'-image'),label=$(prefix+'-scale');
    const view={scale:1,fitScale:1,x:0,y:0,loaded:false};
    const apply=()=>{image.style.transform=`translate(calc(-50% + ${view.x}px),calc(-50% + ${view.y}px)) scale(${view.scale})`;label.textContent=Math.abs(view.scale-view.fitScale)<.001?'适应':`${Math.round(view.scale*100)}%`;};
    const fit=()=>{if(!image.naturalWidth||!viewport.clientWidth||!viewport.clientHeight)return;view.fitScale=Math.min((viewport.clientWidth-16)/image.naturalWidth,(viewport.clientHeight-16)/image.naturalHeight,1);view.scale=view.fitScale;view.x=view.y=0;apply();};
    const zoom=(scale,point)=>{const previous=view.scale;view.scale=Math.max(Math.min(view.fitScale,.1)/2,Math.min(4,scale));if(point){view.x=point.x-(point.x-view.x)*view.scale/previous;view.y=point.y-(point.y-view.y)*view.scale/previous;}apply();};
    image.addEventListener('load',()=>{view.loaded=true;fit();});
    new ResizeObserver(()=>{if(view.loaded)fit();}).observe(viewport);
    viewport.addEventListener('wheel',event=>{if(!view.loaded)return;event.preventDefault();const rect=viewport.getBoundingClientRect();zoom(view.scale*Math.exp(-event.deltaY*.0015),{x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2});},{passive:false});
    let dragging;
    viewport.addEventListener('pointerdown',event=>{if(event.button!==0||!view.loaded)return;dragging={x:event.clientX,y:event.clientY,px:view.x,py:view.y};viewport.setPointerCapture(event.pointerId);viewport.classList.add('dragging');});
    viewport.addEventListener('pointermove',event=>{if(!dragging)return;view.x=dragging.px+event.clientX-dragging.x;view.y=dragging.py+event.clientY-dragging.y;apply();});
    const stop=()=>{dragging=null;viewport.classList.remove('dragging');};viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);
    viewport.addEventListener('dblclick',()=>Math.abs(view.scale-view.fitScale)<.001?zoom(1):fit());
    for(const b of document.querySelectorAll(`[data-viewer="${prefix}"]`))b.addEventListener('click',()=>{if(b.dataset.zoom==='fit')fit();else zoom(b.dataset.zoom==='original'?1:view.scale*(b.dataset.zoom==='in'?1.3:1/1.3));});
    return {fit,setSource(src){view.loaded=false;image.src=src;}};
  }
  const small=makeViewer('small'),large=makeViewer('large');
  function showTab(tab) {
    for(const name of ['guide','notes']){$(name+'-tab').setAttribute('aria-selected',String(tab===name));$(name+'-panel').hidden=tab!==name;}
    if(tab==='guide')small.fit();
  }
  $('guide-tab').addEventListener('click',()=>showTab('guide'));$('notes-tab').addEventListener('click',()=>showTab('notes'));
  $('start-note').addEventListener('click',()=>{showTab('notes');$('note-location').focus();});
  $('expand-guide').addEventListener('click',async()=>{await api.occlude(true);$('guide-dialog').showModal();large.fit();});
  $('close-guide').addEventListener('click',()=>$('guide-dialog').close());
  $('guide-dialog').addEventListener('close',()=>api.occlude(false).catch(showError));
  $('choose-skin').addEventListener('click',async()=>{try{await api.occlude(true);$('skin-picker').showModal();$('skin-search').focus();}catch(e){showError(e);}});
  $('close-picker').addEventListener('click',()=>$('skin-picker').close());
  $('skin-picker').addEventListener('close',()=>api.occlude(false).catch(showError));
  function renderPicker() {
    const query=$('skin-search').value.trim().toLocaleLowerCase();
    const status=$('skin-status').value;
    const rows=availability.filter(s=>(status==='all'||s.status===status)&&`${s.character} ${s.name}`.toLocaleLowerCase().includes(query));
    const grid=$('samples');grid.replaceChildren();
    const labels={playable:'进入试玩',matched:'已匹配 · 待接入',review:'待核对','no-model':'暂无 Live2D 模型'};
    for(const row of rows){
      const b=document.createElement('button');b.type='button';b.className='sample-choice';b.dataset.skinId=row.id;b.dataset.status=row.status;
      b.disabled=row.status!=='playable'||switching;b.setAttribute('aria-pressed',String(row.id===current?.id));
      b.setAttribute('aria-label',`${labels[row.status]}：${row.character}「${row.name}」`);
      const img=document.createElement('img');img.src=resource(row.artworkPath);img.alt='';img.loading='lazy';
      const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small'),reason=document.createElement('small');
      title.textContent=`${row.character} · ${row.name}`;sub.textContent=`${row.type} · ${row.guidePath?'有本地图解':'暂无图解'} · ${labels[row.status]}`;
      reason.className='match-reason';reason.textContent=row.status==='review'||row.status==='no-model'?row.reason:samples.find(s=>s.id===row.id)?.label||'等待后续批次实测';
      text.append(title,sub,reason);b.append(img,text);
      if(row.status==='playable')b.addEventListener('click',()=>{$('skin-picker').close();selectSample(row.id);});
      grid.append(b);
    }
    $('picker-count').textContent=`找到 ${rows.length} 款`;$('picker-empty').hidden=rows.length>0;
  }
  $('skin-search').addEventListener('input',renderPicker);$('skin-status').addEventListener('change',renderPicker);
  $('toggle-sidebar').addEventListener('click',()=>{const hidden=!$('sidebar').hidden;$('sidebar').hidden=hidden;$('workspace').classList.toggle('side-hidden',hidden);$('toggle-sidebar').textContent=hidden?'展开侧栏':'收起侧栏';$('toggle-sidebar').setAttribute('aria-expanded',String(!hidden));});
  const sendBounds=()=>{const rect=$('stage').getBoundingClientRect();api.bounds({x:rect.left+1,y:rect.top+1,width:rect.width-2,height:rect.height-2}).catch(showError);};
  new ResizeObserver(sendBounds).observe($('stage'));window.addEventListener('resize',sendBounds);

  function renderState(state) {
    if(state.sampleId&&current&&state.sampleId!==current.id)return;
    currentPhase=state.phase;document.body.dataset.phase=state.phase;
    $('state-message').textContent=state.message;$('elapsed').textContent=state.phase==='ready'?`${(state.readyMs/1000).toFixed(1)} 秒就绪`:state.elapsedMs?`已等待 ${Math.floor(state.elapsedMs/1000)} 秒`:'';
    $('placeholder').hidden=state.phase==='ready';$('loading-art').hidden=state.phase==='ready';
    $('spinner').hidden=state.phase==='error';$('failure-actions').hidden=state.phase!=='error';
    $('placeholder-title').textContent=state.phase==='error'?'模型暂时未能打开':'正在准备互动模型';
    $('placeholder-message').textContent=state.phase==='error'?state.message:'首次打开需要加载模型资源，可以先阅读攻略或记录想尝试的操作。';
    $('voice-state').textContent=state.muted?'已静音':state.audible?'语音正在播放':'语音待触发';$('mute').setAttribute('aria-pressed',String(Boolean(state.muted)));$('mute').textContent=state.muted?'取消静音':'静音';
    $('stage').dataset.state=state.phase;
  }
  // Dual-form skins: Live2D opens first; the Spine form is the same skin, notes are shared.
  function renderForms(target,active) {
    const box=$('form-switch');box.replaceChildren();
    const forms=target.forms||[];box.hidden=forms.length<2;
    forms.forEach((form,index)=>{
      const b=document.createElement('button');b.type='button';b.dataset.formIndex=String(index);b.textContent=form.label;
      b.setAttribute('aria-pressed',String(index===active));b.setAttribute('aria-label',`切换到${form.label}形态`);
      b.addEventListener('click',async()=>{if(switching||b.getAttribute('aria-pressed')==='true'&&currentPhase!=='error')return;switching=true;
        try{for(const x of box.children)x.disabled=true;renderState({phase:'connecting',sampleId:target.id,message:`正在切换到${form.label}…`,elapsedMs:0});await api.form(index);
          for(const x of box.children)x.setAttribute('aria-pressed',String(x===b));$('skin-caption').textContent=`${target.character}「${target.name}」 · ${form.label} · 在线模型 l2d.su`;}
        catch(e){showError(e);}finally{switching=false;for(const x of box.children)x.disabled=false;}});
      box.append(b);
    });
  }
  async function selectSample(id,initial=false) {
    if(switching||(!initial&&current?.id===id))return;
    switching=true;$('note-fields').disabled=true;clearError();
    $('choose-skin').disabled=true;for(const b of $('samples').children)b.disabled=true;
    try {
      if(!initial)await flushDraft();
      const target=samples.find(s=>s.id===id);if(!target)throw new Error('找不到这款样例');
      current=target;document.body.dataset.skinId=id;
      $('selected-art').src=resource(target.artworkPath);$('selected-title').textContent=`${target.character} · ${target.name}`;$('selected-meta').textContent=`${target.type} · ${target.releaseDate} · ${target.label}`;
      for(const b of $('samples').children)b.setAttribute('aria-pressed',String(b.dataset.skinId===id));
      $('loading-art').src=resource(target.artworkPath);$('skin-caption').textContent=`${target.character}「${target.name}」${target.forms?.length>1?` · ${target.forms[0].label}`:''} · 在线模型 l2d.su`;
      renderForms(target,0);
      const hasGuide=Boolean(target.guidePath);
      for(const name of ['small-viewport','guide-tools','guide-hint','expand-guide'])$(name).hidden=!hasGuide;
      $('guide-empty').hidden=hasGuide;$('guide-title').textContent=hasGuide?'高清玩法图解':'新装探索';$('guide-caption').textContent=hasGuide?'放大查看点位，再回到模型上试一试。':'先玩起来，把发现记在自己的笔记里。';
      if(hasGuide){const url=resource(target.guidePath);small.setSource(url);large.setSource(url);$('large-title').textContent=`${target.character} · 高清玩法图解`;}
      renderState({phase:'connecting',sampleId:id,message:'正在连接在线模型…',elapsedMs:0});
      const data=await api.select(id);noteState=data.notes;renderForm(noteState.draft);renderNotes();sendBounds();
    }catch(error){showError(error);}finally{switching=false;$('note-fields').disabled=false;$('choose-skin').disabled=false;renderPicker();}
  }
  const retry=()=>api.retry().catch(showError);
  $('retry').addEventListener('click',retry);$('stage-retry').addEventListener('click',retry);
  for(const id of ['open-browser','stage-browser'])$(id).addEventListener('click',()=>api.browser().catch(showError));
  $('search-guide').addEventListener('click',()=>api.search().catch(showError));
  $('mute').addEventListener('click',()=>api.mute($('mute').getAttribute('aria-pressed')!=='true').catch(showError));
  async function close() {if(closing)return;closing=true;$('note-fields').disabled=true;try{await flushDraft();await api.close();}catch(e){showError(e);closing=false;$('note-fields').disabled=false;}}
  $('back-gallery').addEventListener('click',close);api.onClose(close);api.onState(renderState);api.onSelect(id=>selectSample(id));
  api.init().then(async data=>{
    samples=data.samples;availability=data.availability;
    $('release-label').textContent=data.gallery?data.releaseLabel:data.batch?`${data.releaseLabel} · 待你验收`:'两款样例';document.title=data.batch?`L2D 试玩台 · ${data.releaseLabel}`:'L2D 试玩台 · 两款样例';
    $('scope-summary').textContent=`${data.gallery?'共':'本批'} ${samples.length} 款可试玩`;
    const count=status=>availability.filter(s=>s.status===status).length;
    $('mapping-summary').textContent=`共 ${availability.length} 款 · ${count('playable')} 款可试玩 · ${count('matched')} 款已匹配待接入 · ${count('review')} 款待核对`+(data.auditedAt?` · 核对于 ${data.auditedAt.slice(0,10)}`:'');
    renderPicker();
    await selectSample(data.selectedId,true);document.documentElement.dataset.tryoutReady='true';
  }).catch(showError);
})();
