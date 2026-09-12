const { app, BrowserWindow, Menu, protocol, net, ipcMain, shell, dialog, utilityProcess, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { externalUrl, localResource } = require('./policy.cjs');
const argument = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const appRoot = path.resolve(__dirname, '..');
const libraryRoot = path.resolve(argument('--library-root') || (app.isPackaged ? path.join(path.dirname(process.execPath), '..') : appRoot));
const selfTest = process.argv.includes('--self-test');
const profile = path.join(libraryRoot, selfTest ? '.desktop-data/self-test' : '.desktop-data');
fs.mkdirSync(profile, { recursive: true });
app.setName('碧蓝航线图鉴');
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.setAppUserModelId('gouluanjiang.azurlane.l2d.gallery');
protocol.registerSchemesAsPrivileged([{ scheme: 'l2d', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let window, worker, quitting = false;
let job = { phase: 'idle', message: '已有图片可离线查看', lines: [] };
const readJson = relative => JSON.parse(fs.readFileSync(path.join(libraryRoot, relative), 'utf8').replace(/^\uFEFF/, ''));
function currentState() {
  const catalog = readJson('data/catalog.json');
  return { job, total: catalog.skins.length, version: catalog.version, updatedTo: catalog.updatedTo, checkedAt: catalog.checkedAt, hasRollback: fs.existsSync(path.join(libraryRoot, '.l2d-update/last-success.json')) };
}
function notify() { if (window && !window.isDestroyed()) window.webContents.send('l2d:progress', job); }
function authorized(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== 'l2d://gallery/index.html') throw new Error('无效操作来源');
}
function startUpdate(operation) {
  if (!['sync', 'check', 'rollback'].includes(operation)) throw new Error('未知操作');
  if (worker) return { started: false, busy: true };
  const script = operation === 'check' ? 'check-updates.mjs' : 'sync.mjs';
  const args = operation === 'check' ? ['--apply-local'] : operation === 'rollback' ? ['--rollback'] : ['--public'];
  job = { phase: 'running', operation, message: operation === 'check' ? '正在检查官方公告与原图…' : operation === 'rollback' ? '正在恢复上一版本…' : '正在同步云端已发布的图鉴…', lines: [], startedAt: new Date().toISOString() };
  notify();
  const env = { ...process.env, L2D_DATA_ROOT: libraryRoot };
  delete env.ELECTRON_RUN_AS_NODE;
  worker = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [script, ...args], { cwd: libraryRoot, env, stdio: 'pipe', serviceName: '图鉴更新' });
  let output = '';
  const receive = bytes => {
    output = (output + bytes.toString('utf8')).slice(-24000);
    job.lines = output.split(/\r?\n/).filter(Boolean).slice(-70);
    notify();
  };
  worker.stdout?.setEncoding('utf8'); worker.stderr?.setEncoding('utf8');
  worker.stdout?.on('data', receive);
  worker.stderr?.on('data', receive);
  worker.once('exit', code => {
    worker = null;
    try { if (code === 0) {
      const result = readJson(operation === 'check' ? 'data/update-report.json' : 'data/sync-status.json');
      const total = currentState().total;
      const added = result.added ?? result.newCount ?? 0;
      job = { ...job, phase: 'success', result, message: operation === 'rollback' ? `已恢复上一版本，共 ${total} 款` : added ? `更新完成，新增 ${added} 款，当前共 ${total} 款` : `已是最新图鉴，共 ${total} 款`, finishedAt: new Date().toISOString() };
      notify();
      if (window && !window.isDestroyed()) window.webContents.reload();
    } else {
      job = { ...job, phase: 'error', message: '更新未完成，现有图鉴已保留。可重试或查看过程。', finishedAt: new Date().toISOString() };
      notify();
    } } catch (error) { job = { ...job, phase:'error', message:`读取更新结果失败：${error.message}` }; notify(); }
  });
  return { started: true };
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    if (!fs.existsSync(path.join(libraryRoot, 'data/catalog.json')) || !fs.existsSync(path.join(libraryRoot, 'assets/skins'))) throw new Error('未找到图鉴资料。请保留软件所在的完整文件夹。');
    // Recover a previously interrupted transaction before the offline mirror loads.
    const { recoverInterrupted, acquireLock } = await import(pathToFileURL(path.join(appRoot, 'scripts/lib/sync-engine.mjs')).href);
    const release = acquireLock(libraryRoot);
    try { recoverInterrupted(libraryRoot); } finally { release(); }
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => permission === 'clipboard-sanitized-write' && origin.startsWith('l2d://gallery'));
    protocol.handle('l2d', async request => {
      try {
        const file = localResource(request.url, libraryRoot, appRoot);
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'");
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response('文件不存在', { status: 404 }); }
    });
    window = new BrowserWindow({ title: '碧蓝航线图鉴', width: 1380, height: 940, minWidth: 880, minHeight: 620, backgroundColor: '#07111f', show: false, autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
    const errors = [];
    window.webContents.on('console-message', (_e, details) => { if (details.level === 'error') errors.push(details.message); });
    window.webContents.setWindowOpenHandler(({ url }) => { try { shell.openExternal(externalUrl(url)); } catch {} return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { if (url !== 'l2d://gallery/index.html') { event.preventDefault(); try { shell.openExternal(externalUrl(url)); } catch {} } });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.once('ready-to-show', () => { if (!selfTest) window.show(); });
    window.on('close', event => {
      if (worker && !quitting) { event.preventDefault(); dialog.showMessageBox(window, { type: 'info', title: '正在更新图鉴', message: '更新仍在进行，完成后即可关闭软件。', buttons: ['继续等待'] }); }
    });
    ipcMain.handle('l2d:state', event => { authorized(event); return currentState(); });
    ipcMain.handle('l2d:start', (event, operation) => { authorized(event); return startUpdate(operation); });
    ipcMain.handle('l2d:folder', event => { authorized(event); return shell.openPath(libraryRoot); });
    await window.loadURL('l2d://gallery/index.html');
    if (selfTest) {
      const { run } = require('./self-test.cjs');
      await run({ window, libraryRoot, appRoot, errors, currentState, startUpdate, liveSync: process.argv.includes('--live-sync') });
      quitting = true; app.quit();
    }
  }).catch(error => {
    if (selfTest) { fs.mkdirSync(path.join(libraryRoot, 'verification'), { recursive: true }); fs.writeFileSync(path.join(libraryRoot, 'verification/desktop-failure.json'), JSON.stringify({ error: error.stack }, null, 2)); }
    else dialog.showErrorBox('图鉴启动失败', error.message);
    quitting = true; if (worker) worker.kill(); app.exit(1);
  });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; if (worker) worker.kill(); });
