import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
// A standalone GLB triangle exercises binary loading without external assets.
const bin=Buffer.alloc(36);[0,0,0,3,0,0,0,3,0].forEach((v,i)=>bin.writeFloatLE(v,i*4));
const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'T03 / Test component',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[3,3,0]}]};
let text=JSON.stringify(json);while(Buffer.byteLength(text)%4)text+=' ';const jsonBuffer=Buffer.from(text),glb=Buffer.alloc(12+8+jsonBuffer.length+8+bin.length);
glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(jsonBuffer.length,12);glb.writeUInt32LE(0x4e4f534a,16);jsonBuffer.copy(glb,20);const offset=20+jsonBuffer.length;glb.writeUInt32LE(bin.length,offset);glb.writeUInt32LE(0x004e4942,offset+4);bin.copy(glb,offset+8);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(process.env.STRUXELO_URL||'http://127.0.0.1:5173');await page.waitForSelector('#viewport canvas');
  await page.locator('#model-file').setInputFiles({name:'test.glb',mimeType:'model/gltf-binary',buffer:glb});await page.waitForSelector('#dialog[open]');assert.match(await page.locator('#dialog-body').textContent(),/1 mesh parts/);await page.locator('#dialog-confirm').click();
  await page.waitForFunction(()=>document.querySelector('#part-count')?.textContent==='1');
  await page.locator('[data-action="auto-match"]').click();assert.match(await page.locator('#dialog-body').textContent(),/1 unassigned parts/);await page.locator('#dialog-confirm').click();
  const download=page.waitForEvent('download');await page.locator('[data-action="save"]').click();const file=await download;
  const data=JSON.parse(await readFile(await file.path(),'utf8'));assert.equal(data.parts[0].taskId,'T03');assert.ok(data.modelAsset.startsWith('data:application/octet-stream;base64,'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#part-count')?.textContent==='1');assert.match(await page.locator('#resource-list').textContent(),/T03 · Linked/);
  const png=page.waitForEvent('download');await page.locator('[data-action="snapshot"]').click();const image=await readFile(await (await png).path());assert.equal(image.subarray(1,4).toString(),'PNG');
  await page.locator('#project-file').setInputFiles({name:'roundtrip.struxelo',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.locator('#dialog-confirm').click();await page.waitForFunction(()=>document.querySelector('#part-count')?.textContent==='1');
  assert.deepEqual(errors,[]);const result={checkedAt:new Date().toISOString(),checks:['Self-contained GLB import','Unique name-code assignment','Project export includes embedded model and assignments','Reload restores GLB and assignment','PNG viewport export','Saved-project import round-trip'],consoleErrors:errors};
  await writeFile(resolve(root,'research/model-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
