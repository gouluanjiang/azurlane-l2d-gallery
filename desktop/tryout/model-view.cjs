const { WebContentsView, session } = require('electron');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { inspectScript, modelIsReady } = require('./readiness.cjs');
const { allowedModelUrl, alternateModelUrl } = require('./samples.cjs');

const embeddedStyle = `
  .app-shell { --selection-panel-width: 238px !important; }
  .brand, .selection-panel-content, .skip-link { display: none !important; }
  .sidebar { width: 238px !important; position: absolute !important; left: 0 !important; top: 0 !important; bottom: auto !important; height: calc(100vh - 16px) !important; margin: 8px !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }
  .sidebar-body { min-height: 0 !important; flex: 1 !important; }
  .sidebar-panel-host { top: 0 !important; bottom: 0 !important; position: absolute !important; margin: 0 !important; display: flex !important; }
  .model-panel { font-size: 15px !important; padding: 10px !important; }
  .model-collapsible-trigger, .model-action-button { font-size: 15px !important; }
  .model-panel .model-collapsible { flex: none !important; }
  .model-panel .model-collapsible-content.open { max-height: none !important; }
  .model-panel { display: block !important; overflow: auto !important; }
  .share-skin-button, .favorite-skin-button { display: none !important; }
  /* 2026-11 site layout: a shared header (game switcher) now overlays the compact
     sidebar, so a click on the "动作" tab landed on the switcher and left the skin. */
  .browser-shared-header { display: none !important; }
  .favorite-action-button, .model-floating-actions button[aria-label="分享当前皮肤"] { display: none !important; }
`;
// Hides the site's left column (actions / parameters / parts) and gives its width to the model.
const panelHiddenStyle = `
  .app-shell { --selection-panel-width: 0px !important; }
  .app-shell section.sidebar, .app-shell aside.sidebar, .browser-panel-frame { display: none !important; }
  .app-shell .model-workspace { left: 8px !important; }
  .browser-page-toolbar { left: 8px !important; }
`;
const shortUrl = value => { try { const u = new URL(value); return u.origin + u.pathname; } catch { return ''; } };

class ModelView extends EventEmitter {
  constructor(window, { diagnosticDir, partition = 'persist:l2d-sample-online-v1', timeoutMs = 90000, stallMs = 30000 } = {}) {
    super(); this.window = window; this.timeoutMs = timeoutMs; this.stallMs = stallMs; this.diagnosticDir = diagnosticDir;
    this.session = session.fromPartition(partition); this.generation = 0; this.muted = false; this.occluded = false; this.panelHidden = false; this.panelCssKey = null;
    this.bounds = {x: 20, y: 150, width: 800, height: 650}; this.retired = [];
    this.state = { phase: 'idle', message: '选择一款皮肤开始试玩', elapsedMs: 0, audible: false };
    this.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    this.session.setPermissionCheckHandler(() => false);
    this.session.on('will-download', event => event.preventDefault());
    this.session.webRequest.onErrorOccurred(details => {
      if (!this.attempt || !/^https:\/\/([^/]+\.)?l2d\.su\//.test(details.url)) return;
      this.attempt.networkErrors.push({ url: shortUrl(details.url), error: details.error, type: details.resourceType, atMs: this.elapsed() });
      this.attempt.networkErrors = this.attempt.networkErrors.slice(-30);
    });
  }
  elapsed() { return this.attempt ? Date.now() - this.attempt.started : 0; }
  publish(patch) { this.state = {...this.state, ...patch}; this.emit('state', this.state); }
  record() {
    if (!this.attempt || !this.diagnosticDir) return;
    fs.mkdirSync(this.diagnosticDir, {recursive:true});
    const report = {...this.attempt, state:this.state, webContentsId:this.contents?.id, electron:process.versions.electron, nativeVisibility:{parent:this.window.isVisible(),view:this.view?.getVisible(),occluded:this.occluded,bounds:this.bounds}};
    try { fs.writeFileSync(path.join(this.diagnosticDir, 'latest-load.json'), JSON.stringify(report, null, 2) + '\n'); } catch {}
  }
  setBounds(bounds) {
    const [width, height] = this.window.getContentSize();
    if (!bounds || !['x','y','width','height'].every(k => Number.isFinite(bounds[k]))) throw new Error('试玩区域尺寸无效');
    const x = Math.max(0, Math.min(width - 1, Math.round(bounds.x))), y = Math.max(0, Math.min(height - 1, Math.round(bounds.y)));
    this.bounds = { x, y, width: Math.max(1, Math.min(width - x, Math.round(bounds.width))), height: Math.max(1, Math.min(height - y, Math.round(bounds.height))) };
    this.view?.setBounds(this.bounds);
  }
  async setPanelHidden(value) { this.panelHidden = Boolean(value); await this.applyPanel(this.contents); }
  async applyPanel(wc) {
    if (!wc || wc.isDestroyed()) return;
    if (this.panelCssKey) { const key = this.panelCssKey; this.panelCssKey = null; await wc.removeInsertedCSS(key).catch(() => {}); }
    if (this.panelHidden) this.panelCssKey = await wc.insertCSS(panelHiddenStyle).catch(() => null);
    wc.executeJavaScript('window.dispatchEvent(new Event("resize"))').catch(() => {});
  }
  setOccluded(value) { this.occluded = Boolean(value); this.updateVisibility(); }
  updateVisibility() { this.view?.setVisible(!this.occluded && !['idle','error'].includes(this.state.phase)); }
  setMuted(value) { this.muted = Boolean(value); if (this.contents && !this.contents.isDestroyed()) this.contents.setAudioMuted(this.muted); this.publish({muted:this.muted}); }
  async release() {
    clearTimeout(this.pollTimer); clearTimeout(this.deadlineTimer);
    const view = this.view, contents = this.contents;
    this.view = null; this.contents = null;
    if (!contents || contents.isDestroyed()) return;
    contents.setAudioMuted(true); contents.stop();
    this.window.contentView.removeChildView(view);
    const item = { id: contents.id, destroyed: false }; this.retired.push(item);
    await new Promise(resolve => { contents.once('destroyed', () => { item.destroyed = true; resolve(); }); contents.close({waitForBeforeUnload:false}); });
  }
  async open(sample) {
    const generation = ++this.generation;
    await this.release();
    if (generation !== this.generation || this.window.isDestroyed()) return;
    this.sample = sample;
    this.attempt = { sampleId: sample.id, onlineId: sample.onlineId, started: Date.now(), startedAt: new Date().toISOString(), generation, observations: [], networkErrors: [], consoleErrors: [] };
    this.publish({phase:'connecting',sampleId:sample.id,message:'正在连接在线模型…',elapsedMs:0,readyMs:null,audible:false,muted:this.muted,error:null});
    const view = new WebContentsView({webPreferences:{session:this.session,nodeIntegration:false,nodeIntegrationInSubFrames:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,spellcheck:false,backgroundThrottling:true}});
    const wc = view.webContents; this.view = view; this.contents = wc;
    // The remote viewer initializes from visibility/animation callbacks. Keeping
    // it hidden until ready creates a wait cycle: hidden -> never ready -> hidden.
    this.window.contentView.addChildView(view); view.setBounds(this.bounds); view.setVisible(!this.occluded);
    wc.setAudioMuted(this.muted);
    wc.setWindowOpenHandler(() => ({action:'deny'}));
    const current = () => generation === this.generation && wc === this.contents && !wc.isDestroyed();
    wc.on('will-attach-webview', event => event.preventDefault());
    for (const name of ['will-navigate','will-redirect']) wc.on(name, (event, url) => { if (!allowedModelUrl(url, sample)) event.preventDefault(); });
    wc.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame && current() && !allowedModelUrl(url,sample)) this.fail('页面切换到了其他皮肤，请重新载入当前样例。',`MODEL_CHANGED ${shortUrl(url)}`); });
    wc.on('console-message', details => { if (current() && details.level === 'error') { this.attempt.consoleErrors.push(details.message.slice(0,500)); this.attempt.consoleErrors = this.attempt.consoleErrors.slice(-15); } });
    wc.on('render-process-gone', (_event, details) => { if (current()) this.fail('模型画面已停止，可重新载入。', `RENDERER_${details.reason}`); });
    wc.on('did-fail-load', (_event, code, description, _url, mainFrame) => { if (current() && mainFrame && code !== -3) this.fail('在线页面未能打开，请检查网络后重试。',description); });
    wc.on('dom-ready', () => {
      if (!current() || this.state.phase === 'error') return;
      // Applying this after attachment avoids a hidden render surface during
      // WebContentsView construction on Windows.
      wc.setBackgroundThrottling(false);
      wc.insertCSS(embeddedStyle).catch(()=>{});
      this.panelCssKey = null; if (this.panelHidden) this.applyPanel(wc);
      this.publish({phase:'loading',message:'正在准备模型资源…',elapsedMs:this.elapsed()});
    });
    const armDeadline = () => { clearTimeout(this.deadlineTimer); this.deadlineTimer = setTimeout(() => { if (current() && this.state.phase !== 'ready') this.fail('等待模型超过 90 秒，请重试或在浏览器打开。','MODEL_TIMEOUT'); }, this.timeoutMs); };
    armDeadline();
    const poll = async () => {
      if (!current() || this.state.phase === 'error') return;
      let watchdog;
      try {
        const ui = await Promise.race([wc.executeJavaScript(inspectScript), new Promise((_,reject) => {watchdog=setTimeout(()=>reject(new Error('UI probe timeout')),2500);})]);
        if (!current() || this.state.phase === 'error') return;
        this.attempt.observations.push({ms:this.elapsed(),...ui}); this.attempt.observations = this.attempt.observations.slice(-40);
        if (ui.error) { this.fail('模型资源未能完整载入，请重试。',ui.error); return; }
        if (modelIsReady(ui,sample)) {
          if (!this.attempt.controlsPrepared) {
            await wc.executeJavaScript(`(()=>{document.querySelector('button[aria-label="关闭设置"]')?.click();const toggle=document.querySelector('.model-settings-inline');if(toggle&&toggle.getAttribute('aria-expanded')!=='true')toggle.click();})()`);
            if(!current())return;
            this.attempt.controlsPrepared=true;
            this.publish({phase:'loading',message:'正在准备操作面板…',elapsedMs:this.elapsed()});
            this.pollTimer=setTimeout(poll,400);return;
          }
          if (this.state.phase !== 'ready') {
            clearTimeout(this.deadlineTimer);
            this.attempt.readyMs=this.elapsed();
            this.publish({phase:'ready',message:'模型已就绪，可以开始试玩',elapsedMs:this.elapsed(),readyMs:this.elapsed()});
            this.updateVisibility();
            this.record(); this.emit('ready', {...this.attempt, ui});
          }
          const audible=wc.isCurrentlyAudible();
          if (audible !== this.state.audible) this.publish({audible});
        } else if (this.state.phase === 'ready') {
          // Keep manual static-art inspection usable; only an explicit site error,
          // crash or wrong-skin navigation terminates a running player.
        } else if (this.window.isMinimized() || !this.window.isVisible()) {
          // A minimized or hidden window stops the page from laying out the model. Pause the
          // stall check and the deadline until the window is back instead of failing.
          this.attempt.progressAt = this.elapsed(); this.attempt.pausedWhileHidden = (this.attempt.pausedWhileHidden || 0) + 1; armDeadline();
          this.publish({phase:'loading',message:'窗口已最小化，恢复后继续载入模型…',elapsedMs:this.elapsed()});
        } else {
          // The site sometimes stops mid-download (progress frozen) or leaves a blank page.
          // Reload (at most twice) when nothing visible has changed for stallMs, instead of waiting out the deadline.
          const progressKey = `${ui.mounted}|${ui.title}|${ui.loading}|${ui.progress}`;
          const retries = this.attempt.autoRetries || [];
          if (progressKey !== this.attempt.progressKey) { this.attempt.progressKey = progressKey; this.attempt.progressAt = this.elapsed(); }
          else if (retries.length < 2 && this.elapsed() - this.attempt.progressAt >= this.stallMs) {
            this.attempt.autoRetries = [...retries, { atMs: this.elapsed(), stalledOn: progressKey.slice(0, 200) }];
            this.attempt.autoRetry = this.attempt.autoRetries[0];
            this.attempt.progressKey = null; this.attempt.controlsPrepared = false;
            this.publish({phase:'connecting',message:'模型资源下载停滞，正在自动重新载入…',elapsedMs:this.elapsed()});
            armDeadline(); this.record();
            // After a site deploy a page (locally or at the CDN) can point at script files that no
            // longer exist ("Failed to load module script ... text/html"). Then, or on the second
            // retry, clear this session's cache and open the skin's other accepted address.
            const staleScripts = this.attempt.consoleErrors.some(text => /Failed to load module script/.test(text));
            if (retries.length || staleScripts) {
              this.attempt.cacheCleared = true; await this.session.clearCache().catch(() => {}); if (!current()) return;
              const alternate = alternateModelUrl(wc.getURL(), sample); this.attempt.autoRetries.at(-1).url = alternate;
              wc.loadURL(alternate).catch(() => {});
            } else wc.reloadIgnoringCache();
            this.pollTimer=setTimeout(poll,1000); return;
          }
          this.publish({phase:ui.mounted?'loading':'connecting',message:ui.loading|| (ui.mounted?'模型资源准备中…':'正在打开在线页面…'),elapsedMs:this.elapsed()});
          if (this.elapsed() % 4000 < 800) this.record();
        }
      } catch (error) { if (current()) this.attempt.probeError=error.message; }
      finally { clearTimeout(watchdog); }
      if (current() && this.state.phase !== 'error') this.pollTimer=setTimeout(poll,this.state.phase==='ready'?1000:500);
    };
    wc.loadURL(sample.url).catch(error => { if (current() && this.state.phase !== 'error') this.fail('连接中断，可重新载入模型。',error.code || error.message); });
    this.pollTimer=setTimeout(poll,400); this.record();
  }
  fail(message, code) {
    clearTimeout(this.pollTimer); clearTimeout(this.deadlineTimer);
    this.publish({phase:'error',message,error:String(code).slice(0,300),elapsedMs:this.elapsed(),audible:false});
    this.updateVisibility();
    if (this.contents && !this.contents.isDestroyed()) { this.contents.setAudioMuted(true); this.contents.stop(); }
    this.record(); this.emit('load-error',this.state);
    // Release a failed renderer immediately so it cannot keep using GPU/audio
    // resources while the local retry panel is displayed.
    this.release().catch(()=>{});
  }
  async stop() { ++this.generation; await this.release(); this.publish({phase:'idle',message:'试玩已关闭',audible:false}); }
}
module.exports = { ModelView, embeddedStyle };
