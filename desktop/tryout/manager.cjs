const { WebContentsView, ipcMain, shell } = require('electron');
const path = require('node:path');
const { samplesFrom, modelUrl } = require('./samples.cjs');
const { NotesStore } = require('./notes.cjs');
const { ModelView } = require('./model-view.cjs');
const pageUrl = 'l2d://gallery/desktop/tryout/index.html';
// The tryout lives inside the gallery window: its page is a view laid over the gallery page,
// and the online model is a second view on top of that. "返回图鉴" only hides both, so the
// model stays loaded and coming back is instant.
class TryoutManager {
  constructor({
    libraryRoot,
    parent,
    catalog,
    testing = false,
    testRound = '1',
    batch = false,
    gallery = false,
    favorites = null,
    onState = null,
    onFavorites = null
  }) {
    this.libraryRoot = libraryRoot;
    this.window = parent;
    this.shell = null;
    this.active = false;
    this.testing = testing;
    this.testRound = testRound;
    this.batch = batch;
    this.gallery = gallery;
    this.favorites = favorites;
    this.onState = onState;
    this.onFavorites = onFavorites;
    this.formIndex = 0;
    this.refreshCatalog(catalog);
    this.testScope = this.release?.scope || 'sample';
    this.reportScope = this.release?.scope || 'two-skin-sample';
    const notesFolder = path.join(
      libraryRoot,
      testing
        ? `.desktop-data/${this.testScope}-self-test/round-${testRound}/notes`
        : batch
          ? `.desktop-data/${this.testScope}/tryout-notes`
          : '.desktop-data/tryout-notes'
    );
    if (batch && !testing)
      this.notesInheritance = require('./inherit-notes.cjs').inheritNotes(
        path.join(libraryRoot, '.desktop-data', this.release.previousNotes),
        notesFolder,
        this.samples.map(s => s.id)
      );
    this.notes = new NotesStore(
      notesFolder,
      this.samples.map(s => s.id)
    );
    this.selected = this.samples[0];
    this.window.on('resize', () => this.layout());
    this.register();
  }
  refreshCatalog(catalog) {
    const number = this.batch === true ? 1 : this.batch,
      batch = require('./batch.cjs');
    // The full release also opens skins this computer verified after the build (auto-verify.cjs).
    const extraRecords =
      number >= batch.fullRelease && !this.testing
        ? require('./auto-verify.cjs').loadStore(this.libraryRoot).records
        : [];
    const data = this.batch ? batch.batchFrom(catalog, number, { extraRecords }) : { samples: samplesFrom(catalog) };
    this.samples = data.samples;
    this.availability = data.availability || this.samples.map(s => ({ ...s, status: 'playable' }));
    this.auditedAt = data.auditedAt;
    this.release = data.release;
    if (this.selected) this.selected = this.samples.find(s => s.id === this.selected.id) || this.samples[0];
  }
  requireSample(id) {
    const sample = this.samples.find(s => s.id === id);
    if (!sample) throw new Error('这款皮肤尚未在本批开放试玩');
    return sample;
  }
  // The model view guards navigation by the sample it was opened with, so each form is
  // opened as the same skin with that form's online ID and page.
  current() {
    const form = this.selected.forms?.[this.formIndex];
    return form
      ? {
          ...this.selected,
          onlineId: form.onlineId,
          url: modelUrl(form.onlineId),
          form: { ...form, index: this.formIndex }
        }
      : this.selected;
  }
  authorize(event) {
    const contents = this.shell?.webContents;
    if (
      !contents ||
      contents.isDestroyed() ||
      event.sender !== contents ||
      event.senderFrame !== contents.mainFrame ||
      event.senderFrame.url !== pageUrl
    )
      throw new Error('无效试玩操作来源');
  }
  send(channel, value) {
    const contents = this.shell?.webContents;
    if (contents && !contents.isDestroyed()) contents.send(channel, value);
  }
  // What the gallery page shows: whether the tryout is in front, and which skin is kept loaded.
  state() {
    return this.shell
      ? { open: this.active, id: this.selected.id, character: this.selected.character, name: this.selected.name }
      : { open: false, id: null };
  }
  publishState() {
    this.onState?.(this.state());
  }
  favoritesChanged(ids) {
    this.send('tryout:favorites', ids);
  }
  register() {
    const handle = (name, fn) =>
      ipcMain.handle(`tryout:${name}`, (event, ...args) => {
        this.authorize(event);
        return fn(...args);
      });
    handle('init', () => ({
      samples: this.samples,
      availability: this.availability,
      auditedAt: this.auditedAt,
      batch: this.batch,
      gallery: this.gallery,
      releaseLabel: this.release?.label,
      selectedId: this.selected.id,
      state: this.model.state,
      notes: this.notes.get(this.selected.id),
      favorites: this.favorites ? this.favorites.list() : null
    }));
    handle('select', async id => {
      this.selected = this.requireSample(id);
      this.formIndex = 0;
      const notes = this.notes.get(id);
      this.publishState();
      await this.model.open(this.current());
      return { sample: this.selected, formIndex: 0, notes };
    });
    handle('form', async index => {
      if (!Number.isInteger(index) || !this.selected.forms?.[index]) throw new Error('这款皮肤没有该形态');
      if (index === this.formIndex && this.model.state.phase !== 'error') return { formIndex: index };
      this.formIndex = index;
      await this.model.open(this.current());
      return { formIndex: index };
    });
    handle('retry', () => this.model.open(this.current()));
    handle('mute', value => {
      if (typeof value !== 'boolean') throw new Error('静音参数无效');
      this.model.setMuted(value);
    });
    handle('occlude', value => {
      if (typeof value !== 'boolean') throw new Error('窗口状态无效');
      this.model.setOccluded(value);
    });
    handle('bounds', bounds => this.model.setBounds(bounds));
    handle('panel', value => {
      if (typeof value !== 'boolean') throw new Error('动作栏参数无效');
      return this.model.setPanelHidden(value);
    });
    handle('notes', (id, revision, operation, value) => {
      this.requireSample(id);
      return this.notes.update(id, revision, operation, value);
    });
    handle('favorite-set', (id, on) => {
      if (!this.favorites) throw new Error('此版本没有收藏');
      const ids = this.favorites.set(id, on);
      this.onFavorites?.(ids);
      return ids;
    });
    handle('browser', () => shell.openExternal(this.current().url));
    handle('search', () =>
      shell.openExternal(
        `https://search.bilibili.com/all?keyword=${encodeURIComponent(`碧蓝航线 ${this.selected.character} ${this.selected.name} L2D 互动 玩法`)}`
      )
    );
    // "返回图鉴": hide, keep the model loaded.
    handle('close', () => this.hide());
  }
  layout() {
    if (!this.shell || this.window.isDestroyed()) return;
    const [width, height] = this.window.getContentSize();
    this.shell.setBounds({ x: 0, y: 0, width, height });
  }
  show() {
    if (!this.shell) return;
    this.active = true;
    this.layout();
    this.shell.setVisible(true);
    this.model.setSuspended(false);
    this.shell.webContents.focus();
    this.send('tryout:shown', true);
    this.publishState();
  }
  hide() {
    if (!this.shell || !this.active) return;
    this.active = false;
    this.model.setSuspended(true);
    this.shell.setVisible(false);
    if (!this.window.isDestroyed()) this.window.webContents.focus();
    this.publishState();
  }
  async open(id = this.selected.id) {
    this.requireSample(id);
    if (this.shell) {
      this.show();
      this.send('tryout:select-request', id);
      return;
    }
    this.selected = this.requireSample(id);
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false
      }
    });
    const contents = view.webContents;
    this.shell = view;
    view.setBackgroundColor('#080d17');
    this.model = new ModelView(this.window, {
      diagnosticDir: path.join(
        this.libraryRoot,
        `verification/${this.reportScope}/` + (this.testing ? `round-${this.testRound}` : 'user-load')
      ),
      partition: this.testing
        ? `persist:l2d-${this.testScope}-test-${this.testRound}`
        : this.batch
          ? `persist:l2d-${this.testScope}-online`
          : 'persist:l2d-sample-online-v1'
    });
    this.model.on('state', state => this.send('tryout:state', state));
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (url !== pageUrl) event.preventDefault();
    });
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.on('render-process-gone', () => this.dispose());
    // The local page may request its model before loadURL resolves. Attach and show the
    // page first, so a newly attached model view sits above it and is visible from its first frame.
    this.window.contentView.addChildView(view);
    this.active = true;
    this.layout();
    contents.focus();
    this.publishState();
    await contents.loadURL(pageUrl);
  }
  // Removes the tryout completely (window closing, or its page crashed).
  async dispose() {
    const view = this.shell;
    if (!view) return;
    this.shell = null;
    this.active = false;
    await this.model?.stop().catch(() => {});
    if (!this.window.isDestroyed()) {
      this.window.contentView.removeChildView(view);
      this.publishState();
    }
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
  }
  // Kept for callers that used to close the separate tryout window.
  async close() {
    this.hide();
  }
}
module.exports = { TryoutManager, pageUrl };
