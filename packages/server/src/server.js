// Oyun sunucusu çekirdeği: bağlantılar, oda yönetimi, mesaj yönlendirme.
// Taşıma katmanından bağımsızdır: send(connId, msg), scheduler ve random dışarıdan verilir.
import { Room } from './room.js';
import {
  C2S, S2C, ERR, ServerError, CODE_ALPHABET, CODE_LENGTH, normalizeNickname, normalizeCode, isString,
} from './protocol.js';

export const DEFAULT_CONFIG = {
  takeoverMs: 30_000,        // bağlantısı kopan oyuncu için bekleme, sonra bot devralır
  handPauseMs: 6_000,        // el bitince sonraki ele geçmeden önce bekleme (puanları göstermek için)
  idleRoomMs: 5 * 60_000,    // hiç bağlı insan kalmayan oda ne kadar yaşar (bu sürede botlar oyunu hızla bitirir)
  finishedRoomMs: 5 * 60_000,// biten oyunun odası ne kadar yaşar
  thinkDelayScale: 1,        // bot düşünme süresi çarpanı (testlerde küçültülür)
  simsScale: 1,              // bot simülasyon sayısı çarpanı
};

export function createGameServer({ send, close, scheduler, random, config = {}, log }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const rooms = new Map();   // kod -> Room
  const tokens = new Map();  // token -> Room
  const conns = new Map();   // connId -> { room, seat }

  const ctx = {
    cfg, scheduler, random, log, close,
    send: (connId, msg) => send(connId, msg),
    registerToken: (token, room) => tokens.set(token, room),
    unregisterToken: (token) => tokens.delete(token),
    bindConn: (connId, room, seat) => conns.set(connId, { room, seat }),
    unbindConn: (connId) => conns.delete(connId),
    removeRoom: (room) => rooms.delete(room.code),
  };

  const reply = (connId, msg) => send(connId, msg);
  const fail = (connId, e) => reply(connId, { t: S2C.ERROR, code: e.code, ...(e.detail ? { detail: e.detail } : {}) });

  function newCode() {
    for (let i = 0; i < 50; i++) {
      let code = '';
      for (let j = 0; j < CODE_LENGTH; j++) code += CODE_ALPHABET[random.int(CODE_ALPHABET.length)];
      if (!rooms.has(code)) return code;
    }
    throw new Error('oda kodu üretilemedi');
  }

  function roomOf(connId) {
    const c = conns.get(connId);
    if (!c) throw new ServerError(ERR.NOT_IN_ROOM);
    return c.room;
  }

  function handle(connId, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') throw new ServerError(ERR.BAD_MESSAGE);
    switch (msg.t) {
      case C2S.PING:
        reply(connId, { t: S2C.PONG });
        return;
      case C2S.CREATE_ROOM: {
        if (conns.has(connId)) throw new ServerError(ERR.ALREADY_IN_ROOM);
        const nickname = normalizeNickname(msg.nickname);
        const room = new Room(ctx, newCode());
        rooms.set(room.code, room);
        try { room.addHuman(connId, nickname); } catch (e) { room.destroy(); throw e; }
        return;
      }
      case C2S.JOIN_ROOM: {
        if (conns.has(connId)) throw new ServerError(ERR.ALREADY_IN_ROOM);
        const nickname = normalizeNickname(msg.nickname);
        const room = rooms.get(normalizeCode(msg.code));
        if (!room) throw new ServerError(ERR.ROOM_NOT_FOUND);
        room.addHuman(connId, nickname);
        return;
      }
      case C2S.RESUME: {
        if (conns.has(connId)) throw new ServerError(ERR.ALREADY_IN_ROOM);
        if (!isString(msg.token)) throw new ServerError(ERR.INVALID_TOKEN);
        const room = tokens.get(msg.token);
        const seat = room ? room.seats.findIndex((m) => m && m.kind === 'human' && m.token === msg.token) : -1;
        if (!room || seat === -1) throw new ServerError(ERR.INVALID_TOKEN);
        room.resume(connId, seat);
        return;
      }
      case C2S.LEAVE_ROOM:
        roomOf(connId).leave(connId);
        return;
      case C2S.ADD_BOT:
        roomOf(connId).addBot(connId);
        return;
      case C2S.REMOVE_BOT:
        roomOf(connId).removeBot(connId, msg.seat);
        return;
      case C2S.START_GAME:
        roomOf(connId).start(connId);
        return;
      case C2S.CHOOSE_CONTRACT: {
        if (!isString(msg.contract) || (msg.trump !== undefined && !isString(msg.trump))) throw new ServerError(ERR.BAD_MESSAGE);
        roomOf(connId).command(connId, { type: 'CHOOSE_CONTRACT', contract: msg.contract, trump: msg.trump });
        return;
      }
      case C2S.PLAY_CARD: {
        if (!isString(msg.card)) throw new ServerError(ERR.BAD_MESSAGE);
        roomOf(connId).command(connId, { type: 'PLAY_CARD', card: msg.card });
        return;
      }
      default:
        throw new ServerError(ERR.UNKNOWN_MESSAGE);
    }
  }

  return {
    rooms, tokens, conns, cfg,
    onMessage(connId, msg) {
      try {
        handle(connId, msg);
      } catch (e) {
        if (e instanceof ServerError) fail(connId, e);
        else { log?.('beklenmeyen hata', e); fail(connId, { code: 'INTERNAL' }); }
      }
    },
    onClose(connId) {
      const c = conns.get(connId);
      if (c) c.room.detach(connId);
    },
    shutdown() {
      for (const room of [...rooms.values()]) room.destroy();
    },
  };
}
