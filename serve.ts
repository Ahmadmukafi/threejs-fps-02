// RUSTLINE — round 3. Tiny static server for local playtesting: serves
// game/ on http://localhost:8080. Node 22, standard library only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  try {
    const path = normalize(join(root, decodeURIComponent(req.url.split('?')[0] || '/'))).replace(/\\/g, '/');
    const file = path.endsWith('/') ? join(path, 'index.html') : path;
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(port, () => console.log(`rustline: serving game/ at http://localhost:${port}`));
