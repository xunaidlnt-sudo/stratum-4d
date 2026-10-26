import {mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),research=join(root,'research');
await mkdir(join(research,'downloads'),{recursive:true});await mkdir(join(research,'samples'),{recursive:true});
const file=join(research,'downloads/SYNCHRO-4D-Training-Files.zip');
execFileSync('curl',['-fSL','--connect-timeout','20','--max-time','120','https://bentleysystems.service-now.com/sys_attachment.do?sys_id=3ce231aa473d0a1088c56642846d4360','-o',file],{stdio:'inherit'});
const digest=createHash('sha256').update(await readFile(file)).digest('hex');
if(digest!=='40f5135cc898bc1d6892e11d9007954b836f8e879519c8cf0f77f11891aad749')throw new Error('Training archive differs from the researched version. Review the new artifact before changing expected test data.');
execFileSync('python',['-c',`from pathlib import Path
import sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 for name in ['Training Project Schedule_P6.xml','Training Project Schedule_MSP.xml']:
  data=z.read('SYNCHRO 4D Training Files/Schedule/'+name)
  (Path(sys.argv[2])/name).write_bytes(data)
`,file,join(research,'samples')],{stdio:'inherit'});
console.log('Restored the two version-checked XML fixtures. Reference materials retain Bentley ownership.');
