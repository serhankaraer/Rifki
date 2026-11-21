// Statik dosya sunumu (istemci). Bağımlılık yok. Yol gezintisi (../) engellenir.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'",
};

/** rootDir altındaki dosyaları sunan (req, res) işleyicisi. Dönüş: işlendiyse true. */
export function createStaticHandler(rootDir) {
  const root = path.resolve(rootDir);
  return async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      res.end();
      return true;
    }
    if (pathname.includes('\0')) { res.writeHead(400, SECURITY_HEADERS); res.end(); return true; }
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) { // kök dışına çıkış denemesi
      res.writeHead(404, SECURITY_HEADERS);
      res.end();
      return true;
    }
    try {
      const body = await readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': type, 'cache-control': 'no-cache', 'content-length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'Bulunamadı');
    }
    return true;
  };
}
