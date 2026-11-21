// İstemci durumu: saf indirgeyici (reducer). DOM'a dokunmaz -> Node'da test edilir.
// Sunucudan gelen her mesaj ve yerel olaylar reduce(state, msg, now) ile yeni durum üretir.

export const TOAST_MS = 6000;
export const ERROR_MS = 5000;
export const TRICK_SHOW_MS = 2200; // biten turun masada görünme süresi

export function initialState(session = null) {
  return {
    conn: 'connecting', // connecting | open | reconnecting
    session,            // { code, seat, token, nickname } | null
    room: null,         // son ROOM_STATE
    view: null,         // son GAME_VIEW.view (viewFor çıktısı)
    seq: 0,
    thinking: null,     // { seat, delayMs, since }
    shownTrick: null,   // { plays, winner, until }
    toasts: [],         // { id, key, params, kind, until }
    nextToastId: 1,
    fatal: null,        // 'SESSION_REPLACED' gibi: yeniden bağlanma yok
  };
}

export function seatName(room, seat) {
  const s = room?.seats?.[seat];
  if (!s) return '?';
  return s.kind === 'human' ? s.nickname : s.kind === 'bot' ? s.name : '?';
}

function addToast(state, key, params, kind, now, ms) {
  const toast = { id: state.nextToastId, key, params, kind, until: now + ms };
  return { ...state, nextToastId: state.nextToastId + 1, toasts: [...state.toasts.slice(-3), toast] };
}

const RESET = { session: null, room: null, view: null, seq: 0, thinking: null, shownTrick: null };

export function reduce(state, msg, now = Date.now()) {
  switch (msg.t) {
    case '@conn':
      return { ...state, conn: msg.status };

    case '@tick':
      return pruneExpired(state, now);

    case 'ROOM_JOINED':
      return { ...state, session: { code: msg.code, seat: msg.seat, token: msg.token, nickname: msg.nickname } };

    case 'ROOM_STATE':
      return { ...state, room: { code: msg.code, phase: msg.phase, hostSeat: msg.hostSeat, seats: msg.seats } };

    case 'GAME_VIEW': {
      if (msg.seq < state.seq) return state; // eski görünüm
      let next = { ...state, view: msg.view, seq: msg.seq, thinking: null };
      for (const e of msg.events ?? []) {
        if (e.type === 'TRICK_WON') next.shownTrick = { plays: e.plays, winner: e.winner, until: now + TRICK_SHOW_MS };
      }
      return next;
    }

    case 'BOT_THINKING':
      return { ...state, thinking: { seat: msg.seat, delayMs: msg.delayMs, since: now } };

    case 'SEAT_EVENT': {
      const params = { name: seatName(state.room, msg.seat), sec: Math.round((msg.takeoverMs ?? 0) / 1000) };
      const kind = msg.event === 'DISCONNECTED' || msg.event === 'BOT_TOOK_OVER' || msg.event === 'LEFT' ? 'warn' : 'info';
      return addToast(state, `seat.event.${msg.event}`, params, kind, now, TOAST_MS);
    }

    case 'LEFT_ROOM':
      return { ...state, ...RESET };

    case 'ERROR': {
      if (msg.code === 'SESSION_REPLACED') return { ...state, fatal: 'SESSION_REPLACED' };
      let next = state;
      if (msg.code === 'INVALID_TOKEN') next = { ...state, ...RESET };
      const known = msg.code && msg.code !== 'INTERNAL' ? `error.${msg.code}` : 'error.INTERNAL';
      return addToast(next, known, { code: msg.code }, 'error', now, ERROR_MS);
    }

    default:
      return state;
  }
}

export function pruneExpired(state, now) {
  const toasts = state.toasts.filter((x) => x.until > now);
  const shownTrick = state.shownTrick && state.shownTrick.until > now ? state.shownTrick : null;
  if (toasts.length === state.toasts.length && shownTrick === state.shownTrick) return state;
  return { ...state, toasts, shownTrick };
}

/** Bir sonraki süre bitimi (ms, mutlak zaman) ya da null. */
export function nextExpiry(state) {
  const times = state.toasts.map((x) => x.until);
  if (state.shownTrick) times.push(state.shownTrick.until);
  return times.length ? Math.min(...times) : null;
}

/** Masada gösterilecek tur: yeni biten tur kısa süre kalır, sonra sürmekte olan tur. */
export function activeTrick(state, now) {
  if (state.shownTrick && state.shownTrick.until > now) {
    return { plays: state.shownTrick.plays, winner: state.shownTrick.winner, finished: true };
  }
  return { plays: state.view?.trick?.plays ?? [], winner: null, finished: false };
}
