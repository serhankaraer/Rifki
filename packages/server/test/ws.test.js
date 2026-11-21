import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { attachWebSocket } from '../src/ws-adapter.js';

async function startServer(config, rateLimit) {
  const server = http.createServer((req, res) => { res.writeHead(req.url === '/healthz' ? 200 : 404); res.end(req.url === '/healthz' ? 'ok' : ''); });
  const app = attachWebSocket({ server, config: { thinkDelayScale: 0.001, handPauseMs: 5, simsScale: 0.2, ...config }, rateLimit, log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    port,
    async stop() { await app.close(); await new Promise((r) => server.close(r)); },
  };
}

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs = [];
  let closed = null;
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  ws.on('close', (code) => { closed = code; });
  const c = {
    ws, msgs,
    get closedCode() { return closed; },
    opened: new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
    send: (m) => ws.send(JSON.stringify(m)),
    last: (t) => [...msgs].reverse().find((m) => m.t === t),
    async waitFor(pred, ms = 5000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const hit = msgs.find(pred);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error('zaman aşımı: beklenen mesaj gelmedi');
    },
  };
  return c;
}

test('WebSocket: sağlık ucu, geçersiz JSON ve aşırı büyük mesaj', async () => {
  const s = await startServer();
  try {
    const res = await new Promise((resolve) => http.get(`http://127.0.0.1:${s.port}/healthz`, (r) => resolve(r.statusCode)));
    assert.equal(res, 200);
    const c = client(s.port);
    await c.opened;
    c.ws.send('{bozuk json');
    await c.waitFor((m) => m.t === 'ERROR' && m.code === 'BAD_MESSAGE');
    c.send({ t: 'PING' });
    await c.waitFor((m) => m.t === 'PONG');
    c.ws.send(JSON.stringify({ t: 'CREATE_ROOM', nickname: 'x'.repeat(20000) }));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(c.closedCode, 1009, 'aşırı büyük mesajda bağlantı kapanır');
  } finally { await s.stop(); }
});

test('WebSocket: hız sınırı aşan istemciye RATE_LIMITED döner', async () => {
  const s = await startServer();
  try {
    const c = client(s.port);
    await c.opened;
    for (let i = 0; i < 200; i++) c.send({ t: 'PING' });
    await c.waitFor((m) => m.t === 'ERROR' && m.code === 'RATE_LIMITED');
  } finally { await s.stop(); }
});

test('WebSocket: 1 insan + 3 bot tam oyunu gerçek soketle bitirir', { timeout: 90000 }, async () => {
  // zamanı sıkıştırılmış botlar saniyede yüzlerce hamle ürettiğinden hız sınırı bu testte gevşetilir
  const s = await startServer({}, { capacity: 100000, refillPerSec: 100000 });
  try {
    const c = client(s.port);
    await c.opened;
    c.send({ t: 'CREATE_ROOM', nickname: 'Serhan' });
    const joined = await c.waitFor((m) => m.t === 'ROOM_JOINED');
    assert.equal(joined.seat, 0);
    c.send({ t: 'START_GAME' });
    let over = null;
    const t0 = Date.now();
    let actedSeq = 0;
    while (!over && Date.now() - t0 < 80000) {
      const gv = c.last('GAME_VIEW');
      const v = gv?.view;
      if (v && v.phase === 'GAME_OVER') { over = v; break; }
      if (v && gv.seq > actedSeq && v.turn === v.seat) { // her görünüm güncellemesine en fazla bir kez karşılık ver
        actedSeq = gv.seq;
        if (v.phase === 'CONTRACT_SELECT') {
          const contract = v.selectable.penalties[0] ?? 'KOZ';
          c.send({ t: 'CHOOSE_CONTRACT', contract, trump: contract === 'KOZ' ? 'H' : undefined });
        } else if (v.phase === 'PLAYING') c.send({ t: 'PLAY_CARD', card: v.legalCards[0] });
      }
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.ok(over, 'oyun bitti');
    assert.equal(over.handResults.length, 20);
    assert.equal(over.scores.reduce((a, b) => a + b, 0), 0);
    assert.equal(c.msgs.filter((m) => m.t === 'ERROR').length, 0, 'hiç hata mesajı yok');
  } finally { await s.stop(); }
});

test('WebSocket: bağlantı kopup token ile dönüş (aynı koltuk, oyun görünümü yeniden gelir)', async () => {
  const s = await startServer({ takeoverMs: 2000, thinkDelayScale: 1 });
  try {
    const a = client(s.port);
    await a.opened;
    a.send({ t: 'CREATE_ROOM', nickname: 'Serhan' });
    const j = await a.waitFor((m) => m.t === 'ROOM_JOINED');
    a.send({ t: 'START_GAME' });
    await a.waitFor((m) => m.t === 'GAME_VIEW');
    a.ws.terminate(); // ani kopma
    await new Promise((r) => setTimeout(r, 100));
    const b = client(s.port);
    await b.opened;
    b.send({ t: 'RESUME', token: j.token });
    const back = await b.waitFor((m) => m.t === 'ROOM_JOINED');
    assert.equal(back.resumed, true);
    assert.equal(back.seat, 0);
    const v = await b.waitFor((m) => m.t === 'GAME_VIEW');
    assert.equal(v.view.seat, 0);
    assert.equal(v.view.myHand.length > 0, true);
  } finally { await s.stop(); }
});
