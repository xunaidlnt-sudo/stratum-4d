import {downloadArtifact} from '@electron/get';
import {mkdir,rename,writeFile,readFile,readdir,cp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as PELibrary from 'pe-library';
import * as ResEdit from 'resedit';

const root=resolve(import.meta.dirname,'..');
const version='45.0.0';
const release=join(root,'release'),folder=join(release,'Struxelo-4D-0.1.0-win-x64');
await mkdir(release,{recursive:true});
// @electron/get verifies the artifact against Electron's published SHASUMS256.
const archive=await downloadArtifact({version,artifactName:'electron',platform:'win32',arch:'x64',cacheRoot:join(root,'.cache/electron')});
await rm(folder,{recursive:true,force:true});await mkdir(folder,{recursive:true});
execFileSync('python',['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',archive,folder]);
await rename(join(folder,'electron.exe'),join(folder,'Struxelo4D.exe'));
const exePath=join(folder,'Struxelo4D.exe');
const exe=PELibrary.NtExecutable.from(await readFile(exePath),{ignoreCert:true});
const resources=PELibrary.NtExecutableResource.from(exe);
const ico=ResEdit.Data.IconFile.from(await readFile(join(root,'public/brand/struxelo.ico')));
const group=ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)[0];
if(!group)throw new Error('Expected Electron icon group is missing.');
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries,group.id,group.lang,ico.icons.map(item=>item.data));
for(const versionInfo of ResEdit.Resource.VersionInfo.fromEntries(resources.entries)){
  versionInfo.setFileVersion(0,1,0,0,1033);versionInfo.setProductVersion(0,1,0,0,1033);
  versionInfo.setStringValues({lang:1033,codepage:1200},{ProductName:'Struxelo 4D',FileDescription:'Struxelo 4D — Construction Planning',CompanyName:'Junaid Quamar',OriginalFilename:'Struxelo4D.exe',InternalName:'Struxelo4D',Comments:'Concept and product direction: Junaid Quamar, Senior Planning Engineer.',LegalCopyright:'Struxelo project credit: Junaid Quamar. Third-party rights retained.'});
  versionInfo.outputToResourceEntries(resources.entries);
}
resources.outputResource(exe);await writeFile(exePath,Buffer.from(exe.generate()));
const app=join(folder,'resources/app');await mkdir(app,{recursive:true});
await cp(join(root,'dist'),join(app,'dist'),{recursive:true});await cp(join(root,'desktop'),join(app,'desktop'),{recursive:true});
await writeFile(join(app,'package.json'),JSON.stringify({name:'struxelo-4d',productName:'Struxelo 4D',version:'0.1.0',main:'desktop/main.cjs',author:'Junaid Quamar',description:'Construction planning prototype. Concept and product direction: Junaid Quamar.'},null,2));
for(const name of ['README.md','CREDITS.md','THIRD_PARTY_NOTICES.md'])await cp(join(root,name),join(folder,name));
await cp(join(root,'docs'),join(folder,'docs'),{recursive:true});
const licenseFolder=join(folder,'third-party-licenses');await mkdir(licenseFolder,{recursive:true});
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
for(const [location,metadata] of Object.entries(lock.packages)){
  if(!location.startsWith('node_modules/')||metadata.dev)continue;
  const base=join(root,location),name=location.replaceAll('/','_');
  for(const file of await readdir(base))if(/^(licen[sc]e|copying|notice)(\.|$)/i.test(file))await cp(join(base,file),join(licenseFolder,name+'-'+file));
}
await writeFile(join(folder,'START-HERE.txt'),'Struxelo 4D 0.1.0\r\nConcept and product direction: Junaid Quamar, Senior Planning Engineer.\r\nExtract the entire ZIP to a writable folder, then run Struxelo4D.exe.\r\nDo not move the executable out of this folder.\r\nRequires Windows 10/11 x64. This is an unsigned prototype, not a verified SYNCHRO replacement.\r\nRead README.md and docs/USER-GUIDE.md before importing project data.\r\n');
const output=folder+'.zip';
execFileSync('python',['-c','import sys,shutil,pathlib; p=pathlib.Path(sys.argv[1]); shutil.make_archive(str(p),"zip",str(p.parent),p.name)',folder],{stdio:'inherit'});
console.log(output);
