import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { packager } from '@electron/packager';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = path.join(root, '.local-tools', 'desktop-build');
const staging = path.join(buildRoot, 'app');
fs.mkdirSync(staging, { recursive: true });
const compile = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'desktop/build-launcher.ps1'),'-ProjectRoot',root,'-OutputName','碧蓝航线图鉴.exe'], { cwd:root, stdio:'inherit', windowsHide:true });
if (compile.status !== 0) throw new Error('无法编译图形入口');
for (const name of ['desktop','scripts']) fs.cpSync(path.join(root,name),path.join(staging,name),{recursive:true});
let html = fs.readFileSync(path.join(root,'index-信浓泳装起.html'),'utf8');
html = html.replace('</head>','<link rel="stylesheet" href="desktop/desktop.css">\n</head>').replace('</body>','<script src="desktop/renderer.js"></script>\n</body>');
fs.writeFileSync(path.join(staging,'index.html'),html);
// The official gallery carries the full tryout release (every verified skin).
const { default: batch } = await import('./tryout/batch.cjs');
const release = batch.releaseFrom(batch.fullRelease);
const appVersion = release.version.split('-')[0];
fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify({name:'azurlane-l2d-desktop',productName:'碧蓝航线图鉴',version:appVersion,type:'module',main:'desktop/main.cjs',private:true,galleryTryout:release.number}));
const electronVersion = JSON.parse(fs.readFileSync(path.join(root,'node_modules/electron/package.json'),'utf8')).version;
const output = await packager({dir:staging,name:'碧蓝航线图鉴',platform:'win32',arch:'x64',electronVersion,out:path.join(buildRoot,'out'),overwrite:true,asar:false,prune:false,icon:path.join(root,'desktop/icon.ico'),appVersion,appCopyright:'Local personal gallery',win32metadata:{CompanyName:'Personal software',FileDescription:'碧蓝航线 L2D 图鉴',ProductName:'碧蓝航线图鉴'}});
const destination = path.join(root,'.desktop');
fs.mkdirSync(destination,{recursive:true});
fs.cpSync(output[0],destination,{recursive:true});
fs.writeFileSync(path.join(root,'verification/desktop-build.json'),JSON.stringify({builtAt:new Date().toISOString(),electronVersion,entry:path.join(root,'碧蓝航线图鉴.exe'),runtime:destination,libraryRoot:root,sharedOriginalAssets:true,requiresExternalNode:false,requiresGitHubCLI:false},null,2)+'\n');
// Files the tryout self-test must leave untouched: the catalog and the user's saved notes.
const protectedFiles=['data/catalog.json','data/skins-data.js',`.desktop-data/${release.scope}/tryout-notes/play-notes.v1.json`]
  .filter(file=>fs.existsSync(path.join(root,file))).map(file=>({file}));
const scopeDir=path.join(root,'verification',release.scope);fs.mkdirSync(scopeDir,{recursive:true});
fs.writeFileSync(path.join(scopeDir,'build.json'),JSON.stringify({version:release.version,batch:release.number,builtAt:new Date().toISOString(),entry:path.join(root,'碧蓝航线图鉴.exe'),runtime:destination,galleryTryout:true,samples:batch.batchFrom(JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8')),release.number).samples.map(s=>({id:s.id,character:s.character,name:s.name,forms:s.forms})),protectedFiles},null,2)+'\n');
console.log(`完成：${path.join(root,'碧蓝航线图鉴.exe')}（含${release.label}试玩，${release.version}）`);
