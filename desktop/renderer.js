// Desktop additions to the gallery page: favorites, the tryout entry, update status,
// the new-version notice and the settings dialogs. The page itself (index.html) also opens
// in a plain browser, where none of this is loaded.
(() => {
  'use strict';
  const api = window.l2dDesktop, page = window.l2dGallery;
  if (!api || !page) return;
  const icon = page.icon;
  const $ = id => document.getElementById(id);
  document.body.classList.add('desktop');

  const brand = $('brand');
  brand.classList.add('desktop-brand');
  brand.querySelector('i')?.remove();
  const logo = document.createElement('img'); logo.src = 'desktop/icon.png'; logo.alt = ''; brand.prepend(logo);

  const actions = $('appActions');
  actions.classList.add('desktop-actions');
  actions.innerHTML = `<button id="desktop-resume" class="rbtn glass desktop-resume" type="button" hidden></button>
    <a id="desktop-release" class="desktop-release" href="#" target="_blank" rel="noopener" hidden></a>
    <button id="desktop-status" class="desktop-status glass" type="button" title="查看更新记录" hidden><span class="desktop-dot"></span><span id="desktop-message" role="status" aria-live="polite">正在载入图鉴…</span><span class="desktop-progress" hidden><i></i></span></button>
    <button id="desktop-settings" class="rbtn glass" type="button" aria-label="设置与更新" title="设置与更新">${icon('sliders')}</button>`;
  const message = $('desktop-message'), statusChip = $('desktop-status'), progress = statusChip.querySelector('.desktop-progress');

  // Dialogs open and close with a short transition.
  function dialog(id, html) {
    const node = document.createElement('dialog'); node.className = 'desktop-dialog'; node.id = id; node.innerHTML = html;
    document.body.append(node);
    node.closeSoftly = () => {
      if (!node.open || node.classList.contains('closing')) return;
      node.classList.add('closing');
      setTimeout(() => { node.classList.remove('closing'); node.close(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    };
    node.addEventListener('cancel', event => { event.preventDefault(); node.closeSoftly(); });
    node.addEventListener('click', event => { if (event.target === node || event.target.closest('[data-close]')) node.closeSoftly(); });
    return node;
  }
  const heading = (title, label) => `<div class="desktop-dialog-heading"><h2>${title}</h2><button class="iconbtn" type="button" data-close aria-label="${label}">${icon('close')}</button></div>`;
  const row = (title, note, control) => `<div class="desktop-row"><div><b>${title}</b><small>${note}</small></div>${control}</div>`;

  const settings = dialog('desktop-settings-dialog', `${heading('设置与更新', '关闭软件设置')}
    ${row('图鉴更新', '<span id="desktop-update-line">正在载入…</span>', `<button id="desktop-sync" class="btn" type="button">${icon('reload')}检查更新</button>`)}
    <div class="desktop-bar" id="desktop-settings-bar" hidden><i></i></div>
    <div class="desktop-auto-settings">
      <label class="desktop-row"><div><b>启动时自动检查更新</b><small>最多每 12 小时一次，同时查看有没有新版本</small></div><input class="desktop-switch" type="checkbox" id="desktop-auto-sync"></label>
      <label class="desktop-row"><div><b>自动为新皮肤查找试玩模型</b><small>找不到的 3 天后再试</small></div><input class="desktop-switch" type="checkbox" id="desktop-auto-tryout"></label>
      <p id="desktop-auto-status" class="desktop-hint"></p>
    </div>
    ${row('软件文件夹', '程序、图片和设置都在同一个文件夹里，搬家时请移动整个文件夹', `<button id="desktop-folder" class="btn" type="button">${icon('folder')}打开</button>`)}
    ${row('回退上次更新', '<span id="desktop-rollback-note">图鉴记录恢复到上一次更新前，已下载的图片保留</span>', '<button id="desktop-rollback" class="btn" type="button">回退</button>')}
    <p id="desktop-no-backup" class="desktop-hint" hidden>目前没有可回退的版本；下次成功更新后会自动保存备份。</p>
    <details class="desktop-more"><summary>更多</summary>
      <p class="desktop-hint">维护刚结束、云端还没收录新皮肤时，可以直接读取官方公告与 WIKI。</p>
      <div class="desktop-setting-actions"><button id="desktop-check" class="btn" type="button">从官方公告直接检查</button><button id="desktop-details" class="btn" type="button">查看更新记录</button></div>
      <p class="desktop-hint desktop-keys"><b>快捷键</b>　/ 搜索　·　方向键 选卡片　·　Enter 看原图　·　P 试玩　·　F 收藏　·　W 铺满 / 标准　·　看图时 ← → 翻看、滚轮缩放、双击 100%　·　Esc 返回</p>
    </details>
    <p id="desktop-version" class="desktop-hint"></p>`);
  const panel = dialog('desktop-log-dialog', `${heading('更新记录', '关闭更新记录')}
    <p id="desktop-log-status"></p><pre id="desktop-log">尚未进行更新。</pre>
    <div class="desktop-setting-actions"><button id="desktop-sync-again" class="btn" type="button">${icon('reload')}检查更新</button></div>`);
  const confirm = dialog('desktop-confirm-dialog', `<h2>恢复上一版本？</h2><p>图鉴记录将恢复至上一次更新前；已下载的图片仍会保留。</p>
    <div class="desktop-setting-actions"><button class="btn" type="button" data-close>取消</button><button id="desktop-confirm-rollback" class="btn desktop-danger" type="button">确认回退</button></div>`);

  // Favorites live in .desktop-data/favorites.json.
  if (api.favorites && page.enableFavorites) {
    api.favorites().then(ids => page.enableFavorites(ids, (id, on) => api.setFavorite(id, on))).catch(() => {});
    api.onFavorites?.(ids => page.setFavorites(ids));
  }

  // Tryout: the page draws the buttons; opening fades the gallery out first, because the
  // tryout is a separate view laid over this page (see desktop/tryout/manager.cjs).
  const showError = error => { message.textContent = error.message || String(error); statusChip.hidden = false; actions.dataset.phase = 'error'; };
  let opening = false;
  function openTryout(id) {
    if (opening) return;
    opening = true; document.body.classList.add('tryout-leaving');
    // Wait at least two frames even without the fade, so the page drops its drag areas (desktop.css)
    // while it is still visible.
    const go = () => api.openSample(id).catch(error => { document.body.classList.remove('tryout-leaving'); showError(error); }).finally(() => { opening = false; });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(() => requestAnimationFrame(go));
    else setTimeout(go, 200);
  }
  const resume = $('desktop-resume');
  let resumeId = null;
  resume.addEventListener('click', () => resumeId && openTryout(resumeId));
  // { open, id, character }: the tryout is showing (open) or kept loaded in the background.
  const showTryout = value => {
    if (!value?.open) document.body.classList.remove('tryout-leaving');
    resumeId = value?.id || null;
    resume.hidden = !resumeId || value.open;
    if (resumeId) { resume.innerHTML = icon('play') + '<span></span>'; resume.lastElementChild.textContent = `继续试玩 · ${value.character || ''}`; resume.title = '回到刚才的试玩，不用重新加载'; }
  };
  api.onTryout?.(showTryout);
  api.tryoutState?.().then(showTryout).catch(() => {});
  Promise.all([api.samples(), api.availability().catch(() => [])]).then(([samples, rows]) => {
    if (!samples.length) return;
    page.enableTryout({
      playable: new Map(samples.map(sample => [sample.id, sample])),
      pending: new Map(rows.filter(item => item.status !== 'playable').map(item => [item.id, item])),
      open: openTryout
    });
  }).catch(() => {});

  if (api.settings) {
    const showSettings = value => {
      $('desktop-auto-sync').checked = value.autoSync; $('desktop-auto-tryout').checked = value.autoTryout;
      const when = iso => iso ? new Date(iso).toLocaleString('zh-CN') : '尚未进行';
      $('desktop-auto-status').textContent = `上次自动检查：${when(value.lastAutoSync)}；上次查找试玩模型：${when(value.lastAutoTryout)}`;
    };
    api.settings().then(showSettings).catch(() => {});
    for (const [id, key] of [['desktop-auto-sync', 'autoSync'], ['desktop-auto-tryout', 'autoTryout']])
      $(id).addEventListener('change', event => api.setSettings({ [key]: event.target.checked }).then(showSettings).catch(showError));
  } else settings.querySelector('.desktop-auto-settings').hidden = true;

  const log = $('desktop-log');
  let running = false, hasRollback = false, retryTimer = null, hideTimer = null;
  // Image downloads report "补齐本地原图 3/306" (first start) or "下载并校验原图 3" (new skins).
  function downloadProgress(lines = []) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = /(?:补齐本地原图|下载并校验原图) (\d+)(?:\/(\d+))?/.exec(lines[i]);
      if (match) return { done: Number(match[1]), total: match[2] ? Number(match[2]) : 0 };
    }
    return null;
  }
  const retryImages = () => page.retryFailedImages();
  function render(job) {
    const wasRunning = running;
    running = job.phase === 'running';
    actions.dataset.phase = job.phase;
    const download = running ? downloadProgress(job.lines) : null;
    message.textContent = download ? `正在下载图片 ${download.done}${download.total ? ` / ${download.total}` : ''}` : job.message;
    const ratio = download?.total ? download.done / download.total : 0;
    progress.hidden = !download?.total; progress.firstElementChild.style.transform = `scaleX(${ratio})`;
    $('desktop-settings-bar').hidden = !download?.total; $('desktop-settings-bar').firstElementChild.style.transform = `scaleX(${ratio})`;
    $('desktop-update-line').textContent = message.textContent;
    $('desktop-log-status').textContent = job.message;
    log.textContent = job.lines?.join('\n') || '尚未进行更新。';
    log.scrollTop = log.scrollHeight;
    for (const id of ['desktop-sync', 'desktop-sync-again', 'desktop-check', 'desktop-confirm-rollback']) $(id).disabled = running;
    $('desktop-rollback').disabled = running || !hasRollback;
    // The chip in the top bar shows only while something is happening: progress, a failure,
    // or for a few seconds after an update that changed something.
    clearTimeout(hideTimer);
    const changed = job.phase === 'success' && /新增|开放|补齐|恢复/.test(job.message || '');
    statusChip.hidden = !(running || job.phase === 'error' || (wasRunning && changed));
    if (!statusChip.hidden && job.phase === 'success') hideTimer = setTimeout(() => { statusChip.hidden = true; }, 8000);
    // Show images as they arrive instead of waiting for the whole download.
    if (download && !retryTimer) retryTimer = setInterval(retryImages, 4000);
    if (!running && retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    if (wasRunning && !running) retryImages();
  }
  async function start(operation) {
    if (running) return;
    try { await api.start(operation); } catch (error) { render({ phase: 'error', message: error.message, lines: [error.message] }); }
  }
  $('desktop-sync').addEventListener('click', () => start('sync'));
  $('desktop-sync-again').addEventListener('click', () => start('sync'));
  $('desktop-check').addEventListener('click', () => start('check'));
  $('desktop-status').addEventListener('click', () => panel.showModal());
  $('desktop-details').addEventListener('click', () => panel.showModal());
  $('desktop-settings').addEventListener('click', () => settings.showModal());
  $('desktop-folder').addEventListener('click', () => api.openFolder());
  $('desktop-rollback').addEventListener('click', () => { settings.close(); confirm.showModal(); });
  $('desktop-confirm-rollback').addEventListener('click', () => { confirm.close(); start('rollback'); });
  // New program version: a link to the release page, opened in the system browser
  // (the window-open handler checks the address against desktop/policy.cjs).
  const releaseLink = $('desktop-release');
  const showRelease = release => {
    releaseLink.hidden = !release;
    if (!release) return;
    releaseLink.href = release.url;
    releaseLink.innerHTML = icon('download') + '<span></span>'; releaseLink.lastElementChild.textContent = `新版本 ${release.version}`;
    releaseLink.title = '在浏览器打开发行页，下载新版压缩包后解压覆盖到原文件夹（不会自动安装）';
  };
  api.onRelease?.(showRelease);
  api.onProgress(render);
  api.state().then(state => {
    hasRollback = state.hasRollback;
    $('desktop-no-backup').hidden = hasRollback;
    $('desktop-version').textContent = `桌面版${state.appVersion ? ` ${state.appVersion}` : ''} · ${state.total} 款皮肤 · 资料更新至 ${state.updatedTo}`;
    render(state.job);
    showRelease(state.newRelease);
    document.documentElement.dataset.desktopReady = 'true';
  }).catch(error => render({ phase: 'error', message: error.message, lines: [] }));
})();
