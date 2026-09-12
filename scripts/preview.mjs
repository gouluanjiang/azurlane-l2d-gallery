import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safePath } from './lib/sync-engine.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.css':'text/css; charset=utf-8', '.webp':'image/webp' };
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url,'http://127.0.0.1');
    const relative = url.pathname === '/' ? 'index-信浓泳装起.html' : decodeURIComponent(url.pathname.slice(1));
    if (!(relative === 'index-信浓泳装起.html' || relative.startsWith('data/') || relative.startsWith('assets/'))) throw new Error('not public');
    const file = safePath(root,relative); const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('not file');
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); res.end('文件不存在'); }
});
server.listen(Number(process.env.PORT || 0),'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}/`));
