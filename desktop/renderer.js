(() => {
  'use strict';
  const api = window.l2dDesktop;
  if (!api) return;
  const updateHelp = document.querySelector('.update-status details');
  if (updateHelp) updateHelp.innerHTML = '<summary>如何更新</summary><p>点击窗口上方的“同步云端”接收最新图鉴；想立即读取官方公告与 WIKI，可使用“检查最新资料”。更新完成后本窗口会自动刷新。</p><p>已有原图和图解可离线查看。云端每周三、周六北京时间 10:17 检查；查看进度和错误原因请点击“更新过程”。</p>';
  const bar = document.createElement('nav');
  bar.className = 'desktop-bar'; bar.setAttribute('aria-label', '软件操作');
  bar.innerHTML = `<div class="desktop-brand"><img src="desktop/icon.png" alt=""><span>碧蓝航线图鉴<small>桌面版 · 本地高清收藏</small></span></div>
    <div class="desktop-actions"><button id="desktop-sync" class="desktop-primary">↻ 同步云端</button><button id="desktop-check">检查最新资料</button><button id="desktop-details">更新过程</button><button id="desktop-settings" aria-label="软件设置">设置</button></div>`;
  document.body.prepend(bar);
  const status = document.createElement('div'); status.className = 'desktop-status';
  status.innerHTML = '<span class="desktop-dot"></span><span id="desktop-message" role="status" aria-live="polite">正在载入图鉴…</span><span class="desktop-schedule">云端每周三、周六 10:17 检查</span>';
  bar.after(status);
  const panel = document.createElement('dialog'); panel.className = 'desktop-dialog'; panel.id = 'desktop-log-dialog';
  panel.innerHTML = '<div class="desktop-dialog-heading"><h2>更新过程</h2><button data-close aria-label="关闭更新过程">关闭</button></div><p id="desktop-log-status"></p><pre id="desktop-log">尚未进行更新。</pre><p class="desktop-hint">同步云端：接收已发布的图鉴。检查最新资料：立即读取公告与 WIKI。完成后页面自动刷新。</p>';
  document.body.append(panel);
  const settings = document.createElement('dialog'); settings.className = 'desktop-dialog'; settings.id = 'desktop-settings-dialog';
  settings.innerHTML = '<div class="desktop-dialog-heading"><h2>软件设置</h2><button data-close aria-label="关闭软件设置">关闭</button></div><p>程序与图片保存在同一个项目文件夹中。搬迁时请移动整个文件夹。</p><p id="desktop-version" class="desktop-hint"></p><div class="desktop-setting-actions"><button id="desktop-folder">打开软件文件夹</button><button id="desktop-rollback">回退上次更新</button></div><p id="desktop-no-backup" class="desktop-hint" hidden>目前没有可回退的历史版本；下次成功更新会自动保存备份。</p>';
  document.body.append(settings);
  const confirm = document.createElement('dialog'); confirm.className = 'desktop-dialog'; confirm.id = 'desktop-confirm-dialog';
  confirm.innerHTML = '<h2>恢复上一版本？</h2><p>图鉴记录将恢复至上一次更新前；已下载的图片仍会保留。</p><div class="desktop-setting-actions"><button data-close>取消</button><button id="desktop-confirm-rollback">确认回退</button></div>';
  document.body.append(confirm);
  for (const dialog of [panel, settings, confirm]) dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  const message = document.querySelector('#desktop-message');
  const log = document.querySelector('#desktop-log');
  let running = false, hasRollback = false;
  function render(job) {
    running = job.phase === 'running';
    status.dataset.phase = job.phase;
    message.textContent = job.message;
    document.querySelector('#desktop-log-status').textContent = job.message;
    log.textContent = job.lines?.join('\n') || '尚未进行更新。';
    log.scrollTop = log.scrollHeight;
    for (const id of ['desktop-sync', 'desktop-check', 'desktop-confirm-rollback']) document.getElementById(id).disabled = running;
    document.querySelector('#desktop-rollback').disabled = running || !hasRollback;
  }
  async function start(operation) {
    if (running) return;
    try { await api.start(operation); } catch (error) { render({ phase: 'error', message: error.message, lines: [error.message] }); }
  }
  document.querySelector('#desktop-sync').addEventListener('click', () => start('sync'));
  document.querySelector('#desktop-check').addEventListener('click', () => start('check'));
  document.querySelector('#desktop-details').addEventListener('click', () => panel.showModal());
  document.querySelector('#desktop-settings').addEventListener('click', () => settings.showModal());
  document.querySelector('#desktop-folder').addEventListener('click', () => api.openFolder());
  document.querySelector('#desktop-rollback').addEventListener('click', () => { settings.close(); confirm.showModal(); });
  document.querySelector('#desktop-confirm-rollback').addEventListener('click', () => { confirm.close(); start('rollback'); });
  api.onProgress(render);
  api.state().then(state => {
    hasRollback = state.hasRollback;
    document.querySelector('#desktop-no-backup').hidden = hasRollback;
    document.querySelector('#desktop-version').textContent = `桌面版 1.1.0 · ${state.total} 款皮肤 · 资料更新至 ${state.updatedTo}`;
    render(state.job);
    document.documentElement.dataset.desktopReady = 'true';
  }).catch(error => render({ phase: 'error', message: error.message, lines: [] }));
})();
