// Builds the portable Windows release: the launcher, the Electron runtime, the
// catalog and the update settings, zipped under one 碧蓝航线图鉴 folder. Like the
// repository it carries no game images; the first start downloads and verifies
// them from the public sources recorded in the catalog.
//   node desktop/package-release.mjs [--skip-build]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} ${args[0]} 失败`);
};
if (!process.argv.includes('--skip-build')) run(process.execPath, [path.join(root, 'desktop/build.mjs')]);

const runtime = path.join(root, '.desktop');
const appPackage = JSON.parse(fs.readFileSync(path.join(runtime, 'resources/app/package.json'), 'utf8'));
// The runtime must have been built from the code in this checkout.
for (const file of ['desktop/main.cjs', 'scripts/lib/sync-engine.mjs', 'desktop/tryout/batch.cjs']) {
  const text = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  if (text(path.join(root, file)) !== text(path.join(runtime, 'resources/app', file))) throw new Error(`运行时与源码不一致，请先构建：${file}`);
}
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
const sourceless = catalog.skins.filter(s => !s.artworkSource || (s.guidePath && !s.guideSource));
if (sourceless.length) throw new Error(`${sourceless.length} 款皮肤缺少公开图片来源，新电脑无法补齐：${sourceless[0].character}「${sourceless[0].name}」`);

const out = path.join(root, '.local-tools', 'release');
const stage = path.join(out, '碧蓝航线图鉴');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
// Hard links keep the 370 MB runtime from being copied once more before zipping.
const link = (from, to) => {
  if (fs.statSync(from).isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const name of fs.readdirSync(from)) link(path.join(from, name), path.join(to, name)); }
  else fs.linkSync(from, to);
};
link(runtime, path.join(stage, '.desktop'));
for (const file of ['碧蓝航线图鉴.exe', 'update-config.json', 'data/catalog.json', 'data/skins-data.js']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`缺少发布文件：${file}`);
  fs.mkdirSync(path.dirname(path.join(stage, file)), { recursive: true });
  fs.copyFileSync(path.join(root, file), path.join(stage, file));
}
for (const folder of ['assets/skins', 'assets/guides']) fs.mkdirSync(path.join(stage, folder), { recursive: true });
const guides = catalog.skins.filter(s => s.guidePath).length;
fs.writeFileSync(path.join(stage, '使用说明.txt'), `碧蓝航线图鉴 ${appPackage.version}（Windows x64 便携版）\r
\r
1. 把整个“碧蓝航线图鉴”文件夹解压到普通位置，例如 D:\\碧蓝航线图鉴。\r
   不要放在需要管理员权限的文件夹（如 C:\\Program Files）里。\r
2. 双击“碧蓝航线图鉴.exe”。\r
3. 首次启动会自动下载并校验 ${catalog.skins.length} 张原图和 ${guides} 张玩法图解（约 800 MB），\r
   图片来自 BiliWiki 等公开来源，完成后页面自动刷新。中途断网也没关系，\r
   已下载的图片会保留，下次启动或点“同步云端”会继续。\r
\r
之后每次启动会自动同步云端图鉴（最多每 12 小时一次），新皮肤的试玩模型\r
也会自动查找。可在“设置”里关闭。试玩需要联网，已下载的图片离线可用。\r
\r
你的笔记、设置和浏览数据保存在本文件夹的 .desktop-data 中，升级时请保留。\r
项目主页：https://github.com/gouluanjiang/azurlane-l2d-gallery\r
`);

const zip = path.join(out, `azurlane-l2d-gallery-${appPackage.version}-win-x64.zip`);
fs.rmSync(zip, { force: true });
// .NET's ZipFile marks the Chinese entry names as UTF-8, so Explorer extracts them correctly.
const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:L2D_STAGE, $env:L2D_ZIP, [IO.Compression.CompressionLevel]::Optimal, $true, [Text.Encoding]::UTF8)`;
const zipped = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit', windowsHide: true, env: { ...process.env, L2D_STAGE: stage, L2D_ZIP: zip } });
if (zipped.status !== 0) throw new Error('压缩发布包失败');
const hash = createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(`${zip}.sha256`, `${hash}  ${path.basename(zip)}\n`);
console.log(`完成：${zip}\n大小 ${(fs.statSync(zip).size / 1048576).toFixed(1)} MB，SHA-256 ${hash}`);
