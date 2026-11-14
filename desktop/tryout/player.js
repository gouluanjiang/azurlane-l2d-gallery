(() => {
  'use strict';
  const api=window.l2dTryout, $=id=>document.getElementById(id);
  let samples=[], availability=[], current, switching=false, closing=false, currentPhase='idle';
  const RECENT_KEY='l2d-tryout-recent', RECENT_MAX=8;
  const recentIds=()=>{try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string'):[];}catch{return [];}};
  const remember=id=>localStorage.setItem(RECENT_KEY,JSON.stringify([id,...recentIds().filter(x=>x!==id)].slice(0,RECENT_MAX)));
  const resource=relative=>'l2d://gallery/'+relative.split('/').map(encodeURIComponent).join('/');
  function showError(error) { $('state-message').textContent=error.message||String(error);document.body.dataset.phase='error'; }

  // The site's own left column (actions / parameters / parts) inside the model view.
  let actionsCollapsed=localStorage.getItem('l2d-actions-collapsed')==='1';
  const renderActionsToggle=()=>{$('toggle-actions').textContent=actionsCollapsed?'展开动作栏':'收起动作栏';$('toggle-actions').setAttribute('aria-pressed',String(actionsCollapsed));};
  $('toggle-actions').addEventListener('click',()=>{actionsCollapsed=!actionsCollapsed;localStorage.setItem('l2d-actions-collapsed',actionsCollapsed?'1':'0');renderActionsToggle();api.panel(actionsCollapsed).catch(showError);});
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
    title.textContent=`${row.character} · ${row.name}`;sub.textContent=`${row.type} · ${row.releaseDate}`;
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

  const FAILURES={
    'site-down':{title:'l2d.su 网站暂时无法访问',detail:'在线模型由 l2d.su 提供，现在是这个网站连不上或出错，不是本程序的故障。图鉴和原图仍可正常使用；可以稍后点“重新尝试”，或“在浏览器打开”确认网站状态。'},
    offline:{title:'电脑似乎没有联网',detail:'试玩需要联网。图鉴里已下载的原图仍可离线查看；联网后点“重新尝试”。'}
  };
  function renderState(state) {
    if(state.sampleId&&current&&state.sampleId!==current.id)return;
    currentPhase=state.phase;document.body.dataset.phase=state.phase;
    $('state-message').textContent=state.phase==='ready'?'可以开始试玩':state.message;$('state-message').title=state.message||'';
    $('elapsed').textContent=state.phase==='ready'?`${(state.readyMs/1000).toFixed(1)} 秒`:state.elapsedMs?`已等待 ${Math.floor(state.elapsedMs/1000)} 秒`:'';
    $('placeholder').hidden=state.phase==='ready';$('loading-art').hidden=state.phase==='ready';
    $('spinner').hidden=state.phase==='error';$('failure-actions').hidden=state.phase!=='error';
    // A whole-site outage or a missing network is not this program failing: say so plainly.
    const failure=state.phase==='error'?(FAILURES[state.reason]||{title:'模型暂时未能打开',detail:state.message}):null;
    $('placeholder-title').textContent=failure?failure.title:'正在准备互动模型';
    $('placeholder-message').textContent=failure?failure.detail:'首次打开需要加载模型资源，请稍候。';
    $('stage').dataset.reason=state.phase==='error'&&state.reason||'';
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
    renderPicker();renderActionsToggle();await api.panel(actionsCollapsed);
    await selectSample(data.selectedId,true);document.documentElement.dataset.tryoutReady='true';
  }).catch(showError);
})();
