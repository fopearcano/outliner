// Tiny zero-dependency static server for the built `dist/`. Used by the macOS
// app launcher (Outliner.app) and runnable directly: `node scripts/serve.mjs`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = normalize(process.argv[2] || join(here, '..', 'dist'));
const PORT = Number(process.argv[3] || process.env.PORT || 5273);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function tryFile(path) {
  try {
    const s = await stat(path);
    if (s.isFile()) return path;
  } catch {
    /* not found */
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    // Resolve within ROOT; block path traversal.
    let rel = normalize(url).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) filePath = ROOT;
    if (url.endsWith('/')) filePath = join(filePath, 'index.html');

    let resolved = await tryFile(filePath);
    // SPA fallback: unknown non-asset routes serve index.html.
    if (!resolved && !extname(filePath)) resolved = await tryFile(join(ROOT, 'index.html'));
    if (!resolved) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const body = await readFile(resolved);
    res.writeHead(200, {
      'Content-Type': MIME[extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error: ' + err.message);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Already running on this port — that's fine, just exit quietly.
    console.log(`Port ${PORT} already in use; assuming Outliner is already serving.`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Outliner serving ${ROOT} at http://${HOST}:${PORT}`);
});
