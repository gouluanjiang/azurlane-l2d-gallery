import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'.desktop'),dest=path.join(root,'.desktop-sample');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseline=['data/catalog.json','data/skins-data.js','.desktop/resources/app/desktop/main.cjs','碧蓝航线图鉴.exe'].map(file=>({file,sha256:hash(path.join(root,file))}));
fs.mkdirSync(dest,{recursive:true});
function linkTree(a,b){fs.mkdirSync(b,{recursive:true});for(const e of fs.readdirSync(a,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Unexpected runtime reparse point');const from=path.join(a,e.name),to=path.join(b,e.name);if(e.isDirectory())linkTree(from,to);else if(!fs.existsSync(to))fs.linkSync(from,to);}}
for(const e of fs.readdirSync(source,{withFileTypes:true})){if(e.name==='resources')continue;const from=path.join(source,e.name),to=path.join(dest,e.name);if(e.isDirectory())linkTree(from,to);else if(!fs.existsSync(to))fs.linkSync(from,to);}
const app=path.join(dest,'resources/app');fs.mkdirSync(app,{recursive:true});
for(const name of ['desktop','scripts'])fs.cpSync(path.join(root,name),path.join(app,name),{recursive:true});
const html=fs.readFileSync(path.join(root,'index-信浓泳装起.html'),'utf8').replace('</head>','<link rel="stylesheet" href="desktop/desktop.css">\n</head>').replace('</body>','<script src="desktop/renderer.js"></script>\n</body>');
fs.writeFileSync(path.join(app,'index.html'),html);
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'azurlane-l2d-tryout-sample',productName:'碧蓝航线试玩样例',version:'1.2.0-sample.1',type:'module',main:'desktop/main.cjs',private:true,sampleBuild:true}));
const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const compile=spawnSync(compiler,['/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001','/reference:System.Windows.Forms.dll',`/out:${path.join(root,'碧蓝航线试玩样例.exe')}`,`/win32icon:${path.join(root,'desktop/icon.ico')}`,`/win32manifest:${path.join(root,'desktop/app.manifest')}`,path.join(root,'desktop/SampleLauncher.cs')],{stdio:'inherit',windowsHide:true});
if(compile.status!==0)throw new Error(`样例入口编译失败：${compile.error?.message||compile.status}`);
for(const item of baseline)if(hash(path.join(root,item.file))!==item.sha256)throw new Error(`正式文件发生变化：${item.file}`);
const out=path.join(root,'verification/two-skin-sample');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify({builtAt:new Date().toISOString(),entry:path.join(root,'碧蓝航线试玩样例.exe'),runtime:dest,electronVersion:fs.readFileSync(path.join(dest,'version'),'utf8').trim(),productionFilesUnchanged:baseline,sourceMainSha256:hash(path.join(root,'desktop/main.cjs'))},null,2)+'\n');
console.log(`样例已构建：${path.join(root,'碧蓝航线试玩样例.exe')}`);
