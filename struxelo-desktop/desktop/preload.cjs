const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  openProject:()=>ipcRenderer.invoke('project:open'),
  saveFile:(content,kind)=>ipcRenderer.invoke('project:save',{content,kind})
});
