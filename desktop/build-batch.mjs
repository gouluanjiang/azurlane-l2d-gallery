import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import batch from './tryout/batch.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=process.argv.indexOf('--batch');
const release=batch.releaseFrom(option<0?4:Number(process.argv[option+1]));
const source=path.join(root,'.desktop'),dest=path.join(root,'.desktop-'+release.scope),out=path.join(root,'verification',release.scope);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const accepted=read('verification/two-skin-sample/user-acceptance.json');
const acceptanceFile=number=>['user-acceptance.json','agent-acceptance.json'].map(name=>`verification/batch-${number}/${name}`).find(file=>fs.existsSync(path.join(root,file)));
if(acceptanceFile(release.number))throw new Error(release.label+'已验收并冻结；请构建下一批');
if(hash(path.join(root,'碧蓝航线试玩样例.exe'))!==accepted.entrySha256)throw new Error('已验收样例入口发生变化，请先核对');
for(const file of accepted.packagedSource)if(hash(path.join(root,'.desktop-sample/resources/app',file.file))!==file.sha256)throw new Error('已验收样例文件发生变化：'+file.file);
const protectedFiles=['data/catalog.json','data/skins-data.js','碧蓝航线图鉴.exe','.desktop/resources/app/desktop/main.cjs','碧蓝航线试玩样例.exe',...accepted.packagedSource.map(f=>'.desktop-sample/resources/app/'+f.file),'.desktop-data/tryout-notes/play-notes.v1.json'];
for(let number=1;number<release.number;number++){
  const previous=batch.releaseFrom(number),file=acceptanceFile(number);
  if(!file)throw new Error('请先完成'+previous.label+'实际验收');
  const receipt=read(file);
  if(!['accepted-by-agent','accepted-by-user'].includes(receipt.status)||receipt.version!==previous.version)throw new Error(previous.label+'验收记录不匹配');
  const previousEntry='碧蓝航线试玩台-'+previous.label+'.exe',previousApp='.desktop-'+previous.scope+'/resources/app/';
  if(hash(path.join(root,previousEntry))!==receipt.entrySha256)throw new Error(previous.label+'入口发生变化');
  for(const f of receipt.packagedSource)if(hash(path.join(root,previousApp,f.file))!==f.sha256)throw new Error(previous.label+'文件发生变化：'+f.file);
  protectedFiles.push(previousEntry,...receipt.packagedSource.map(f=>previousApp+f.file),`.desktop-data/${previous.scope}/tryout-notes/play-notes.v1.json`);
}
const baseline=protectedFiles.map(file=>({file,sha256:fs.existsSync(path.join(root,file))?hash(path.join(root,file)):null}));
const {samples}=batch.batchFrom(read('data/catalog.json'),release.number);
function linkTree(a,b){fs.mkdirSync(b,{recursive:true});for(const e of fs.readdirSync(a,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Unexpected runtime reparse point');const from=path.join(a,e.name),to=path.join(b,e.name);if(e.isDirectory())linkTree(from,to);else if(!fs.existsSync(to))fs.linkSync(from,to);}}
fs.mkdirSync(dest,{recursive:true});
for(const e of fs.readdirSync(source,{withFileTypes:true})){if(e.name==='resources')continue;const from=path.join(source,e.name),to=path.join(dest,e.name);if(e.isDirectory())linkTree(from,to);else if(!fs.existsSync(to))fs.linkSync(from,to);}
const app=path.join(dest,'resources/app');fs.mkdirSync(app,{recursive:true});
for(const name of ['desktop','scripts'])fs.cpSync(path.join(root,name),path.join(app,name),{recursive:true});
const html=fs.readFileSync(path.join(root,'index-信浓泳装起.html'),'utf8').replace('</head>','<link rel="stylesheet" href="desktop/desktop.css">\n</head>').replace('</body>','<script src="desktop/renderer.js"></script>\n</body>');
fs.writeFileSync(path.join(app,'index.html'),html);
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'azurlane-l2d-tryout-'+release.scope,productName:'碧蓝航线试玩台 · '+release.label,version:release.version,type:'module',main:'desktop/main.cjs',private:true,sampleBuild:true,batchBuild:release.number},null,2));
const entry=path.join(root,'碧蓝航线试玩台-'+release.label+'.exe');
fs.mkdirSync(out,{recursive:true});
const launcherSource=path.join(out,'BatchLauncher.cs');
fs.writeFileSync(launcherSource,fs.readFileSync(path.join(root,'desktop/BatchLauncher.cs'),'utf8').replaceAll('第一批',release.label).replaceAll('batch-1',release.scope).replace('1.3.0.0',release.version.split('-')[0]+'.0'));
const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const result=spawnSync(compiler,['/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001','/reference:System.Windows.Forms.dll',`/out:${entry}`,`/win32icon:${path.join(root,'desktop/icon.ico')}`,`/win32manifest:${path.join(root,'desktop/app.manifest')}`,launcherSource],{stdio:'inherit',windowsHide:true});
if(result.status!==0)throw new Error('入口编译失败：'+(result.error?.message||result.status));
for(const item of baseline){const current=fs.existsSync(path.join(root,item.file))?hash(path.join(root,item.file)):null;if(current!==item.sha256)throw new Error('受保护文件发生变化：'+item.file);}
const packagedSource=[];
function inventory(folder,relative=''){for(const e of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,e.name),rel=(relative?relative+'/':'')+e.name;if(e.isDirectory())inventory(file,rel);else packagedSource.push({file:rel,sha256:hash(file)});}}
inventory(app);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify({version:release.version,batch:release.number,builtAt:new Date().toISOString(),entry,entrySha256:hash(entry),runtime:dest,samples:samples.map(s=>({id:s.id,character:s.character,name:s.name,onlineId:s.onlineId,url:s.url})),protectedFiles:baseline,packagedSource},null,2)+'\n');
console.log(release.label+'已构建：'+entry);
