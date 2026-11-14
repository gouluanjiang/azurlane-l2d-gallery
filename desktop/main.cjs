const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
  ipcMain,
  shell,
  dialog,
  utilityProcess,
  session
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { externalUrl, localResource } = require('./policy.cjs');
const argument = name => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const appRoot = path.resolve(__dirname, '..');
// galleryTryout: the official gallery itself carries the tryout for that release
// (keeps the gallery's own name, profile and window), instead of a separate batch app.
const galleryTryout = require('../package.json').galleryTryout || 0;
const sampleBuild = require('../package.json').sampleBuild === true || galleryTryout > 0;
const batchBuild = require('../package.json').batchBuild || galleryTryout || 0;
const release = batchBuild ? require('./tryout/batch.cjs').releaseFrom(batchBuild) : null;
const testScope = release?.scope || 'sample';
const reportScope = release?.scope || 'two-skin-sample';
const libraryRoot = path.resolve(
  argument('--library-root') || (app.isPackaged ? path.join(path.dirname(process.execPath), '..') : appRoot)
);
const sampleTest = sampleBuild && process.argv.includes('--sample-self-test');
const testRound = String(argument('--test-round') || '1');
if (!/^[1-9][0-9]?$/.test(testRound)) throw new Error('无效测试轮次');
const selfTest = process.argv.includes('--self-test');
const profile = path.join(
  libraryRoot,
  sampleTest
    ? `.desktop-data/${testScope}-self-test/round-${testRound}/profile`
    : selfTest
      ? '.desktop-data/self-test'
      : galleryTryout
        ? '.desktop-data'
        : batchBuild
          ? `.desktop-data/${testScope}/profile`
          : sampleBuild
            ? '.desktop-data/sample-profile'
            : '.desktop-data'
);
fs.mkdirSync(profile, { recursive: true });
app.setName(
  galleryTryout
    ? '碧蓝航线图鉴'
    : batchBuild
      ? `碧蓝航线试玩台 · ${release.label}`
      : sampleBuild
        ? '碧蓝航线试玩样例'
        : '碧蓝航线图鉴'
);
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.setAppUserModelId('gouluanjiang.azurlane.l2d.gallery');
// Windows occlusion tracking marks a covered window hidden; the online model then lays out
// with a zero-height canvas and never reports ready. Keep rendering while covered.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
protocol.registerSchemesAsPrivileged([
  { scheme: 'l2d', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);
let window,
  worker,
  quitting = false;
let tryout;
let job = { phase: 'idle', message: '已有图片可离线查看', lines: [] };
const readJson = relative =>
  JSON.parse(fs.readFileSync(path.join(libraryRoot, relative), 'utf8').replace(/^\uFEFF/, ''));
function currentState() {
  const catalog = readJson('data/catalog.json');
  return {
    job,
    appVersion: app.getVersion(),
    total: catalog.skins.length,
    version: catalog.version,
    updatedTo: catalog.updatedTo,
    checkedAt: catalog.checkedAt,
    hasRollback: fs.existsSync(path.join(libraryRoot, '.l2d-update/last-success.json'))
  };
}
function notify() {
  if (window && !window.isDestroyed()) window.webContents.send('l2d:progress', job);
}
function authorized(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url !== 'l2d://gallery/index.html'
  )
    throw new Error('无效操作来源');
}
// Per-computer preferences for automatic updates (shown in 设置).
const settingsFile = () => path.join(libraryRoot, '.desktop-data/auto-update.json');
function readSettings() {
  let value = {};
  try {
    value = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    /* defaults below */
  }
  return {
    autoSync: value.autoSync !== false,
    autoTryout: value.autoTryout !== false,
    lastAutoSync: value.lastAutoSync || null,
    lastAutoTryout: value.lastAutoTryout || null
  };
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch },
    file = settingsFile(),
    temp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(temp, file);
  return next;
}
let finishedUpdate = null;
function startUpdate(operation, { auto = false } = {}) {
  if (!['sync', 'check', 'rollback'].includes(operation)) throw new Error('未知操作');
  if (worker) return { started: false, busy: true };
  const done = new Promise(resolve => {
    finishedUpdate = resolve;
  });
  const script = operation === 'check' ? 'check-updates.mjs' : 'sync.mjs';
  const args = operation === 'check' ? ['--apply-local'] : operation === 'rollback' ? ['--rollback'] : ['--public'];
  job = {
    phase: 'running',
    operation,
    auto,
    message:
      operation === 'check'
        ? '正在检查官方公告与原图…'
        : operation === 'rollback'
          ? '正在恢复上一版本…'
          : auto
            ? '正在自动检查更新…'
            : '正在检查更新…',
    lines: [],
    startedAt: new Date().toISOString()
  };
  notify();
  const env = { ...process.env, L2D_DATA_ROOT: libraryRoot };
  delete env.ELECTRON_RUN_AS_NODE;
  worker = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [script, ...args], {
    cwd: libraryRoot,
    env,
    stdio: 'pipe',
    serviceName: '图鉴更新'
  });
  let output = '';
  const receive = bytes => {
    output = (output + bytes.toString('utf8')).slice(-24000);
    job.lines = output.split(/\r?\n/).filter(Boolean).slice(-70);
    notify();
  };
  worker.stdout?.setEncoding('utf8');
  worker.stderr?.setEncoding('utf8');
  worker.stdout?.on('data', receive);
  worker.stderr?.on('data', receive);
  worker.once('exit', code => {
    worker = null;
    try {
      if (code === 0) {
        const result = readJson(operation === 'check' ? 'data/update-report.json' : 'data/sync-status.json');
        const total = currentState().total;
        const added = result.added ?? result.newCount ?? 0,
          repaired = result.repaired ?? 0;
        job = {
          ...job,
          phase: 'success',
          result,
          message:
            operation === 'rollback'
              ? `已恢复上一版本，共 ${total} 款`
              : added
                ? `${auto ? '已自动更新' : '更新完成'}，新增 ${added} 款，当前共 ${total} 款`
                : repaired
                  ? `已补齐 ${repaired} 张本地图像，共 ${total} 款`
                  : `${auto ? '已自动检查，' : ''}已是最新图鉴，共 ${total} 款`,
          finishedAt: new Date().toISOString()
        };
        notify();
        // An automatic check reloads the page only when something changed (see autoUpdate).
        if (!auto && window && !window.isDestroyed()) window.webContents.reload();
        finishedUpdate?.({ ok: true, added, repaired });
      } else {
        job = {
          ...job,
          phase: 'error',
          message: auto
            ? '自动检查未完成，现有图鉴已保留；点这里查看原因，可稍后点“检查更新”。'
            : '更新未完成，现有图鉴已保留。可重试或查看过程。',
          finishedAt: new Date().toISOString()
        };
        let repaired = 0;
        try {
          if (operation === 'sync') repaired = readJson('data/sync-status.json').repaired ?? 0;
        } catch {
          /* no status written */
        }
        notify();
        if (!auto && repaired && window && !window.isDestroyed()) window.webContents.reload();
        finishedUpdate?.({ ok: false, added: 0, repaired });
      }
    } catch (error) {
      job = { ...job, phase: 'error', message: `读取更新结果失败：${error.message}` };
      notify();
      finishedUpdate?.({ ok: false, added: 0 });
    }
  });
  return { started: true, done };
}

// Runs once after start: sync the published catalog (at most every 12 h), then let the
// tryout look up skins that are still in review. Reloads the page only when something changed.
async function autoUpdate() {
  const settings = readSettings(),
    now = Date.now();
  let added = 0,
    repaired = 0,
    opened = 0;
  if (settings.autoSync && !(Date.parse(settings.lastAutoSync || '') > now - 12 * 3600000)) {
    const started = startUpdate('sync', { auto: true });
    if (started.started) {
      const result = await started.done;
      repaired = result.repaired ?? 0;
      if (result.ok) {
        writeSettings({ lastAutoSync: new Date().toISOString() });
        added = result.added;
      }
    }
  }
  if (settings.autoTryout && tryout && !worker) {
    const auto = require('./tryout/auto-verify.cjs');
    tryout.refreshCatalog(readJson('data/catalog.json'));
    const pending = auto.pendingSkins(readJson('data/catalog.json'), tryout.availability, auto.loadStore(libraryRoot));
    if (pending.length) {
      job = {
        phase: 'running',
        operation: 'tryout',
        auto: true,
        message: `正在为 ${pending.length} 款待核对皮肤查找试玩模型…`,
        lines: []
      };
      notify();
      try {
        const result = await new auto.AutoVerifier({ libraryRoot }).verify(pending, {
          progress: line => {
            job.lines = [...job.lines, line].slice(-70);
            job.message = line;
            notify();
          }
        });
        opened = result.opened.length;
        job = {
          ...job,
          phase: 'success',
          message: opened
            ? `试玩台已自动开放 ${opened} 款新皮肤${result.unresolved.length ? `，${result.unresolved.length} 款仍待核对` : ''}`
            : `${result.unresolved.length} 款新皮肤暂未找到试玩模型，之后会再试`,
          lines: [...job.lines, ...result.unresolved.map(s => `待核对：${s.character}「${s.name}」 ${s.reason}`)]
        };
      } catch (error) {
        job = { ...job, phase: 'error', message: `试玩模型自动核对未完成：${error.message}` };
      }
      notify();
      writeSettings({ lastAutoTryout: new Date().toISOString() });
      tryout.refreshCatalog(readJson('data/catalog.json'));
    }
  }
  if ((added || repaired || opened) && window && !window.isDestroyed()) {
    const message = job;
    window.webContents.once('did-finish-load', () => {
      job = message;
      notify();
    });
    window.webContents.reload();
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      // Window titles may be Chinese; HTTP headers must remain ASCII. Electron's
      // protocol.handle builds Web Headers and rejects a non-ByteString UA before
      // our handler runs (ERR_UNEXPECTED for every local subresource).
      app.userAgentFallback = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AzurLaneL2DGallery/${app.getVersion()} Chrome/${process.versions.chrome} Electron/${process.versions.electron} Safari/537.36`;
      if (
        !fs.existsSync(path.join(libraryRoot, 'data/catalog.json')) ||
        !fs.existsSync(path.join(libraryRoot, 'assets/skins'))
      )
        throw new Error('未找到图鉴资料。请保留软件所在的完整文件夹。');
      // Recover a previously interrupted transaction before the offline mirror loads.
      const { recoverInterrupted, acquireLock } = await import(
        pathToFileURL(path.join(appRoot, 'scripts/lib/sync-engine.mjs')).href
      );
      const release = acquireLock(libraryRoot);
      try {
        recoverInterrupted(libraryRoot);
      } finally {
        release();
      }
      Menu.setApplicationMenu(null);
      if (sampleTest) {
        const log = path.join(libraryRoot, `verification/${reportScope}/round-${testRound}/network-diagnostic.jsonl`);
        fs.mkdirSync(path.dirname(log), { recursive: true });
        session.defaultSession.webRequest.onErrorOccurred(d =>
          fs.appendFileSync(log, JSON.stringify({ url: d.url, error: d.error, type: d.resourceType }) + '\n')
        );
      }
      session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
        callback(permission === 'clipboard-sanitized-write')
      );
      session.defaultSession.setPermissionCheckHandler(
        (_wc, permission, origin) => permission === 'clipboard-sanitized-write' && origin.startsWith('l2d://gallery')
      );
      protocol.handle('l2d', async request => {
        try {
          const file = localResource(request.url, libraryRoot, appRoot);
          const response = await net.fetch(pathToFileURL(file).href);
          const headers = new Headers(response.headers);
          if (sampleTest && file.endsWith('.js')) {
            const log = path.join(libraryRoot, `verification/${reportScope}/round-${testRound}/resource-types.jsonl`);
            fs.mkdirSync(path.dirname(log), { recursive: true });
            fs.appendFileSync(
              log,
              JSON.stringify({ url: request.url, status: response.status, headers: Object.fromEntries(headers) }) + '\n'
            );
          }
          headers.set('Cache-Control', 'no-store');
          headers.set(
            'Content-Security-Policy',
            "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'"
          );
          return new Response(response.body, { status: response.status, headers });
        } catch (error) {
          if (sampleTest) errors.push(`本地资源 ${request.url}: ${error.message}`);
          return new Response('文件不存在', { status: 404 });
        }
      });
      window = new BrowserWindow({
        title: '碧蓝航线图鉴',
        width: 1380,
        height: 940,
        minWidth: 880,
        minHeight: 620,
        backgroundColor: '#07111f',
        show: false,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          spellcheck: false
        }
      });
      const errors = [];
      window.webContents.on('console-message', (details, level, message) => {
        if (details.level === 'error' || level === 3) errors.push(details.message || message);
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        try {
          shell.openExternal(externalUrl(url));
        } catch {}
        return { action: 'deny' };
      });
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== 'l2d://gallery/index.html') {
          event.preventDefault();
          try {
            shell.openExternal(externalUrl(url));
          } catch {}
        }
      });
      window.webContents.on('will-attach-webview', event => event.preventDefault());
      window.once('ready-to-show', () => {
        if (!selfTest && !sampleTest) window.show();
      });
      window.on('close', event => {
        if (worker && !quitting) {
          event.preventDefault();
          dialog.showMessageBox(window, {
            type: 'info',
            title: '正在更新图鉴',
            message: '更新仍在进行，完成后即可关闭软件。',
            buttons: ['继续等待']
          });
        } else if (tryout?.window && !quitting) {
          event.preventDefault();
          tryout.close().then(() => {
            if (!window.isDestroyed()) window.close();
          });
        }
      });
      ipcMain.handle('l2d:state', event => {
        authorized(event);
        return currentState();
      });
      ipcMain.handle('l2d:start', (event, operation) => {
        authorized(event);
        const { started, busy } = startUpdate(operation);
        return { started, busy };
      });
      ipcMain.handle('l2d:settings', event => {
        authorized(event);
        return readSettings();
      });
      ipcMain.handle('l2d:settings-set', (event, patch) => {
        authorized(event);
        const allowed = {};
        for (const key of ['autoSync', 'autoTryout']) if (typeof patch?.[key] === 'boolean') allowed[key] = patch[key];
        return writeSettings(allowed);
      });
      ipcMain.handle('l2d:folder', event => {
        authorized(event);
        return shell.openPath(libraryRoot);
      });
      if (sampleBuild) {
        const { TryoutManager } = require('./tryout/manager.cjs');
        tryout = new TryoutManager({
          libraryRoot,
          parent: window,
          catalog: readJson('data/catalog.json'),
          testing: sampleTest,
          testRound,
          batch: batchBuild,
          gallery: galleryTryout > 0
        });
      }
      ipcMain.handle('l2d:samples', event => {
        authorized(event);
        tryout?.refreshCatalog(readJson('data/catalog.json'));
        return tryout?.samples || [];
      });
      ipcMain.handle('l2d:availability', event => {
        authorized(event);
        tryout?.refreshCatalog(readJson('data/catalog.json'));
        return tryout?.availability || [];
      });
      ipcMain.handle('l2d:sample', (event, id) => {
        authorized(event);
        if (!tryout) throw new Error('此入口仅在样例版开放');
        return tryout.open(id);
      });
      await window.loadURL('l2d://gallery/index.html');
      // The official gallery updates itself a few seconds after start; batch apps and test runs do not.
      if (!selfTest && !sampleTest && (galleryTryout || !batchBuild))
        setTimeout(
          () =>
            autoUpdate().catch(error => {
              job = { ...job, phase: 'error', message: `自动更新未完成：${error.message}` };
              notify();
            }),
          5000
        );
      if (sampleBuild && process.argv.includes('--open-sample') && !sampleTest) await tryout.open();
      if (sampleTest) {
        const { run } = require('./tryout/batch-self-test.cjs');
        await run({ window, tryout, libraryRoot, testRound, errors });
        quitting = true;
        await tryout.model?.stop();
        tryout.allowClose = true;
        tryout.window?.destroy();
        app.quit();
      }
      if (selfTest) {
        const { run } = require('./self-test.cjs');
        await run({
          window,
          libraryRoot,
          appRoot,
          errors,
          currentState,
          startUpdate,
          liveSync: process.argv.includes('--live-sync')
        });
        quitting = true;
        app.quit();
      }
    })
    .catch(error => {
      if (selfTest || sampleTest) {
        const failurePath = path.join(
          libraryRoot,
          sampleTest
            ? `verification/${reportScope}/round-${testRound}/failure.json`
            : 'verification/desktop-failure.json'
        );
        fs.mkdirSync(path.dirname(failurePath), { recursive: true });
        fs.writeFileSync(failurePath, JSON.stringify({ error: error.stack }, null, 2));
      } else dialog.showErrorBox('图鉴启动失败', error.message);
      quitting = true;
      if (worker) worker.kill();
      app.exit(1);
    });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  quitting = true;
  if (worker) worker.kill();
});
