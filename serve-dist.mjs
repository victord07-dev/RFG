import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 5173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

http
  .createServer(async (req, res) => {
    const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const cleanPath = rawPath === '/' ? '/index.html' : rawPath;
    const filePath = path.normalize(path.join(root, cleanPath));

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const finalPath = existsSync(filePath) ? filePath : path.join(root, 'index.html');
    const ext = path.extname(finalPath);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });

    if (ext === '.html') {
      res.end(await readFile(finalPath, 'utf8'));
      return;
    }

    createReadStream(finalPath).pipe(res);
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`Serving dist at http://127.0.0.1:${port}`);
  });
