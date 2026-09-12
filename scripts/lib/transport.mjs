import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const sha256 = data => createHash('sha256').update(data).digest('hex');
const IMAGE_HOSTS = new Set(['patchwiki.biligame.com', 'wiki.biligame.com', 'i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com', '075fac25.pinme.dev', '417ce07b.pinme.dev', 'ed6b1227.pinme.dev']);
export function allowedImageUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !IMAGE_HOSTS.has(url.hostname)) throw new Error('原图地址不是已核对的 HTTPS 图片来源');
  return url;
}
export function imageFormat(bytes) {
  if (bytes.length < 32) throw new Error('图片文件过短');
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return 'webp';
  if (bytes.subarray(0,6).toString().match(/^GIF8[79]a$/)) return 'gif';
  throw new Error('下载内容不是有效的已支持图片格式');
}
export async function fetchImage(source, { fetchImpl = fetch, maxBytes = 128 * 1024 * 1024, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let url = allowedImageUrl(source);
      for (let redirect = 0; redirect <= 4; redirect++) {
        const response = await fetchImpl(url.href, { redirect: 'manual', signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'Mozilla/5.0 L2DLocalGallery/1.0', Referer: 'https://wiki.biligame.com/blhx/' } });
        if ([301,302,303,307,308].includes(response.status)) {
          await response.body?.cancel();
          if (redirect === 4) throw new Error('原图地址重定向次数过多');
          url = allowedImageUrl(new URL(response.headers.get('location'), url).href); continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`原图服务器返回 HTTP ${response.status}`); }
        if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('原图超过大小限制'); }
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > maxBytes) { throw new Error('原图超过大小限制'); }
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks); const format = imageFormat(bytes);
        return { bytes, format, sha256: sha256(bytes), size: bytes.length, source: url.href };
      }
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function githubCommand(rootDir, args) {
  const configFile = path.join(rootDir, 'local-config.json');
  let gh = process.env.L2D_GH_PATH || 'gh';
  if (existsSync(configFile)) gh = JSON.parse(readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '')).ghPath || gh;
  const result = spawnSync(gh, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
  if (result.error) throw new Error(`无法运行 GitHub CLI：${result.error.message}。请运行“配置更新.ps1”或检查 local-config.json。`);
  if (result.status !== 0) throw new Error(`读取更新仓库失败，请检查网络和 GitHub 登录。${String(result.stderr).slice(0, 700)}`);
  return result.stdout;
}
export function getRemoteCatalog(rootDir, config) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository) || !/^[\w./-]+$/.test(config.branch)) throw new Error('更新仓库配置格式错误');
  const commit = JSON.parse(githubCommand(rootDir, ['api', `repos/${config.repository}/commits/${encodeURIComponent(config.branch)}`]));
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) throw new Error('GitHub 未返回有效版本');
  const response = JSON.parse(githubCommand(rootDir, ['api', `repos/${config.repository}/contents/data/catalog.json?ref=${commit.sha}`]));
  if (response.encoding !== 'base64' || typeof response.content !== 'string') throw new Error('更新数据格式错误');
  const catalog = JSON.parse(Buffer.from(response.content, 'base64').toString('utf8'));
  return { catalog, commit: commit.sha };
}
