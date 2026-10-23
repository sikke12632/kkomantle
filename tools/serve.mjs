// 아주 작은 정적 서버 (python -m http.server 대신). node serve.mjs <폴더> <포트>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
const root = process.argv[2], port = +(process.argv[3] || 8643);
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = normalize(join(root, p));
    if (!f.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
    if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    const b = await readFile(f);
    res.writeHead(200, { 'Content-Type': T[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port));
