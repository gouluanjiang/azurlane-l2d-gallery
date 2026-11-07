(() => {
  'use strict';
  const api=window.l2dTryout, $=id=>document.getElementById(id);
  let samples=[], availability=[], current, switching=false, closing=false, currentPhase='idle';
  // The guide panel is open by default; collapsing it is remembered for skins that have one.
  let guideCollapsed=localStorage.getItem('l2d-guide-collapsed')==='1';
  const RECENT_KEY='l2d-tryout-recent', RECENT_MAX=8;
  const recentIds=()=>{try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string'):[];}catch{return [];}};
  const remember=id=>localStorage.setItem(RECENT_KEY,JSON.stringify([id,...recentIds().filter(x=>x!==id)].slice(0,RECENT_MAX)));
  const resource=relative=>'l2d://gallery/'+relative.split('/').map(encodeURIComponent).join('/');
  function showError(error) { $('state-message').textContent=error.message||String(error);document.body.dataset.phase='error'; }

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
  function layoutSidebar() {
    const hasGuide=Boolean(current?.guidePath), hidden=!hasGuide||guideCollapsed;
    $('sidebar').hidden=hidden;$('workspace').classList.toggle('side-hidden',hidden);
    $('toggle-sidebar').hidden=!hasGuide;$('search-guide').hidden=hasGuide;
    $('toggle-sidebar').textContent=guideCollapsed?'展开图解':'收起图解';$('toggle-sidebar').setAttribute('aria-expanded',String(!hidden));
    if(!hidden)requestAnimationFrame(()=>small.fit());
  }
  $('toggle-sidebar').addEventListener('click',()=>{guideCollapsed=!guideCollapsed;localStorage.setItem('l2d-guide-collapsed',guideCollapsed?'1':'0');layoutSidebar();});
  $('expand-guide').addEventListener('click',async()=>{await api.occlude(true);$('guide-dialog').showModal();large.fit();});
  $('close-guide').addEventListener('click',()=>$('guide-dialog').close());
  $('guide-dialog').addEventListener('close',()=>api.occlude(false).catch(showError));
  $('choose-skin').addEventListener('click',async()=>{try{await api.occlude(true);renderPicker();$('skin-picker').showModal();$('skin-search').focus();}catch(e){showError(e);}});
  $('close-picker').addEventListener('click',()=>$('skin-picker').close());
  $('skin-picker').addEventListener('close',()=>api.occlude(false).catch(showError));

  function choice(row) {
    const playable=row.status==='playable';
    const b=document.createElement('button');b.type='button';b.className='sample-choice';b.dataset.skinId=row.id;b.dataset.status=row.status;
    b.disabled=!playable||switching;b.setAttribute('aria-pressed',String(row.id===current?.id));
    b.setAttribute('aria-label',`${playable?'试玩':'暂不能试玩'}：${row.character}「${row.name}」`);
    const img=document.createElement('img');img.src=resource(row.artworkPath);img.alt='';img.loading='lazy';
    const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');
    title.textContent=`${row.character} · ${row.name}`;sub.textContent=`${row.type} · ${row.releaseDate}${row.guidePath?' · 有图解':''}`;
    text.append(title,sub);
    if(!playable){const reason=document.createElement('small');reason.className='match-reason';reason.textContent=row.status==='no-model'?'网站上暂无 Live2D 模型':`试玩模型待核对${row.reason?`：${row.reason}`:''}`;text.append(reason);}
    b.append(img,text);
    if(playable)b.addEventListener('click',()=>{$('skin-picker').close();selectSample(row.id);});
    return b;
  }
  function renderPicker() {
    const query=$('skin-search').value.trim().toLocaleLowerCase(), year=$('skin-year').value;
    const rows=availability.filter(s=>(year==='all'||s.releaseDate.startsWith(year+'-'))&&`${s.character} ${s.name}`.toLocaleLowerCase().includes(query))
      .sort((a,b)=>(a.status==='playable'?0:1)-(b.status==='playable'?0:1)||b.releaseDate.localeCompare(a.releaseDate)||a.character.localeCompare(b.character,'zh-CN'));
    $('samples').replaceChildren(...rows.map(choice));
    const byId=new Map(availability.map(s=>[s.id,s]));
    const recent=recentIds().map(id=>byId.get(id)).filter(s=>s?.status==='playable');
    $('recent-box').hidden=Boolean(query)||year!=='all'||!recent.length;
    $('recent-list').replaceChildren(...($('recent-box').hidden?[]:recent.map(choice)));
    $('picker-count').textContent=query||year!=='all'?`找到 ${rows.length} 款`:`全部 ${rows.length} 款，从新到旧`;$('picker-empty').hidden=rows.length>0;
  }
  $('skin-search').addEventListener('input',renderPicker);$('skin-year').addEventListener('change',renderPicker);
  const sendBounds=()=>{const rect=$('stage').getBoundingClientRect();api.bounds({x:rect.left+1,y:rect.top+1,width:rect.width-2,height:rect.height-2}).catch(showError);};
  new ResizeObserver(sendBounds).observe($('stage'));window.addEventListener('resize',sendBounds);

  function renderState(state) {
    if(state.sampleId&&current&&state.sampleId!==current.id)return;
    currentPhase=state.phase;document.body.dataset.phase=state.phase;
    $('state-message').textContent=state.phase==='ready'?'可以开始试玩':state.message;$('state-message').title=state.message||'';
    $('elapsed').textContent=state.phase==='ready'?`${(state.readyMs/1000).toFixed(1)} 秒`:state.elapsedMs?`已等待 ${Math.floor(state.elapsedMs/1000)} 秒`:'';
    $('placeholder').hidden=state.phase==='ready';$('loading-art').hidden=state.phase==='ready';
    $('spinner').hidden=state.phase==='error';$('failure-actions').hidden=state.phase!=='error';
    $('placeholder-title').textContent=state.phase==='error'?'模型暂时未能打开':'正在准备互动模型';
    $('placeholder-message').textContent=state.phase==='error'?state.message:'首次打开需要加载模型资源，请稍候。';
    $('voice-state').textContent=state.muted?'已静音':state.audible?'语音播放中':'';$('mute').setAttribute('aria-pressed',String(Boolean(state.muted)));$('mute').textContent=state.muted?'取消静音':'静音';
    $('stage').dataset.state=state.phase;
  }
  // Dual-form skins: Live2D opens first; the Spine form is the same skin.
  function renderForms(target,active) {
    const box=$('form-switch');box.replaceChildren();
    const forms=target.forms||[];box.hidden=forms.length<2;
    forms.forEach((form,index)=>{
      const b=document.createElement('button');b.type='button';b.dataset.formIndex=String(index);b.textContent=form.label;
      b.setAttribute('aria-pressed',String(index===active));b.setAttribute('aria-label',`切换到${form.label}形态`);
      b.addEventListener('click',async()=>{if(switching||b.getAttribute('aria-pressed')==='true'&&currentPhase!=='error')return;switching=true;
        try{for(const x of box.children)x.disabled=true;renderState({phase:'connecting',sampleId:target.id,message:`正在切换到${form.label}…`,elapsedMs:0});await api.form(index);
          for(const x of box.children)x.setAttribute('aria-pressed',String(x===b));}
        catch(e){showError(e);}finally{switching=false;for(const x of box.children)x.disabled=false;}});
      box.append(b);
    });
  }
  async function selectSample(id,initial=false) {
    if(switching||(!initial&&current?.id===id))return;
    switching=true;$('choose-skin').disabled=true;
    try {
      const target=samples.find(s=>s.id===id);if(!target)throw new Error('找不到这款皮肤');
      current=target;document.body.dataset.skinId=id;remember(id);
      $('selected-art').src=resource(target.artworkPath);$('selected-title').textContent=`${target.character} · ${target.name}`;$('selected-meta').textContent=`${target.type} · ${target.releaseDate}`;
      document.title=`${target.character}「${target.name}」 · L2D 试玩台`;
      $('loading-art').src=resource(target.artworkPath);
      renderForms(target,0);
      if(target.guidePath){const url=resource(target.guidePath);small.setSource(url);large.setSource(url);$('large-title').textContent=`${target.character} · 玩法图解`;}
      layoutSidebar();
      renderState({phase:'connecting',sampleId:id,message:'正在连接在线模型…',elapsedMs:0});
      await api.select(id);sendBounds();
    }catch(error){showError(error);}finally{switching=false;$('choose-skin').disabled=false;}
  }
  const retry=()=>api.retry().catch(showError);
  $('retry').addEventListener('click',retry);$('stage-retry').addEventListener('click',retry);
  for(const id of ['open-browser','stage-browser'])$(id).addEventListener('click',()=>api.browser().catch(showError));
  $('search-guide').addEventListener('click',()=>api.search().catch(showError));
  $('mute').addEventListener('click',()=>api.mute($('mute').getAttribute('aria-pressed')!=='true').catch(showError));
  async function close() {if(closing)return;closing=true;try{await api.close();}catch(e){showError(e);closing=false;}}
  $('back-gallery').addEventListener('click',close);api.onClose(close);api.onState(renderState);api.onSelect(id=>selectSample(id));
  api.init().then(async data=>{
    samples=data.samples;availability=data.availability;
    const years=[...new Set(availability.map(s=>s.releaseDate.slice(0,4)))].sort().reverse();
    for(const year of years){const option=document.createElement('option');option.value=year;option.textContent=year;$('skin-year').append(option);}
    const waiting=availability.length-samples.length;
    $('mapping-summary').textContent=`共 ${samples.length} 款可试玩${waiting?`，${waiting} 款暂不能试玩`:''}`;
    renderPicker();
    await selectSample(data.selectedId,true);document.documentElement.dataset.tryoutReady='true';
  }).catch(showError);
})();
