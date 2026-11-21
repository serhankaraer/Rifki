// WebSocket taşıma katmanı (ws). Çekirdek (createGameServer) taşımadan bağımsızdır; bu dosya sadece bağlar.
// İstemci protokolü: her mesaj tek bir JSON nesnesi { t: '...', ... } (bkz. protocol.js).
import { WebSocketServer } from 'ws';
import { createGameServer } from './server.js';
import { realScheduler, realRandom } from './defaults.js';
import { S2C, ERR } from './protocol.js';

const MAX_PAYLOAD = 16 * 1024;       // tek mesaj üst sınırı
const DEFAULT_RATE = { capacity: 40, refillPerSec: 20 }; // anlık mesaj hakkı / saniyede yenilenen hak (bağlantı başına)
const HEARTBEAT_MS = 30_000;

export function attachWebSocket({ server, path = '/ws', config, rateLimit = {}, log = console.error } = {}) {
  const rate = { ...DEFAULT_RATE, ...rateLimit };
  const wss = new WebSocketServer({ server, path, maxPayload: MAX_PAYLOAD });
  const sockets = new Map(); // connId -> { ws, alive, tokens, last }
  let nextId = 1;

  const gameServer = createGameServer({
    send(connId, msg) {
      const s = sockets.get(connId);
      if (s && s.ws.readyState === 1) s.ws.send(JSON.stringify(msg));
    },
    close(connId) {
      sockets.get(connId)?.ws.close(4000, ERR.SESSION_REPLACED);
    },
    scheduler: realScheduler,
    random: realRandom,
    config,
    log,
  });

  wss.on('connection', (ws) => {
    const connId = nextId++;
    const s = { ws, alive: true, tokens: rate.capacity, last: Date.now() };
    sockets.set(connId, s);

    ws.on('pong', () => { s.alive = true; });
    ws.on('message', (data) => {
      const now = Date.now();
      s.tokens = Math.min(rate.capacity, s.tokens + ((now - s.last) / 1000) * rate.refillPerSec);
      s.last = now;
      if (s.tokens < 1) {
        ws.send(JSON.stringify({ t: S2C.ERROR, code: ERR.RATE_LIMITED }));
        return;
      }
      s.tokens -= 1;
      let msg;
      try {
        msg = JSON.parse(data.toString('utf8'));
      } catch {
        ws.send(JSON.stringify({ t: S2C.ERROR, code: ERR.BAD_MESSAGE }));
        return;
      }
      gameServer.onMessage(connId, msg);
    });
    ws.on('close', () => {
      sockets.delete(connId);
      gameServer.onClose(connId);
    });
    ws.on('error', (e) => log('ws hata', e.message));
  });

  // Ölü bağlantıları (ağ koptu, kapatma gelmedi) tespit et -> kopma/bot devralma akışı çalışır
  const heartbeat = setInterval(() => {
    for (const s of sockets.values()) {
      if (!s.alive) { s.ws.terminate(); continue; }
      s.alive = false;
      s.ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  return {
    gameServer,
    wss,
    close() {
      clearInterval(heartbeat);
      gameServer.shutdown();
      for (const s of sockets.values()) s.ws.terminate();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}
