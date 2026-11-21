// Test yardımcıları: sahte zamanlayıcı, sahte taşıma, deterministik rastgelelik.
import { createGameServer } from '../src/server.js';

export function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    get now() { return now; },
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    pending: () => timers.size,
    /** ms ilerletir; süre içinde dolan (ve yeni kurulan) zamanlayıcıları sırayla çalıştırır. */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let best = null;
        for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best.t.at)) best = { id, t };
        if (!best) break;
        timers.delete(best.id);
        now = Math.max(now, best.t.at);
        best.t.fn();
      }
      now = end;
    },
  };
}

export function createFakeRandom() {
  let n = 0;
  return {
    hex: (bytes) => { n += 1; return n.toString(16).padStart(bytes * 2, '0'); },
    int: (max) => { n += 1; return (n * 7919) % max; },
  };
}

/** Sahte ağ: her bağlantı bir "istemci"; gelen mesajlar inbox'ta birikir. */
export function createHarness(config = {}) {
  const scheduler = createFakeScheduler();
  const inbox = new Map();
  const closed = new Set();
  const server = createGameServer({
    send: (id, msg) => { (inbox.get(id) ?? inbox.set(id, []).get(id)).push(JSON.parse(JSON.stringify(msg))); },
    close: (id) => closed.add(id),
    scheduler,
    random: createFakeRandom(),
    config: { thinkDelayScale: 1, simsScale: 0.2, ...config },
    log: () => {},
  });
  let nextConn = 1;
  const clients = [];

  function connect() {
    const id = nextConn++;
    inbox.set(id, []);
    const c = {
      id,
      get msgs() { return inbox.get(id); },
      send(msg) { server.onMessage(id, msg); },
      last(type) { return [...inbox.get(id)].reverse().find((m) => m.t === type); },
      all(type) { return inbox.get(id).filter((m) => m.t === type); },
      clear() { inbox.set(id, []); },
      close() { server.onClose(id); },
      get token() { return c.last('ROOM_JOINED')?.token; },
      get seat() { return c.last('ROOM_JOINED')?.seat; },
      get view() { return c.last('GAME_VIEW')?.view; },
      get error() { return c.last('ERROR')?.code; },
    };
    clients.push(c);
    return c;
  }

  /** İnsan oyuncuyu otomatik oynatır: sırası gelince ilk yasal hamleyi yapar. */
  function autoPlay(c) {
    const v = c.view;
    if (!v || v.turn !== v.seat) return false;
    if (v.phase === 'CONTRACT_SELECT') {
      const contract = v.selectable.penalties[0] ?? 'KOZ';
      c.send({ t: 'CHOOSE_CONTRACT', contract, trump: contract === 'KOZ' ? 'S' : undefined });
      return true;
    }
    if (v.phase === 'PLAYING') {
      c.send({ t: 'PLAY_CARD', card: v.legalCards[0] });
      return true;
    }
    return false;
  }

  return { scheduler, server, connect, autoPlay, closed, clients };
}

/** Oda kurup n insan katar; ilk bağlantı oda sahibi. */
export function createRoom(h, nicks) {
  const host = h.connect();
  host.send({ t: 'CREATE_ROOM', nickname: nicks[0] });
  const code = host.last('ROOM_JOINED').code;
  const others = nicks.slice(1).map((n) => {
    const c = h.connect();
    c.send({ t: 'JOIN_ROOM', code, nickname: n });
    return c;
  });
  return { code, host, humans: [host, ...others] };
}
