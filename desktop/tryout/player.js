(() => {
  'use strict';
  const api=window.l2dTryout, $=id=>document.getElementById(id);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICONS={
    back:'<path d="M10 6l-6 6 6 6M4 12h16"/>',swap:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    left:'<path d="M14.5 5l-7 7 7 7"/>',right:'<path d="M9.5 5l7 7-7 7"/>',
    star:'<path class="star" d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
    mute:'<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M16 9.5l4.5 5M20.5 9.5l-4.5 5"/>',
    sound:'<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15 9a4.2 4.2 0 010 6M17.6 6.4a8 8 0 010 11.2"/>',
    panel:'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>',
    reload:'<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M19.6 4.3v4.2h-4.2"/>',
    video:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.3v5.4l4.6-2.7z" fill="currentColor" stroke="none"/>',
    ext:'<path d="M13.5 5H19v5.5M19 5l-8 8"/><path d="M17 14.5V18a1 1 0 01-1 1H6a1 1 0 01-1-1V8a1 1 0 011-1h3.5"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',close:'<path d="M6 6l12 12M18 6L6 18"/>',
    warn:'<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2v.3"/>'
  };
  const icon=name=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  for(const node of document.querySelectorAll('[data-icon]'))node.insertAdjacentHTML('afterbegin',icon(node.dataset.icon));


  // 鼠标停留时的名称提示：用和界面一致的样式，代替系统自带的提示条。
  // 任何元素的 title 都会被接管（title 被移到 data-tip），所以别处照常写 title 即可。
  (()=>{
    const tip=document.createElement('div'); tip.className='tip'; tip.setAttribute('role','tooltip'); document.body.append(tip);
    let target=null,timer=0;
    const adopt=node=>{ if(node.nodeType===1&&node.hasAttribute('title')){ const text=node.getAttribute('title'); node.removeAttribute('title'); if(text) node.dataset.tip=text; else delete node.dataset.tip; if(node===target) paint(); } };
    function paint(){
      const text=target?.dataset.tip; if(!text) return hide();
      // “收藏（F）” -> 文字 + 按键标记
      const key=/^(.*?)（([^（）]{1,12})）$/.exec(text);
      tip.replaceChildren(key?key[1]:text); if(key){ const kbd=document.createElement('kbd'); kbd.textContent=key[2]; tip.append(kbd); }
      const box=target.getBoundingClientRect(),width=tip.offsetWidth,height=tip.offsetHeight;
      // 第一次出现时直接到位，已经显示时才滑到下一个按钮。
      tip.style.transition=tip.classList.contains('show')?'':'opacity .16s ease';
      const place=((target,box,width,height)=>{
      const bar=target.closest('.topbar');
      if(bar) return {x:box.left+box.width/2<innerWidth/2?box.right+10:box.left-width-10,y:box.top+box.height/2-height/2};
      return {x:box.left+box.width/2-width/2,y:box.top-height-9>=6?box.top-height-9:box.bottom+9};
    })(target,box,width,height);
      tip.style.transform=`translate(${Math.round(Math.max(8,Math.min(innerWidth-width-8,place.x)))}px,${Math.round(place.y)}px)`;
      tip.classList.add('show');
    }
    function hide(){ clearTimeout(timer); target=null; tip.classList.remove('show'); }
    function show(node,delay){ if(node===target) return; hide(); if(!node) return; target=node; timer=setTimeout(paint,delay); }
    document.addEventListener('pointerover',event=>{ const node=event.target instanceof Element?event.target.closest('[title],[data-tip]'):null; if(node) adopt(node); show(node,tip.classList.contains('show')?60:380); });
    document.addEventListener('focusin',event=>{ const node=event.target instanceof Element?event.target.closest('[title],[data-tip]'):null; if(node){ adopt(node); if(node.matches(':focus-visible')) show(node,380); } });
    document.addEventListener('focusout',hide); document.addEventListener('pointerdown',hide,true); document.addEventListener('keydown',hide,true);
    document.addEventListener('scroll',hide,true); window.addEventListener('blur',hide);
    document.documentElement.addEventListener('pointerleave',hide);
    new MutationObserver(records=>{ for(const record of records) adopt(record.target); }).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['title']});
    for(const node of document.querySelectorAll('[title]')) adopt(node);
  })();

  let samples=[], availability=[], favorites=null, current, switching=false, closing=false, currentPhase='idle', favoritesOnly=false;
  const RECENT_KEY='l2d-tryout-recent', RECENT_MAX=8;
  const recentIds=()=>{try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string'):[];}catch{return [];}};
  const remember=id=>localStorage.setItem(RECENT_KEY,JSON.stringify([id,...recentIds().filter(x=>x!==id)].slice(0,RECENT_MAX)));
  const resource=relative=>'l2d://gallery/'+relative.split('/').map(encodeURIComponent).join('/');
  // Small card pictures are made by the app on first use (desktop/thumbs.cjs).
  const thumb=row=>resource('thumbs/'+row.artworkPath);
  function showError(error) { $('state-message').textContent=error.message||String(error);document.body.dataset.phase='error'; }

  // The site's own left column (actions / parameters / parts) inside the model view.
  let actionsCollapsed=localStorage.getItem('l2d-actions-collapsed')==='1';
  const renderActionsToggle=()=>{const label=actionsCollapsed?'展开动作栏':'收起动作栏';$('toggle-actions').title=label;$('toggle-actions').setAttribute('aria-label',label);$('toggle-actions').setAttribute('aria-pressed',String(actionsCollapsed));};
  $('toggle-actions').addEventListener('click',()=>{actionsCollapsed=!actionsCollapsed;localStorage.setItem('l2d-actions-collapsed',actionsCollapsed?'1':'0');renderActionsToggle();api.panel(actionsCollapsed).catch(showError);});

  // The model is a separate view over the page, so it is hidden while the picker is open.
  const picker=$('skin-picker');
  $('choose-skin').addEventListener('click',async()=>{try{await api.occlude(true);renderPicker();picker.showModal();$('skin-search').focus();}catch(e){showError(e);}});
  function closePicker(){
    if(!picker.open||picker.classList.contains('closing'))return;
    picker.classList.add('closing');
    setTimeout(()=>{picker.classList.remove('closing');picker.close();},reduced?0:180);
  }
  $('close-picker').addEventListener('click',closePicker);
  picker.addEventListener('cancel',event=>{event.preventDefault();closePicker();});
  picker.addEventListener('click',event=>{if(event.target===picker)closePicker();});
  picker.addEventListener('close',()=>api.occlude(false).catch(showError));

  function choice(row) {
    const playable=row.status==='playable';
    const b=document.createElement('button');b.type='button';b.className='sample-choice';b.dataset.skinId=row.id;b.dataset.status=row.status;
    b.disabled=!playable||switching;b.setAttribute('aria-pressed',String(row.id===current?.id));
    b.setAttribute('aria-label',`${playable?'试玩':'暂不能试玩'}：${row.character}「${row.name}」`);
    const img=document.createElement('img');img.src=thumb(row);img.alt='';img.loading='lazy';img.decoding='async';
    const text=document.createElement('span'),title=document.createElement('strong'),sub=document.createElement('small');text.className='cap';
    title.textContent=row.character;sub.textContent=row.name;b.title=`${row.character}「${row.name}」 · ${row.type} · ${row.releaseDate}`;
    text.append(title,sub);
    if(!playable){const reason=document.createElement('small');reason.className='match-reason';reason.textContent=row.status==='no-model'?'网站上暂无 Live2D 模型':`试玩模型待核对${row.reason?`：${row.reason}`:''}`;text.append(reason);}
    b.append(img,text);
    if(favorites?.has(row.id)){const mark=document.createElement('span');mark.className='mark on';mark.innerHTML=icon('star');b.append(mark);}
    if(playable)b.addEventListener('click',()=>{picker.close();selectSample(row.id);});
    return b;
  }
  function renderPicker() {
    const query=$('skin-search').value.trim().toLocaleLowerCase(), year=$('skin-year').value;
    const rows=availability.filter(s=>(year==='all'||s.releaseDate.startsWith(year+'-'))&&(!favoritesOnly||favorites?.has(s.id))&&`${s.character} ${s.name}`.toLocaleLowerCase().includes(query))
      .sort((a,b)=>(a.status==='playable'?0:1)-(b.status==='playable'?0:1)||b.releaseDate.localeCompare(a.releaseDate)||a.character.localeCompare(b.character,'zh-CN'));
    $('samples').replaceChildren(...rows.map(choice));
    const byId=new Map(availability.map(s=>[s.id,s]));
    const recent=recentIds().map(id=>byId.get(id)).filter(s=>s?.status==='playable');
    $('recent-box').hidden=Boolean(query)||year!=='all'||favoritesOnly||!recent.length;
    $('recent-list').replaceChildren(...($('recent-box').hidden?[]:recent.map(choice)));
    $('picker-count').textContent=query||year!=='all'||favoritesOnly?`找到 ${rows.length} 款`:`全部 ${rows.length} 款，从新到旧`;$('picker-empty').hidden=rows.length>0;
    $('picker-favorites').hidden=!favorites;$('picker-favorites').setAttribute('aria-pressed',String(favoritesOnly));
  }
  $('skin-search').addEventListener('input',renderPicker);$('skin-year').addEventListener('change',renderPicker);
  $('picker-favorites').addEventListener('click',()=>{favoritesOnly=!favoritesOnly;renderPicker();});
  const sendBounds=()=>{const rect=$('stage').getBoundingClientRect();api.bounds({x:rect.left+1,y:rect.top+1,width:rect.width-2,height:rect.height-2}).catch(showError);};
  new ResizeObserver(sendBounds).observe($('stage'));window.addEventListener('resize',sendBounds);

  const FAILURES={
    'site-down':{title:'l2d.su 网站暂时无法访问',detail:'在线模型由 l2d.su 提供，现在是这个网站连不上或出错，不是本程序的故障。图鉴和原图仍可正常使用；可以稍后点“重新尝试”，或“在浏览器打开”确认网站状态。'},
    offline:{title:'电脑似乎没有联网',detail:'试玩需要联网。图鉴里已下载的原图仍可离线查看；联网后点“重新尝试”。'}
  };
  function renderState(state) {
    if(state.sampleId&&current&&state.sampleId!==current.id)return;
    currentPhase=state.phase;document.body.dataset.phase=state.phase;
    const failed=state.phase==='error';
    // A whole-site outage or a missing network is not this program failing: say so plainly.
    // Anything else is this one model failing while the site itself answers.
    const failure=failed?(FAILURES[state.reason]||{title:'这款模型暂时没能打开',detail:state.message}):null;
    $('state-message').textContent=state.phase==='ready'?'可以开始试玩':failure?failure.title:state.message;$('state-message').title=state.message||'';
    $('elapsed').textContent=state.phase==='ready'?`${(state.readyMs/1000).toFixed(1)} 秒`:!failed&&state.elapsedMs?`已等待 ${Math.floor(state.elapsedMs/1000)} 秒`:'';
    $('placeholder').hidden=state.phase==='ready';
    $('spinner').hidden=failed;$('failure-actions').hidden=!failed;$('failure-icon').hidden=!failed;
    const percent=/(\d{1,3})\s*%/.exec(state.message||'');
    $('spinner').classList.toggle('unknown',!percent);$('progress-bar').style.transform=percent?`scaleX(${Math.min(100,Number(percent[1]))/100})`:'';
    $('placeholder-title').textContent=failure?failure.title:'正在准备互动模型';
    $('placeholder-message').textContent=failure?failure.detail:'一般需要 5～15 秒，取决于网络。';
    $('stage').dataset.reason=failed&&state.reason||'';
    const muted=Boolean(state.muted),label=muted?'取消静音':'静音';
    $('mute').setAttribute('aria-pressed',String(muted));$('mute').title=label;$('mute').setAttribute('aria-label',label);$('mute').innerHTML=icon(muted?'mute':'sound');
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
  function renderFavorite() {
    const button=$('favorite');button.hidden=!favorites||!current;if(button.hidden)return;
    const on=favorites.has(current.id),label=on?'取消收藏':'收藏';
    button.setAttribute('aria-pressed',String(on));button.title=label;button.setAttribute('aria-label',label);
  }
  $('favorite').addEventListener('click',()=>{
    if(!favorites||!current)return;
    const id=current.id,on=!favorites.has(id);
    if(on)favorites.add(id);else favorites.delete(id);renderFavorite();
    api.setFavorite(id,on).then(ids=>{favorites=new Set(ids);renderFavorite();}).catch(error=>{if(on)favorites.delete(id);else favorites.add(id);renderFavorite();showError(error);});
  });
  // Previous / next skin in release order, newest first.
  const neighbour=delta=>samples[samples.indexOf(current)+delta];
  const renderNeighbours=()=>{$('prev-skin').disabled=!neighbour(-1);$('next-skin').disabled=!neighbour(1);};
  $('prev-skin').addEventListener('click',()=>{const next=neighbour(-1);if(next)selectSample(next.id);});
  $('next-skin').addEventListener('click',()=>{const next=neighbour(1);if(next)selectSample(next.id);});
  async function selectSample(id,initial=false) {
    if(switching||(!initial&&current?.id===id))return;
    switching=true;$('choose-skin').disabled=true;
    try {
      const target=samples.find(s=>s.id===id);if(!target)throw new Error('找不到这款皮肤');
      current=target;document.body.dataset.skinId=id;remember(id);
      $('selected-art').src=thumb(target);$('selected-title').textContent=target.character;$('selected-meta').textContent=`${target.name} · ${target.type}`;
      document.title=`${target.character}「${target.name}」 · L2D 试玩台`;
      $('loading-art').src=resource(target.artworkPath);$('stage-bg').style.backgroundImage=`url("${thumb(target)}")`;
      renderForms(target,0);renderFavorite();renderNeighbours();
      renderState({phase:'connecting',sampleId:id,message:'正在连接在线模型…',elapsedMs:0});
      await api.select(id);sendBounds();
    }catch(error){showError(error);}finally{switching=false;$('choose-skin').disabled=false;}
  }
  const retry=()=>api.retry().catch(showError);
  $('retry').addEventListener('click',retry);$('stage-retry').addEventListener('click',retry);
  for(const id of ['open-browser','stage-browser'])$(id).addEventListener('click',()=>api.browser().catch(showError));
  $('search-guide').addEventListener('click',()=>api.search().catch(showError));
  $('mute').addEventListener('click',()=>api.mute($('mute').getAttribute('aria-pressed')!=='true').catch(showError));

  // "返回图鉴" hides this page and the model; the model stays loaded for the next visit.
  async function close() {
    if(closing)return;closing=true;
    try{await api.occlude(true);document.body.classList.add('leaving');await new Promise(resolve=>setTimeout(resolve,reduced?0:200));await api.close();}
    catch(e){showError(e);}finally{closing=false;}
  }
  const enter=()=>{document.body.classList.remove('leaving');document.body.classList.add('entering');requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.remove('entering')));};
  $('back-gallery').addEventListener('click',close);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!picker.open&&!event.defaultPrevented)close();});
  api.onShown(()=>{enter();if(!picker.open)api.occlude(false).catch(showError);sendBounds();});
  api.onState(renderState);api.onSelect(id=>selectSample(id));
  api.onFavorites(ids=>{if(!favorites)return;favorites=new Set(ids);renderFavorite();if(picker.open)renderPicker();});
  renderState({phase:'connecting',message:'正在准备试玩台…',elapsedMs:0});
  api.init().then(async data=>{
    // Newest first: the order of the picker and of the previous / next buttons.
    samples=[...data.samples].sort((a,b)=>b.releaseDate.localeCompare(a.releaseDate)||a.character.localeCompare(b.character,'zh-CN'));
    availability=data.availability;favorites=Array.isArray(data.favorites)?new Set(data.favorites):null;
    const years=[...new Set(availability.map(s=>s.releaseDate.slice(0,4)))].sort().reverse();
    for(const year of years){const option=document.createElement('option');option.value=year;option.textContent=year;$('skin-year').append(option);}
    const waiting=availability.length-samples.length;
    $('mapping-summary').textContent=`共 ${samples.length} 款可试玩${waiting?`，${waiting} 款暂不能试玩`:''}`;
    renderPicker();renderActionsToggle();await api.panel(actionsCollapsed);
    enter();
    await selectSample(data.selectedId,true);document.documentElement.dataset.tryoutReady='true';
  }).catch(showError);
})();
