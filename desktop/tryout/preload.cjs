const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,callback)=>{const handler=(_event,value)=>callback(value);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);};
contextBridge.exposeInMainWorld('l2dTryout',{
  init:()=>ipcRenderer.invoke('tryout:init'),
  select:id=>ipcRenderer.invoke('tryout:select',id),
  retry:()=>ipcRenderer.invoke('tryout:retry'),
  mute:value=>ipcRenderer.invoke('tryout:mute',value),
  occlude:value=>ipcRenderer.invoke('tryout:occlude',value),
  bounds:value=>ipcRenderer.invoke('tryout:bounds',value),
  notes:(id,revision,operation,value)=>ipcRenderer.invoke('tryout:notes',id,revision,operation,value),
  browser:()=>ipcRenderer.invoke('tryout:browser'),
  search:()=>ipcRenderer.invoke('tryout:search'),
  close:()=>ipcRenderer.invoke('tryout:close'),
  onState:callback=>listen('tryout:state',callback),
  onSelect:callback=>listen('tryout:select-request',callback),
  onClose:callback=>listen('tryout:prepare-close',callback)
});
