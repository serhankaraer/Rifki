// Ekranlar: ana ekran, lobi, masa. Her fonksiyon (state, ui, actions, now) alıp DOM düğümü döner.
import { h } from './ui.js';
import { t } from './i18n.js';
import { SUIT_SYMBOL, SUITS, parseCard, isRed, relativePositions } from './cards.js';
import { seatName, activeTrick } from './store.js';

const CONTRACT_ORDER = ['RIFKI', 'KIZ', 'ERKEK', 'KUPA', 'SON_IKI', 'EL_ALMAZ'];
const TRAIT_ORDER = ['risk', 'tracking', 'inference', 'lookahead', 'handEval', 'scoreAwareness', 'aggression', 'consistency', 'thinkSpeed'];
const TOTAL_HANDS = 20;

// ---------- ortak ----------
function cardFace(card, extra = '') {
  const { rank, suit } = parseCard(card);
  return h('span', { class: `card ${isRed(suit) ? 'red' : 'black'} ${extra}`.trim(), 'aria-label': `${rank} ${t('suit.' + suit)}` },
    h('span', { class: 'rank' }, rank),
    h('span', { class: 'suit' }, SUIT_SYMBOL[suit]));
}

function contractText(contract) {
  if (!contract) return t('game.noContract');
  return contract.type === 'KOZ' ? `${t('contract.KOZ')} ${SUIT_SYMBOL[contract.trump]}` : t(`contract.${contract.type}`);
}

function toasts(state) {
  return h('div', { class: 'toasts', 'aria-live': 'polite' },
    state.toasts.map((x) => h('div', { class: `toast ${x.kind}` }, t(x.key, x.params))));
}

function connBanner(state) {
  if (state.conn === 'open') return null;
  return h('div', { class: 'banner' }, t(state.conn === 'connecting' ? 'conn.connecting' : 'conn.reconnecting'));
}

function fatalScreen(state) {
  return h('main', { class: 'center-card' }, h('h1', null, t('app.title')), h('p', { class: 'error-text' }, t(`conn.fatal.${state.fatal}`)));
}

// ---------- ana ekran ----------
export function homeScreen(state, ui, actions) {
  const busy = state.conn !== 'open';
  const nick = h('input', { id: 'nickname', type: 'text', maxLength: 20, autocomplete: 'nickname', placeholder: t('home.nicknamePlaceholder'), value: ui.form.nickname,
    onInput: (e) => { ui.form.nickname = e.target.value; } });
  const code = h('input', { id: 'code', type: 'text', maxLength: 5, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'ABCDE', value: ui.form.code,
    onInput: (e) => { ui.form.code = e.target.value.toUpperCase(); e.target.value = ui.form.code; } });
  return h('main', { class: 'center-card' },
    connBanner(state),
    h('h1', null, t('app.title')),
    h('p', { class: 'muted' }, t('home.subtitle')),
    h('label', { for: 'nickname' }, t('home.nickname')), nick,
    h('button', { id: 'create', class: 'primary', disabled: busy, onClick: () => actions.createRoom() }, t('home.createRoom')),
    h('div', { class: 'divider' }, t('home.or')),
    h('label', { for: 'code' }, t('home.roomCode')), code,
    h('button', { id: 'join', disabled: busy, onClick: () => actions.joinRoom() }, t('home.join')),
    h('p', { class: 'muted small' }, t('home.hint')),
    toasts(state));
}

// ---------- lobi ----------
function traitBars(traits) {
  return h('div', { class: 'traits' },
    TRAIT_ORDER.map((k) => h('div', { class: 'trait' },
      h('span', { class: 'trait-name' }, t(`trait.${k}`)),
      h('span', { class: 'bar' }, h('span', { class: 'fill', style: { width: `${traits[k]}%` } })),
      h('span', { class: 'trait-val' }, traits[k]))));
}

export function lobbyScreen(state, ui, actions) {
  const { room, session } = state;
  const isHost = room.hostSeat === session.seat;
  const full = room.seats.every((s) => s.kind !== 'empty');
  const rows = room.seats.map((s, i) => {
    if (s.kind === 'empty') return h('li', { class: 'seat empty' }, h('span', { class: 'seat-no' }, t('lobby.seat', { n: i + 1 })), h('span', { class: 'muted' }, t('lobby.empty')));
    if (s.kind === 'human') {
      return h('li', { class: 'seat human' },
        h('span', { class: 'seat-no' }, t('lobby.seat', { n: i + 1 })),
        h('span', { class: 'seat-name' }, s.nickname),
        i === session.seat ? h('span', { class: 'chip' }, t('lobby.you')) : null,
        i === room.hostSeat ? h('span', { class: 'chip host' }, `★ ${t('lobby.host')}`) : null,
        !s.connected ? h('span', { class: 'chip warn' }, t('lobby.offline')) : null);
    }
    return h('li', { class: 'seat bot' },
      h('div', { class: 'seat-head' },
        h('span', { class: 'seat-no' }, t('lobby.seat', { n: i + 1 })),
        h('span', { class: 'seat-name' }, s.name),
        h('span', { class: 'chip' }, `🤖 ${t('lobby.bot')}`),
        isHost ? h('button', { class: 'small danger', onClick: () => actions.removeBot(i) }, t('lobby.removeBot')) : null),
      traitBars(s.traits));
  });
  return h('main', { class: 'lobby' },
    connBanner(state),
    h('header', { class: 'lobby-head' },
      h('div', null, h('div', { class: 'muted small' }, t('lobby.code')), h('div', { id: 'room-code', class: 'room-code' }, room.code)),
      h('button', { id: 'copy', onClick: () => actions.copyCode() }, ui.copied ? t('lobby.copied') : t('lobby.copy'))),
    h('ul', { class: 'seats' }, rows),
    h('p', { class: 'muted small' }, t('lobby.traits')),
    h('div', { class: 'actions' },
      isHost ? h('button', { id: 'add-bot', disabled: full, onClick: () => actions.addBot() }, t('lobby.addBot')) : null,
      isHost ? h('button', { id: 'start', class: 'primary', onClick: () => actions.startGame() }, t('lobby.start')) : null,
      h('button', { id: 'leave', class: 'danger', onClick: () => actions.leave(false) }, t('lobby.leave'))),
    isHost ? h('p', { class: 'muted small' }, t('lobby.startHint')) : h('p', { class: 'muted' }, t('lobby.waitHost')),
    toasts(state));
}

// ---------- masa ----------
function seatPanel(state, seat, pos) {
  const { view, room } = state;
  const s = room.seats[seat];
  const myTurn = view.turn === seat && (view.phase === 'PLAYING' || view.phase === 'CONTRACT_SELECT');
  const thinking = state.thinking && state.thinking.seat === seat;
  const isBot = s.kind === 'bot' || s.botControlled;
  const ledger = view.ledger;
  return h('div', { class: `seat-panel pos-${pos} ${myTurn ? 'turn' : ''}`, dataset: { seat } },
    h('div', { class: 'sp-name' },
      isBot ? '🤖 ' : '', seatName(room, seat),
      seat === view.seat ? h('span', { class: 'chip' }, t('game.you')) : null),
    h('div', { class: 'sp-line' },
      h('span', { class: `score ${view.scores[seat] < 0 ? 'neg' : 'pos'}` }, view.scores[seat]),
      h('span', { class: 'muted small' }, t('game.cards', { n: view.handSizes[seat] }))),
    h('div', { class: 'sp-line muted small' }, t('game.rights', { koz: 2 - ledger.koz[seat], ceza: 3 - ledger.ceza[seat] })),
    h('div', { class: 'sp-badges' },
      seat === view.declarer ? h('span', { class: 'chip host' }, t('game.declarer')) : null,
      s.kind === 'human' && !s.connected ? h('span', { class: 'chip warn' }, t('game.offline')) : null,
      s.kind === 'human' && s.botControlled ? h('span', { class: 'chip' }, t('game.botControlled')) : null,
      thinking ? h('span', { class: 'chip think' }, t('game.thinking')) : null));
}

function trickArea(state, now) {
  const { view, room } = state;
  const { plays, winner, finished } = activeTrick(state, now);
  const pos = relativePositions(view.seat);
  const slot = (name) => {
    const seat = pos[name];
    const play = plays.find((p) => p.seat === seat);
    return h('div', { class: `slot slot-${name} ${finished && winner === seat ? 'winner' : ''}` }, play ? cardFace(play.card) : null);
  };
  return h('div', { class: 'trick' }, ['top', 'left', 'right', 'bottom'].map(slot),
    finished ? h('div', { class: 'trick-note' }, t('game.tookBy', { name: seatName(room, winner) })) : null);
}

function contractChooser(state, actions) {
  const sel = state.view.selectable;
  const uses = state.view.ledger.typeUses;
  return h('div', { class: 'chooser', id: 'chooser' },
    h('h3', null, t('game.chooseContract')),
    h('div', { class: 'contract-grid' },
      CONTRACT_ORDER.map((c) => {
        const ok = sel.penalties.includes(c);
        return h('button', { class: 'contract', dataset: { contract: c }, disabled: !ok, onClick: () => actions.chooseContract(c) },
          h('strong', null, t(`contract.${c}`)),
          h('span', { class: 'small' }, t(`contract.desc.${c}`)),
          h('span', { class: 'small muted' }, t('game.usesLeft', { n: 2 - uses[c] })));
      })),
    h('div', { class: 'koz-row' },
      h('div', { class: 'small muted' }, `${t('contract.KOZ')} — ${t('contract.desc.KOZ')}`),
      h('div', { class: 'suit-buttons' },
        SUITS.map((s) => h('button', { class: `suit-btn ${isRed(s) ? 'red' : ''}`, dataset: { trump: s }, disabled: !sel.koz, title: t(`suit.${s}`), 'aria-label': `${t('contract.KOZ')} ${t('suit.' + s)}`,
          onClick: () => actions.chooseContract('KOZ', s) }, SUIT_SYMBOL[s])))));
}

function handResultCard(state) {
  const { view, room } = state;
  const r = view.handResults[view.handResults.length - 1];
  return h('div', { class: 'result' },
    h('h3', null, `${t('game.handScored')} — ${contractText(r.contract)}`),
    h('ul', null, r.deltas.map((d, i) => h('li', null, h('span', null, seatName(room, i)), h('span', { class: d < 0 ? 'neg' : 'pos' }, d > 0 ? `+${d}` : d)))),
    view.phase === 'HAND_SCORED' ? h('p', { class: 'muted small' }, t('game.nextHandSoon')) : null);
}

function gameOverCard(state, actions) {
  const { view, room } = state;
  const max = Math.max(...view.scores);
  const order = [0, 1, 2, 3].sort((a, b) => view.scores[b] - view.scores[a]);
  return h('div', { class: 'result final', id: 'game-over' },
    h('h3', null, t('game.gameOver')),
    h('ol', null, order.map((i) => h('li', { class: view.scores[i] === max ? 'win' : '' },
      h('span', null, `${view.scores[i] === max ? '🏆 ' : ''}${seatName(room, i)}`),
      h('span', { class: view.scores[i] < 0 ? 'neg' : 'pos' }, view.scores[i])))),
    h('button', { class: 'primary', onClick: () => actions.leave(false) }, t('game.back')));
}

function centerArea(state, actions, now) {
  const { view, room } = state;
  if (view.phase === 'GAME_OVER') return gameOverCard(state, actions);
  if (view.phase === 'CONTRACT_SELECT') {
    if (view.turn === view.seat) return h('div', { class: 'status mine' }, t('game.chooseBelow')); // seçim paneli masanın altında, tam genişlikte
    return h('div', { class: 'status' }, t('game.chooses', { name: seatName(room, view.turn) }));
  }
  if (view.phase === 'HAND_SCORED' && !(state.shownTrick && state.shownTrick.until > now)) return handResultCard(state);
  return trickArea(state, now);
}

function lastTrick(state) {
  const { view, room } = state;
  const last = view.trickHistory[view.trickHistory.length - 1];
  if (!last || view.phase !== 'PLAYING') return null;
  return h('div', { class: 'last-trick small muted' }, `${t('game.lastTrick')}: `,
    last.plays.map((p) => h('span', { class: 'lt-card' }, cardFace(p.card, 'mini'))), ` → ${t('game.tookBy', { name: seatName(room, last.winner) })}`);
}

function myHand(state, actions) {
  const { view } = state;
  const legal = new Set(view.legalCards ?? []);
  const yourTurn = view.phase === 'PLAYING' && view.turn === view.seat;
  return h('div', { class: `hand ${yourTurn ? 'active' : ''}`, id: 'hand' },
    view.myHand.map((c) => {
      const ok = legal.has(c);
      const { suit, rank } = parseCard(c);
      return h('button', { class: `card-btn ${isRed(suit) ? 'red' : 'black'} ${ok ? 'legal' : ''}`, dataset: { card: c }, disabled: !ok,
        'aria-label': `${rank} ${t('suit.' + suit)}`, onClick: () => actions.playCard(c) },
        h('span', { class: 'rank' }, rank), h('span', { class: 'suit' }, SUIT_SYMBOL[suit]));
    }));
}

function scoreboard(state, actions) {
  const { view, room } = state;
  const names = [0, 1, 2, 3].map((i) => seatName(room, i));
  return h('div', { class: 'overlay', id: 'scoreboard', onClick: (e) => { if (e.target.classList.contains('overlay')) actions.toggleScores(); } },
    h('div', { class: 'modal' },
      h('h3', null, t('game.scores')),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, t('game.col.hand')), h('th', null, t('game.col.chooser')), h('th', null, t('game.col.contract')), names.map((n) => h('th', null, n)))),
        h('tbody', null, view.handResults.map((r) => h('tr', null,
          h('td', null, r.handNo), h('td', null, seatName(room, r.declarer)), h('td', null, contractText(r.contract)),
          r.deltas.map((d) => h('td', { class: d < 0 ? 'neg' : d > 0 ? 'pos' : '' }, d))))),
        h('tfoot', null, h('tr', null, h('td', { colSpan: 3 }, t('game.total')), view.scores.map((s) => h('td', { class: s < 0 ? 'neg' : 'pos' }, s)))))),
      h('button', { onClick: () => actions.toggleScores() }, t('game.close'))));
}

export function tableScreen(state, ui, actions, now) {
  const { view, room } = state;
  const pos = relativePositions(view.seat);
  const yourTurn = view.turn === view.seat && (view.phase === 'PLAYING' || view.phase === 'CONTRACT_SELECT');
  return h('main', { class: 'game' },
    connBanner(state),
    h('header', { class: 'topbar' },
      h('span', { class: 'hand-no' }, t('game.hand', { n: view.handNo, total: TOTAL_HANDS })),
      h('span', { class: 'contract-badge', id: 'contract-badge' }, contractText(view.contract)),
      h('span', { class: `turn-note ${yourTurn ? 'mine' : ''}` }, yourTurn ? t('game.yourTurn') : (view.turn !== null && view.turn !== undefined ? t('game.waitingFor', { name: seatName(room, view.turn) }) : '')),
      h('button', { id: 'show-scores', class: 'small', onClick: () => actions.toggleScores() }, t('game.scores')),
      h('button', { id: 'leave', class: 'small danger', onClick: () => actions.leave(true) }, t('game.leave'))),
    h('div', { class: 'board' },
      seatPanel(state, pos.top, 'top'), seatPanel(state, pos.left, 'left'), seatPanel(state, pos.right, 'right'),
      h('div', { class: 'center' }, centerArea(state, actions, now)),
      seatPanel(state, pos.bottom, 'bottom')),
    view.phase === 'CONTRACT_SELECT' && view.turn === view.seat ? h('div', { class: 'chooser-wrap' }, contractChooser(state, actions)) : null,
    lastTrick(state),
    myHand(state, actions),
    ui.showScores ? scoreboard(state, actions) : null,
    toasts(state));
}

export function loadingScreen(state) {
  return h('main', { class: 'center-card' }, connBanner(state), h('p', { class: 'muted' }, t('game.loading')), toasts(state));
}

export function renderScreen(state, ui, actions, now) {
  if (state.fatal) return fatalScreen(state);
  if (!state.session || !state.room) return homeScreen(state, ui, actions);
  if (state.room.phase === 'LOBBY') return lobbyScreen(state, ui, actions);
  if (!state.view) return loadingScreen(state);
  return tableScreen(state, ui, actions, now);
}
