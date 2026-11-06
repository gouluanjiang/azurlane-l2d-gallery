const { BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { samplesFrom, modelUrl } = require('./samples.cjs');
const { NotesStore } = require('./notes.cjs');
const { ModelView } = require('./model-view.cjs');
const pageUrl = 'l2d://gallery/desktop/tryout/index.html';
class TryoutManager {
  constructor({ libraryRoot, parent, catalog, testing = false, testRound = '1', batch = false, gallery = false }) {
    this.libraryRoot=libraryRoot; this.parent=parent; this.testing=testing; this.testRound=testRound; this.batch=batch; this.gallery=gallery; this.formIndex=0;
    this.refreshCatalog(catalog);
    this.testScope=this.release?.scope||'sample';this.reportScope=this.release?.scope||'two-skin-sample';
    const notesFolder=path.join(libraryRoot,testing?`.desktop-data/${this.testScope}-self-test/round-${testRound}/notes`:batch?`.desktop-data/${this.testScope}/tryout-notes`:'.desktop-data/tryout-notes');
    if(batch&&!testing)this.notesInheritance=require('./inherit-notes.cjs').inheritNotes(path.join(libraryRoot,'.desktop-data',this.release.previousNotes),notesFolder,this.samples.map(s=>s.id));
    this.notes=new NotesStore(notesFolder,this.samples.map(s=>s.id));
    this.selected=this.samples[0]; this.register();
  }
  refreshCatalog(catalog) {
    const data=this.batch?require('./batch.cjs').batchFrom(catalog,this.batch===true?1:this.batch):{samples:samplesFrom(catalog)};
    this.samples=data.samples;this.availability=data.availability||this.samples.map(s=>({...s,status:'playable'}));this.auditedAt=data.auditedAt;
    this.release=data.release;
    if(this.selected)this.selected=this.samples.find(s=>s.id===this.selected.id)||this.samples[0];
  }
  requireSample(id) { const sample=this.samples.find(s=>s.id===id); if(!sample)throw new Error('这款皮肤尚未在本批开放试玩'); return sample; }
  // The model view guards navigation by the sample it was opened with, so each form is
  // opened as the same skin with that form's online ID and page.
  current() {
    const form=this.selected.forms?.[this.formIndex];
    return form?{...this.selected,onlineId:form.onlineId,url:modelUrl(form.onlineId),form:{...form,index:this.formIndex}}:this.selected;
  }
  authorize(event) {
    if (!this.window || this.window.isDestroyed() || event.sender !== this.window.webContents || event.senderFrame !== this.window.webContents.mainFrame || event.senderFrame.url !== pageUrl) throw new Error('无效试玩操作来源');
  }
  register() {
    const handle=(name,fn)=>ipcMain.handle(`tryout:${name}`,(event,...args)=>{this.authorize(event);return fn(...args);});
    handle('init',()=>({samples:this.samples,availability:this.availability,auditedAt:this.auditedAt,batch:this.batch,gallery:this.gallery,releaseLabel:this.release?.label,selectedId:this.selected.id,state:this.model.state,notes:this.notes.get(this.selected.id)}));
    handle('select',async id=>{this.selected=this.requireSample(id);this.formIndex=0;const notes=this.notes.get(id);await this.model.open(this.current());return {sample:this.selected,formIndex:0,notes};});
    handle('form',async index=>{if(!Number.isInteger(index)||!this.selected.forms?.[index])throw new Error('这款皮肤没有该形态');if(index===this.formIndex&&this.model.state.phase!=='error')return {formIndex:index};this.formIndex=index;await this.model.open(this.current());return {formIndex:index};});
    handle('retry',()=>this.model.open(this.current()));
    handle('mute',value=>{if(typeof value!=='boolean')throw new Error('静音参数无效');this.model.setMuted(value);});
    handle('occlude',value=>{if(typeof value!=='boolean')throw new Error('窗口状态无效');this.model.setOccluded(value);});
    handle('bounds',bounds=>this.model.setBounds(bounds));
    handle('notes',(id,revision,operation,value)=>{this.requireSample(id);return this.notes.update(id,revision,operation,value);});
    handle('browser',()=>shell.openExternal(this.current().url));
    handle('search',()=>shell.openExternal(`https://search.bilibili.com/all?keyword=${encodeURIComponent(`碧蓝航线 ${this.selected.character} ${this.selected.name} L2D 互动 玩法`)}`));
    handle('close',async()=>{this.allowClose=true;await this.model.stop();this.window?.close();});
  }
  async open(id=this.selected.id) {
    this.requireSample(id);
    if (this.window && !this.window.isDestroyed()) { this.window.show();this.window.focus();this.window.webContents.send('tryout:select-request',id);return; }
    this.selected=this.requireSample(id);this.allowClose=false;
    const win=new BrowserWindow({parent:this.parent,title:this.batch?`L2D 试玩台 · ${this.release.label}`:'L2D 试玩台 · 两款样例',width:1540,height:980,minWidth:1120,minHeight:740,backgroundColor:'#101b2b',show:false,autoHideMenuBar:true,icon:path.join(__dirname,'../icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false,backgroundThrottling:false}});
    this.window=win;
    this.model=new ModelView(win,{diagnosticDir:path.join(this.libraryRoot,`verification/${this.reportScope}/`+(this.testing?`round-${this.testRound}`:'user-load')),partition:this.testing?`persist:l2d-${this.testScope}-test-${this.testRound}`:this.batch?`persist:l2d-${this.testScope}-online`:'persist:l2d-sample-online-v1'});
    this.model.on('state',state=>{if(!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('tryout:state',state);});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(url!==pageUrl)event.preventDefault();});
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.on('close',event=>{if(!this.allowClose&&!win.webContents.isDestroyed()){event.preventDefault();win.webContents.send('tryout:prepare-close');}});
    win.on('closed',()=>{this.window=null;this.closeResolve?.();this.closeResolve=null;});
    win.webContents.on('render-process-gone',()=>{this.allowClose=true;this.model.stop().finally(()=>{if(!win.isDestroyed())win.destroy();});});
    // The local page may request its model before loadURL resolves. Show the
    // parent first, so a newly attached model is visible from its first frame.
    win.show(); win.focus();
    await win.loadURL(pageUrl);
  }
  async close() {
    if (!this.window || this.window.isDestroyed()) return;
    await new Promise(resolve=>{this.closeResolve=resolve;this.window.close();});
  }
}
module.exports={TryoutManager,pageUrl};
