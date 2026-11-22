// İstemci durumu: saf indirgeyici (reducer). DOM'a dokunmaz -> Node'da test edilir.
// Sunucudan gelen her mesaj ve yerel olaylar reduce(state, msg, now) ile yeni durum üretir.

export const TOAST_MS = 6000;
export const ERROR_MS = 5000;
export const TRICK_SHOW_MS = 2200; // biten turun masada görünme süresi
export const REVEAL_MS = 10_000;   // Rıfkı'da bozulan elde tetikleyen oyuncuların kartlarının açık kalma süresi
export const COUNTDOWN_MS = 10_000; // insan hamle süresinin son kısmı: geri sayım çubuğu bu kadar süre görünür

export function initialState(session = null) {
  return {
    conn: 'connecting', // connecting | open | reconnecting
    session,            // { code, seat, token, nickname } | null
    room: null,         // son ROOM_STATE
    view: null,         // son GAME_VIEW.view (viewFor çıktısı)
    seq: 0,
    thinking: null,     // { seat, delayMs, since }
    shownTrick: null,   // { plays, winner, until }
    turnTimer: null,    // { seat, until }  insan oyuncunun hamle süresi (bitince yerine bot oynar)
    reveal: null,       // { until, declarer, reveals: [{seat, hand}] }  Rıfkı el bozulması
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

const RESET = { session: null, room: null, view: null, seq: 0, thinking: null, shownTrick: null, turnTimer: null, reveal: null };

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
      let next = { ...state, view: msg.view, seq: msg.seq, thinking: null, turnTimer: null };
      for (const e of msg.events ?? []) {
        if (e.type === 'TRICK_WON') next.shownTrick = { plays: e.plays, winner: e.winner, until: now + TRICK_SHOW_MS };
        if (e.type === 'REDEALT') {
          const reveals = e.reveals ?? [];
          if (reveals.length) next.reveal = { until: now + REVEAL_MS, declarer: e.declarer, reveals }; // açık kartlar penceresi bildirimin kendisidir
          else next = addToast(next, 'game.redealt', {}, 'info', now, TOAST_MS);
        }
      }
      return next;
    }

    case 'TURN_TIMER':
      return { ...state, turnTimer: { seat: msg.seat, until: now + msg.ms } };

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
  const reveal = state.reveal && state.reveal.until > now ? state.reveal : null;
  const turnTimer = state.turnTimer && state.turnTimer.until + 3000 > now ? state.turnTimer : null;
  if (toasts.length === state.toasts.length && shownTrick === state.shownTrick && reveal === state.reveal && turnTimer === state.turnTimer) return state;
  return { ...state, toasts, shownTrick, reveal, turnTimer };
}

/** Bir sonraki süre bitimi / saniye geçişi (ms, mutlak zaman) ya da null. */
export function nextExpiry(state, now = Date.now()) {
  const times = state.toasts.map((x) => x.until);
  if (state.shownTrick) times.push(state.shownTrick.until);
  const nextSecond = (left) => now + (left % 1000 || 1000);
  if (state.reveal) times.push(nextSecond(state.reveal.until - now));
  const tt = state.turnTimer;
  if (tt) {
    const left = tt.until - now;
    if (left > COUNTDOWN_MS) times.push(tt.until - COUNTDOWN_MS);
    else if (left > 0) times.push(nextSecond(left));
    else times.push(tt.until + 3000);
  }
  return times.length ? Math.min(...times) : null;
}

/** Geri sayım çubuğu: sırası olan insan oyuncunun son 10 sn'si. Kalan tam saniye (yukarı yuvarlanır) ya da null. */
export function turnCountdown(state, seat, now) {
  const tt = state.turnTimer;
  if (!tt || tt.seat !== seat) return null;
  const left = tt.until - now;
  if (left > COUNTDOWN_MS || left <= 0) return null;
  return { sec: Math.ceil(left / 1000), leftMs: left };
}

/** Rıfkı el bozulması: açık kartların kalan süresi (ms) ya da null. */
export function revealLeft(state, now) {
  if (!state.reveal) return null;
  const left = state.reveal.until - now;
  return left > 0 ? left : null;
}

/** Masada gösterilecek tur: yeni biten tur kısa süre kalır, sonra sürmekte olan tur. */
export function activeTrick(state, now) {
  if (state.shownTrick && state.shownTrick.until > now) {
    return { plays: state.shownTrick.plays, winner: state.shownTrick.winner, finished: true };
  }
  return { plays: state.view?.trick?.plays ?? [], winner: null, finished: false };
}

/** Köşede hep görünen "son oynanan el": merkezde biten tur gösteriliyorsa bir önceki, değilse en son biten tur. */
export function lastTrick(state, now) {
  const hist = state.view?.trickHistory ?? [];
  const showing = state.shownTrick && state.shownTrick.until > now;
  return (showing ? hist[hist.length - 2] : hist[hist.length - 1]) ?? null;
}
