const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
let window;
app.setName('Struxelo 4D');
app.whenReady().then(()=>{
  window=new BrowserWindow({width:1550,height:980,minWidth:1050,minHeight:720,icon:path.join(__dirname,'../dist/brand/struxelo-icon.png'),backgroundColor:'#f6f8f9',title:'Struxelo 4D',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.loadFile(path.join(__dirname,'../dist/index.html'));
  ipcMain.handle('project:open',async()=>{
    const result=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Struxelo project',extensions:['struxelo','json']}]});
    if(result.canceled)return null;
    const stat=await fs.stat(result.filePaths[0]);if(stat.size>40_000_000)throw new Error('Project is larger than 40 MB.');
    return fs.readFile(result.filePaths[0],'utf8');
  });
  ipcMain.handle('project:save',async(_event,payload)=>{
    if(!payload||typeof payload.content!=='string'||payload.content.length>50_000_000)throw new Error('Invalid or oversized file.');
    const formats={project:['struxelo','Struxelo project'],csv:['csv','Schedule CSV'],png:['png','Viewport image']};
    const format=formats[payload.kind];if(!format)throw new Error('Unknown export type.');
    const result=await dialog.showSaveDialog(window,{defaultPath:`Struxelo-project.${format[0]}`,filters:[{name:format[1],extensions:[format[0]]}]});
    if(result.canceled)return false;
    const data=payload.kind==='png'?Buffer.from(payload.content.replace(/^data:image\/png;base64,/,''),'base64'):payload.content;
    // Publish a complete sibling temporary file; rename leaves the previous file intact on write failure.
    const temporary=result.filePath+'.'+Date.now()+'.tmp';
    try{await fs.writeFile(temporary,data,{flag:'wx'});await fs.rename(temporary,result.filePath);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
    return true;
  });
});
app.on('window-all-closed',()=>app.quit());
