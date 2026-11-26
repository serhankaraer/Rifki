// İstemci <-> sunucu mesaj sözleşmesi (JSON). Sunucu metin üretmez: sadece olay/hata KODLARI gönderir.

// İstemci -> sunucu
export const C2S = {
  CREATE_ROOM: 'CREATE_ROOM',       // { nickname }
  JOIN_ROOM: 'JOIN_ROOM',           // { code, nickname }
  RESUME: 'RESUME',                 // { token }  (bağlantı koptuktan sonra aynı koltuğa dönüş)
  LEAVE_ROOM: 'LEAVE_ROOM',         // {}
  ADD_BOT: 'ADD_BOT',               // {}  (yalnız oda sahibi, lobide)
  REMOVE_BOT: 'REMOVE_BOT',         // { seat }
  FILL_BOTS: 'FILL_BOTS',           // { band: 1|2|3 }  boş koltukları 3'lü seviye aralığındaki arketiplerle doldurur (1: çok zayıf–orta, 2: zayıf–güçlü, 3: orta–çok güçlü)
  START_GAME: 'START_GAME',         // {}  boş koltuklar botla doldurulur
  CHOOSE_CONTRACT: 'CHOOSE_CONTRACT', // { contract, trump? }
  PLAY_CARD: 'PLAY_CARD',           // { card }
  PING: 'PING',
};

// Sunucu -> istemci
export const S2C = {
  ROOM_JOINED: 'ROOM_JOINED',   // { code, seat, token, nickname, resumed }
  ROOM_STATE: 'ROOM_STATE',     // { code, phase, hostSeat, seats[] }  (lobi + bağlantı durumu)
  GAME_VIEW: 'GAME_VIEW',       // { seq, view, events[] }  (viewFor çıktısı: yalnız o koltuğun görebildikleri)
  SEAT_EVENT: 'SEAT_EVENT',     // { event, seat, ... }  DISCONNECTED | RECONNECTED | BOT_TOOK_OVER | CONTROL_RETURNED | LEFT | TIMEOUT_PLAY
  BOT_THINKING: 'BOT_THINKING', // { seat, delayMs }
  TURN_TIMER: 'TURN_TIMER',     // { seat, ms }  insan oyuncunun hamle süresi: ms sonra yerine bot oynar
  LEFT_ROOM: 'LEFT_ROOM',
  ERROR: 'ERROR',               // { code, detail? }
  PONG: 'PONG',
};

// Hata kodları (istemcide dil dosyasından çevrilir). Motor kuralları da aynen iletilir (ILLEGAL_CARD, NOT_YOUR_TURN, ...).
export const ERR = {
  BAD_MESSAGE: 'BAD_MESSAGE',
  UNKNOWN_MESSAGE: 'UNKNOWN_MESSAGE',
  BAD_NICKNAME: 'BAD_NICKNAME',
  NICKNAME_TAKEN: 'NICKNAME_TAKEN',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_IN_PROGRESS: 'ROOM_IN_PROGRESS',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  NOT_HOST: 'NOT_HOST',
  NOT_IN_LOBBY: 'NOT_IN_LOBBY',
  NOT_PLAYING: 'NOT_PLAYING',
  NOT_A_BOT_SEAT: 'NOT_A_BOT_SEAT',
  SEAT_BOT_CONTROLLED: 'SEAT_BOT_CONTROLLED', // bot devraldı; koltuk bir sonraki elin başında geri alınır
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_REPLACED: 'SESSION_REPLACED',
  RATE_LIMITED: 'RATE_LIMITED',
};

export class ServerError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'ServerError';
    this.code = code;
    this.detail = detail;
  }
}

export const NICKNAME_MAX = 20;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // karışan karakterler (0/O, 1/I) yok
export const CODE_LENGTH = 5;

export function normalizeNickname(raw) {
  if (typeof raw !== 'string') throw new ServerError(ERR.BAD_NICKNAME);
  const v = raw.replace(/\s+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (v.length < 1 || v.length > NICKNAME_MAX || /[\u0000-\u001f\u007f]/.test(v)) throw new ServerError(ERR.BAD_NICKNAME);
  return v;
}

export const nickKey = (n) => n.toLocaleLowerCase('tr');

export function normalizeCode(raw) {
  if (typeof raw !== 'string') throw new ServerError(ERR.ROOM_NOT_FOUND);
  return raw.trim().toLocaleUpperCase('en-US');
}

export const isString = (v) => typeof v === 'string' && v.length > 0 && v.length < 64;
