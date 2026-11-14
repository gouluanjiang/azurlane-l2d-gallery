(() => {
  'use strict';
  const api = window.l2dDesktop;
  if (!api) return;
  document.body.classList.add('desktop');
  const summary = document.querySelector('#summary')?.textContent || '';
  const bar = document.createElement('nav');
  bar.className = 'desktop-bar'; bar.setAttribute('aria-label', '软件操作');
  bar.innerHTML = `<div class="desktop-brand"><img src="desktop/icon.png" alt=""><span>碧蓝航线图鉴<small id="desktop-summary"></small></span></div>
    <button id="desktop-details" class="desktop-status" type="button" title="查看更新过程"><span class="desktop-dot"></span><span id="desktop-message" role="status" aria-live="polite">正在载入图鉴…</span><span class="desktop-progress" hidden><i></i></span></button>
    <a id="desktop-release" class="desktop-release" href="#" target="_blank" rel="noopener" hidden></a>
    <div class="desktop-actions"><button id="desktop-tryout" class="desktop-primary" hidden>▶ 试玩台</button><button id="desktop-sync">检查更新</button><button id="desktop-settings" aria-label="软件设置">设置</button></div>`;
  document.body.prepend(bar);
  document.querySelector('#desktop-summary').textContent = summary.replace(/^共 /, '');
  const message = document.querySelector('#desktop-message');
  const progress = bar.querySelector('.desktop-progress');

  // Favorites live in .desktop-data/favorites.json; the page shows the stars and the
  // “只看收藏” filter only once the desktop app hands them over.
  if (api.favorites && window.l2dGallery?.enableFavorites) {
    api.favorites().then(ids => window.l2dGallery.enableFavorites(ids, (id, on) => api.setFavorite(id, on))).catch(() => {});
  }

  // Tryout: one button on each playable card, one in the image viewer, one in the top bar.
  let playable = new Map();
  const openTryout = id => api.openSample(id).catch(error => { message.textContent = error.message; });
  const viewerPlay = document.createElement('button');
  viewerPlay.type = 'button'; viewerPlay.className = 'viewer-accent'; viewerPlay.textContent = '▶ 进入试玩'; viewerPlay.hidden = true;
  viewerPlay.addEventListener('click', () => openTryout(document.querySelector('#guideModal').dataset.skinId));
  document.querySelector('#viewerActions')?.append(viewerPlay);
  const syncViewer = () => { viewerPlay.hidden = !playable.has(document.querySelector('#guideModal')?.dataset.skinId); };
  document.querySelector('#guideModal')?.addEventListener('viewer-change', syncViewer);
  api.samples().then(samples => {
    if (!samples.length) return;
    playable = new Map(samples.map(s => [s.id, s]));
    const top = document.querySelector('#desktop-tryout'); top.hidden = false;
    top.title = `共 ${samples.length} 款可试玩`;
    const newest = [...samples].sort((x, y) => String(y.releaseDate).localeCompare(String(x.releaseDate)))[0];
    top.addEventListener('click', () => openTryout(newest.id));
    const grid = document.querySelector('.grid');
    const decorate = () => {
      for (const card of grid.querySelectorAll('.card:not([data-decorated])')) {
        card.dataset.decorated = '';
        const sample = playable.get(card.dataset.skinId);
        if (!sample) continue;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'card-play'; button.dataset.tryout = sample.id; button.textContent = '▶ 试玩';
        button.setAttribute('aria-label', `试玩${sample.character}「${sample.name}」`);
        button.addEventListener('click', () => openTryout(sample.id));
        card.querySelector('.meta').append(button);
      }
    };
    decorate(); syncViewer();
    if (grid) new MutationObserver(decorate).observe(grid, { childList: true });
    api.availability().then(rows => {
      const pending = new Map(rows.filter(row => row.status !== 'playable').map(row => [row.id, row]));
      const annotate = () => {
        for (const card of grid.querySelectorAll('.card:not([data-annotated])')) {
          card.dataset.annotated = '';
          const row = pending.get(card.dataset.skinId);
          if (!row) continue;
          const tag = document.createElement('span');
          tag.className = 'badge model-availability'; tag.dataset.modelStatus = row.status; tag.title = row.reason || '';
          tag.textContent = row.status === 'no-model' ? '暂无在线模型' : '试玩待核对';
          card.querySelector('.badges').append(tag);
        }
      };
      annotate(); if (grid) new MutationObserver(annotate).observe(grid, { childList: true });
    }).catch(() => {});
  }).catch(() => {});

  const panel = document.createElement('dialog'); panel.className = 'desktop-dialog'; panel.id = 'desktop-log-dialog';
  panel.innerHTML = `<div class="desktop-dialog-heading"><h2>更新</h2><button data-close aria-label="关闭更新过程">关闭</button></div>
    <p id="desktop-log-status"></p><pre id="desktop-log">尚未进行更新。</pre>
    <div class="desktop-setting-actions"><button id="desktop-sync-again">检查更新</button><button id="desktop-check">从官方公告直接检查</button></div>
    <p class="desktop-hint">图鉴每次启动会自动检查（最多每 12 小时一次）。“检查更新”接收云端已收录的新皮肤；维护刚结束、云端还没收录时，可用“从官方公告直接检查”立即读取公告与 WIKI。</p>`;
  document.body.append(panel);
  const settings = document.createElement('dialog'); settings.className = 'desktop-dialog'; settings.id = 'desktop-settings-dialog';
  settings.innerHTML = `<div class="desktop-dialog-heading"><h2>设置</h2><button data-close aria-label="关闭软件设置">关闭</button></div>
    <fieldset class="desktop-auto-settings"><legend>自动更新</legend><label><input type="checkbox" id="desktop-auto-sync"> 启动时自动检查更新（最多每 12 小时一次）</label><label><input type="checkbox" id="desktop-auto-tryout"> 自动为新皮肤查找试玩模型</label><p id="desktop-auto-status" class="desktop-hint"></p></fieldset>
    <div class="desktop-setting-actions"><button id="desktop-folder">打开软件文件夹</button><button id="desktop-rollback">回退上次更新</button></div>
    <p id="desktop-no-backup" class="desktop-hint" hidden>目前没有可回退的版本；下次成功更新后会自动保存备份。</p>
    <p class="desktop-hint">程序、图片和设置都在同一个文件夹里，搬家时请移动整个文件夹。</p><p id="desktop-version" class="desktop-hint"></p>`;
  document.body.append(settings);
  const autoBox = settings.querySelector('.desktop-auto-settings');
  if (api.settings) {
    const showSettings = value => {
      document.querySelector('#desktop-auto-sync').checked = value.autoSync; document.querySelector('#desktop-auto-tryout').checked = value.autoTryout;
      const when = iso => iso ? new Date(iso).toLocaleString('zh-CN') : '尚未进行';
      document.querySelector('#desktop-auto-status').textContent = `上次自动检查：${when(value.lastAutoSync)}；上次查找试玩模型：${when(value.lastAutoTryout)}`;
    };
    api.settings().then(showSettings).catch(() => {});
    for (const [id, key] of [['desktop-auto-sync', 'autoSync'], ['desktop-auto-tryout', 'autoTryout']]) {
      document.querySelector('#' + id).addEventListener('change', event => api.setSettings({ [key]: event.target.checked }).then(showSettings).catch(error => { message.textContent = error.message; }));
    }
  } else autoBox.hidden = true;
  const confirm = document.createElement('dialog'); confirm.className = 'desktop-dialog'; confirm.id = 'desktop-confirm-dialog';
  confirm.innerHTML = '<h2>恢复上一版本？</h2><p>图鉴记录将恢复至上一次更新前；已下载的图片仍会保留。</p><div class="desktop-setting-actions"><button data-close>取消</button><button id="desktop-confirm-rollback">确认回退</button></div>';
  document.body.append(confirm);
  for (const dialog of [panel, settings, confirm]) dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  const log = document.querySelector('#desktop-log');
  let running = false, hasRollback = false, retryTimer = null;
  // Image downloads report "补齐本地原图 3/306" (first start) or "下载并校验原图 3" (new skins).
  function downloadProgress(lines = []) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = /(?:补齐本地原图|下载并校验原图) (\d+)(?:\/(\d+))?/.exec(lines[i]);
      if (match) return { done: Number(match[1]), total: match[2] ? Number(match[2]) : 0 };
    }
    return null;
  }
  const retryImages = () => window.l2dGallery?.retryFailedImages();
  function render(job) {
    const wasRunning = running;
    running = job.phase === 'running';
    bar.dataset.phase = job.phase;
    const download = running ? downloadProgress(job.lines) : null;
    message.textContent = download ? `正在下载图片 ${download.done}${download.total ? ` / ${download.total}` : ''}（可以继续浏览）` : job.message;
    progress.hidden = !download?.total;
    if (download?.total) progress.firstElementChild.style.width = `${Math.round(download.done / download.total * 100)}%`;
    document.querySelector('#desktop-log-status').textContent = job.message;
    log.textContent = job.lines?.join('\n') || '尚未进行更新。';
    log.scrollTop = log.scrollHeight;
    for (const id of ['desktop-sync', 'desktop-sync-again', 'desktop-check', 'desktop-confirm-rollback']) document.getElementById(id).disabled = running;
    document.querySelector('#desktop-rollback').disabled = running || !hasRollback;
    // Show images as they arrive instead of waiting for the whole download.
    if (download && !retryTimer) retryTimer = setInterval(retryImages, 4000);
    if (!running && retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    if (wasRunning && !running) retryImages();
  }
  async function start(operation) {
    if (running) return;
    try { await api.start(operation); } catch (error) { render({ phase: 'error', message: error.message, lines: [error.message] }); }
  }
  document.querySelector('#desktop-sync').addEventListener('click', () => start('sync'));
  document.querySelector('#desktop-sync-again').addEventListener('click', () => start('sync'));
  document.querySelector('#desktop-check').addEventListener('click', () => start('check'));
  document.querySelector('#desktop-details').addEventListener('click', () => panel.showModal());
  document.querySelector('#desktop-settings').addEventListener('click', () => settings.showModal());
  document.querySelector('#desktop-folder').addEventListener('click', () => api.openFolder());
  document.querySelector('#desktop-rollback').addEventListener('click', () => { settings.close(); confirm.showModal(); });
  document.querySelector('#desktop-confirm-rollback').addEventListener('click', () => { confirm.close(); start('rollback'); });
  // New program version: a link to the release page, opened in the system browser
  // (the window-open handler checks the address against desktop/policy.cjs).
  const releaseLink = document.querySelector('#desktop-release');
  const showRelease = release => {
    releaseLink.hidden = !release;
    if (!release) return;
    releaseLink.href = release.url;
    releaseLink.textContent = `新版本 ${release.version} 可下载`;
    releaseLink.title = '在浏览器打开发行页，下载新版压缩包后解压覆盖到原文件夹';
  };
  api.onRelease?.(showRelease);
  api.onProgress(render);
  api.state().then(state => {
    hasRollback = state.hasRollback;
    document.querySelector('#desktop-no-backup').hidden = hasRollback;
    document.querySelector('#desktop-version').textContent = `桌面版 ${state.appVersion || '1.1.0'} · ${state.total} 款皮肤 · 资料更新至 ${state.updatedTo}`;
    render(state.job);
    showRelease(state.newRelease);
    document.documentElement.dataset.desktopReady = 'true';
  }).catch(error => render({ phase: 'error', message: error.message, lines: [] }));
})();
