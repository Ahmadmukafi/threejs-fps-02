// RUSTLINE — dev server. Serves game/ as static files on localhost so the
// game can be played in desktop Chrome. Node 22, stdlib only.
// Usage: node serve.ts [port]   (default 8080, opens http://localhost:8080)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(join(fileURLToPath(import.meta.url), '..', 'game'));
const port = Number(process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = resolve(join(root, normalize(path).replace(/^(\.\.[/\\])+/, '')));
    if (!file.startsWith(root)) {
      res.writeHead(403); res.end('forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(port, () => {
  console.log(`rustline: serving game/ at http://localhost:${port}`);
});
