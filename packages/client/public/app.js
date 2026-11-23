// Giriş noktası: durum + ağ + ekran çizimi. Tüm mantık store.js'te; burada sadece bağlantı ve DOM var.
import { t, setLocale } from './i18n.js';
import { initialState, reduce, nextExpiry, seatName } from './store.js';
import { formatGameLog, logFileName, LOG_STORAGE_KEY } from './gamelog.js';
import { createNet } from './net.js';
import { renderScreen } from './screens.js';

const SESSION_KEY = 'rifki.session';
const root = document.getElementById('app');

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return s && typeof s.token === 'string' ? s : null;
  } catch { return null; }
}
function saveSession(session) {
  try { session ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) : sessionStorage.removeItem(SESSION_KEY); } catch { /* özel pencere */ }
}

setLocale(navigator.language);
document.title = t('app.title');
// Oyun sırasında basılı tutunca tarayıcının bağlam menüsü / metin seçimi çıkmasın (yazı alanları hariç).
document.addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('input, textarea, .log-text')) e.preventDefault();
});
document.addEventListener('selectstart', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('input, textarea, .room-code, .log-text')) e.preventDefault();
});

function loadLastLog() {
  try {
    const d = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || 'null');
    return d && Array.isArray(d.gameLog) && Array.isArray(d.names) ? d : null;
  } catch { return null; }
}

let state = initialState(loadSession());
const hashCode = (location.hash || '').replace('#', '').toUpperCase().slice(0, 5);
const ui = { form: { nickname: localStorage.getItem('rifki.nick') || '', code: /^[A-Z0-9]{5}$/.test(hashCode) ? hashCode : '' }, showScores: false, copied: false, king: false, traitSeat: null, logData: null, logCopied: false, lobbyTraits: {}, logHand: 1, lastLog: loadLastLog() };

let tickTimer = null;
let renderQueued = false;

const net = createNet({
  url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
  getToken: () => state.session?.token ?? null,
  onStatus: (status) => dispatch({ t: '@conn', status }),
  onMessage: (msg) => dispatch(msg),
});

// Oyun biter bitmez kaydı bu cihaza yazar (odadan çıkınca da ana ekrandan açılabilsin).
let loggedFor = null;
function currentLogData() {
  const { view, room } = state;
  if (!view?.gameLog || !room) return null;
  if (loggedFor !== view.gameLog) { loggedFor = view.gameLog; ui.logSavedAt = Date.now(); }
  return { names: [0, 1, 2, 3].map((s) => seatName(room, s)), me: view.seat, code: room.code, savedAt: ui.logSavedAt, scores: view.scores, kingEnd: view.kingEnd, gameLog: view.gameLog };
}
function persistLog() {
  if (!state.view?.gameLog || state.view.gameLog === loggedFor) return;
  const data = currentLogData();
  if (!data) return;
  ui.lastLog = data;
  try { localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(data)); } catch { /* depolama dolu / kapalı */ }
}

function dispatch(msg) {
  const prevSession = state.session;
  state = reduce(state, msg, Date.now());
  if (state.session !== prevSession) saveSession(state.session);
  persistLog();
  if (msg.t === 'LEFT_ROOM' || (msg.t === 'ERROR' && msg.code === 'INVALID_TOKEN')) { ui.showScores = false; ui.traitSeat = null; ui.king = false; ui.logData = null; ui.lobbyTraits = {}; }
  if (state.fatal) net.stop();
  scheduleRender();
  scheduleTick();
}

function scheduleTick() {
  if (tickTimer) clearTimeout(tickTimer);
  const at = nextExpiry(state);
  if (at !== null) tickTimer = setTimeout(() => dispatch({ t: '@tick' }), Math.max(50, at - Date.now() + 20));
}

function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id || !(el instanceof HTMLInputElement)) return null;
  return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
}
function restoreFocus(f) {
  if (!f) return;
  const el = document.getElementById(f.id);
  if (!el) return;
  el.focus();
  try { el.setSelectionRange(f.start, f.end); } catch { /* */ }
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; render(); });
}

function render() {
  const focus = captureFocus();
  const scrollY = window.scrollY;
  root.replaceChildren(renderScreen(state, ui, actions, Date.now()));
  restoreFocus(focus);
  if (scrollY) window.scrollTo(0, scrollY);
}

function localError(code) {
  dispatch({ t: 'ERROR', code });
}

const actions = {
  createRoom() {
    const nickname = ui.form.nickname.trim();
    if (!nickname) return localError('BAD_NICKNAME');
    try { localStorage.setItem('rifki.nick', nickname); } catch { /* */ }
    net.send({ t: 'CREATE_ROOM', nickname });
  },
  joinRoom() {
    const nickname = ui.form.nickname.trim();
    if (!nickname) return localError('BAD_NICKNAME');
    if (!ui.form.code.trim()) return localError('ROOM_NOT_FOUND');
    try { localStorage.setItem('rifki.nick', nickname); } catch { /* */ }
    net.send({ t: 'JOIN_ROOM', code: ui.form.code.trim(), nickname });
  },
  addBot() { net.send({ t: 'ADD_BOT' }); },
  removeBot(seat) { net.send({ t: 'REMOVE_BOT', seat }); },
  startGame() { net.send({ t: 'START_GAME' }); },
  leave(confirmFirst) {
    if (confirmFirst && state.room?.phase === 'PLAYING' && state.view?.phase !== 'GAME_OVER' && !window.confirm(t('game.leaveConfirm'))) return;
    net.send({ t: 'LEAVE_ROOM' });
  },
  playCard(card) { net.send({ t: 'PLAY_CARD', card }); },
  chooseContract(contract, trump) {
    const king = contract === 'KOZ' && ui.king;
    ui.king = false;
    net.send({ t: 'CHOOSE_CONTRACT', contract, ...(trump ? { trump } : {}), ...(king ? { king: true } : {}) });
  },
  openLog() { const d = currentLogData(); if (d) { ui.logData = d; window.scrollTo(0, 0); scheduleRender(); } },
  openStoredLog() { if (ui.lastLog) { ui.logData = ui.lastLog; window.scrollTo(0, 0); scheduleRender(); } },
  selectLogHand(n) { ui.logHand = n; scheduleRender(); },
  closeLog() { ui.logData = null; ui.logCopied = false; scheduleRender(); },
  printLog() { window.print(); },
  async copyLog() {
    try { await navigator.clipboard.writeText(formatGameLog(ui.logData)); ui.logCopied = true; } catch { ui.logCopied = false; }
    scheduleRender();
    setTimeout(() => { ui.logCopied = false; scheduleRender(); }, 1500);
  },
  downloadLog() {
    const blob = new Blob([formatGameLog(ui.logData)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = logFileName(ui.logData);
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  toggleLobbyTraits(seat) { ui.lobbyTraits[seat] = !ui.lobbyTraits[seat]; scheduleRender(); },
  toggleKing() { ui.king = !ui.king; scheduleRender(); },
  toggleTraits(seat) { ui.traitSeat = ui.traitSeat === seat ? null : seat; scheduleRender(); },
  toggleScores() { ui.showScores = !ui.showScores; scheduleRender(); },
  /** Tam ekran: tarayıcının adres/sekme çubuklarını gizler (tablet/telefonda masa büyür). Kullanıcı dokunuşuyla çağrılmalıdır. */
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* desteklenmiyor / reddedildi: sessizce geç */ }
  },
  async copyCode() {
    const code = state.room?.code;
    if (!code) return;
    try { await navigator.clipboard.writeText(`${location.origin}/#${code}`); } catch { /* izin yok */ }
    ui.copied = true;
    scheduleRender();
    setTimeout(() => { ui.copied = false; scheduleRender(); }, 1500);
  },
};

render();
net.start();
