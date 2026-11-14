const path = require('node:path');
const fs = require('node:fs');

function externalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('不支持此链接');
  const allowed = new Set(['search.bilibili.com', 'www.bilibili.com', 'game.bilibili.com', 'wiki.biligame.com']);
  if (!allowed.has(url.hostname) && !(url.hostname === 'github.com' && /^\/gouluanjiang\/azurlane-l2d-gallery(?:\/|$)/.test(url.pathname))) throw new Error('不支持此链接');
  return url.href;
}
// Addresses the main process requests itself (the sync worker has its own checks in
// scripts/lib/transport.mjs). Only the release feed: the new-version notice.
const RELEASE_FEED = 'https://api.github.com/repos/gouluanjiang/azurlane-l2d-gallery/releases/latest';
const FETCH_ALLOWED = new Set([RELEASE_FEED]);
function fetchUrl(value) {
  const url = new URL(value);
  if (!FETCH_ALLOWED.has(url.href)) throw new Error('不允许访问此地址');
  return url.href;
}
// A release page of this repository, opened in the system browser from the notice.
function releasePage(value) {
  const url = new URL(externalUrl(value));
  if (url.hostname !== 'github.com' || url.search || url.hash || !/^\/gouluanjiang\/azurlane-l2d-gallery\/releases\/tag\/[^/]+$/.test(url.pathname)) throw new Error('不是本仓库的发行页');
  return url.href;
}
function localResource(value, libraryRoot, appRoot) {
  const url = new URL(value);
  if (url.protocol !== 'l2d:' || url.hostname !== 'gallery' || url.username || url.password || url.port) throw new Error('无效页面');
  let relative = decodeURIComponent(url.pathname).replace(/^\//, '');
  if (!relative || relative === 'index.html') return path.join(appRoot, 'index.html');
  const applicationFiles = new Set(['desktop/renderer.js','desktop/desktop.css','desktop/icon.png','desktop/tryout/index.html','desktop/tryout/player.css','desktop/tryout/player.js']);
  if (applicationFiles.has(relative)) return path.join(appRoot, relative);
  if (relative !== 'data/skins-data.js' && !relative.startsWith('assets/')) throw new Error('文件不可访问');
  if (relative.split('/').some(part => !part || part === '.' || part === '..' || /[\\:\x00-\x1f]/.test(part) || /[. ]$/.test(part))) throw new Error('无效路径');
  if (relative.startsWith('assets/') && !/\.(?:png|jpe?g|webp|gif)$/i.test(relative)) throw new Error('不是图片');
  const file = path.resolve(libraryRoot, relative);
  if (!file.startsWith(path.resolve(libraryRoot) + path.sep)) throw new Error('路径越界');
  const real = fs.realpathSync(file);
  if (!real.startsWith(fs.realpathSync(libraryRoot) + path.sep)) throw new Error('路径越界');
  return file;
}
module.exports = { externalUrl, localResource, RELEASE_FEED, fetchUrl, releasePage };
