// Giriş noktası: durum + ağ + ekran çizimi. Tüm mantık store.js'te; burada sadece bağlantı ve DOM var.
import { t, setLocale } from './i18n.js';
import { initialState, reduce, nextExpiry } from './store.js';
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

let state = initialState(loadSession());
const hashCode = (location.hash || '').replace('#', '').toUpperCase().slice(0, 5);
const ui = { form: { nickname: localStorage.getItem('rifki.nick') || '', code: /^[A-Z0-9]{5}$/.test(hashCode) ? hashCode : '' }, showScores: false, copied: false, king: false, traitSeat: null };

let tickTimer = null;
let renderQueued = false;

const net = createNet({
  url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
  getToken: () => state.session?.token ?? null,
  onStatus: (status) => dispatch({ t: '@conn', status }),
  onMessage: (msg) => dispatch(msg),
});

function dispatch(msg) {
  const prevSession = state.session;
  state = reduce(state, msg, Date.now());
  if (state.session !== prevSession) saveSession(state.session);
  if (msg.t === 'LEFT_ROOM' || (msg.t === 'ERROR' && msg.code === 'INVALID_TOKEN')) { ui.showScores = false; ui.traitSeat = null; ui.king = false; }
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
  toggleKing() { ui.king = !ui.king; scheduleRender(); },
  toggleTraits(seat) { ui.traitSeat = ui.traitSeat === seat ? null : seat; scheduleRender(); },
  toggleScores() { ui.showScores = !ui.showScores; scheduleRender(); },
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
