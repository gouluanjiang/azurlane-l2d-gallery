const path = require('node:path');
const fs = require('node:fs');

function externalUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('不支持此链接');
  const allowed = new Set(['search.bilibili.com', 'www.bilibili.com', 'game.bilibili.com', 'wiki.biligame.com']);
  if (!allowed.has(url.hostname) && !(url.hostname === 'github.com' && /^\/gouluanjiang\/azurlane-l2d-gallery(?:\/|$)/.test(url.pathname))) throw new Error('不支持此链接');
  return url.href;
}
function localResource(value, libraryRoot, appRoot) {
  const url = new URL(value);
  if (url.protocol !== 'l2d:' || url.hostname !== 'gallery' || url.username || url.password || url.port) throw new Error('无效页面');
  let relative = decodeURIComponent(url.pathname).replace(/^\//, '');
  if (!relative || relative === 'index.html') return path.join(appRoot, 'index.html');
  if (relative === 'desktop/renderer.js' || relative === 'desktop/desktop.css' || relative === 'desktop/icon.png') return path.join(appRoot, relative);
  if (relative !== 'data/skins-data.js' && !relative.startsWith('assets/')) throw new Error('文件不可访问');
  if (relative.split('/').some(part => !part || part === '.' || part === '..' || /[\\:\x00-\x1f]/.test(part) || /[. ]$/.test(part))) throw new Error('无效路径');
  if (relative.startsWith('assets/') && !/\.(?:png|jpe?g|webp|gif)$/i.test(relative)) throw new Error('不是图片');
  const file = path.resolve(libraryRoot, relative);
  if (!file.startsWith(path.resolve(libraryRoot) + path.sep)) throw new Error('路径越界');
  const real = fs.realpathSync(file);
  if (!real.startsWith(fs.realpathSync(libraryRoot) + path.sep)) throw new Error('路径越界');
  return file;
}
module.exports = { externalUrl, localResource };
