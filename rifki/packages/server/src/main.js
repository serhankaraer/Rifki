// Sunucuyu başlatır: node src/main.js
// Ortam değişkenleri: PORT (varsayılan 3001), CLIENT_DIR (varsayılan ../client/public),
// RIFKI_CONFIG (JSON; örn. {"thinkDelayScale":0.01,"takeoverMs":5000} - geliştirme/test için)
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from './ws-adapter.js';
import { createStaticHandler } from './static.js';

const port = Number(process.env.PORT || 3001);
const clientDir = process.env.CLIENT_DIR || fileURLToPath(new URL('../../client/public/', import.meta.url));
const config = process.env.RIFKI_CONFIG ? JSON.parse(process.env.RIFKI_CONFIG) : {};
const serveStatic = createStaticHandler(clientDir);

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (await serveStatic(req, res)) return;
  res.writeHead(405);
  res.end();
});

const app = attachWebSocket({ server, config });
server.listen(port, () => console.log(`Rıfkı: http://localhost:${port}  (WebSocket: /ws)`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    server.close(() => process.exit(0));
  });
}
