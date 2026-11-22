// Ekranlar: ana ekran, lobi, masa. Her fonksiyon (state, ui, actions, now) alıp DOM düğümü döner.
import { h } from './ui.js';
import { t } from './i18n.js';
import { SUIT_SYMBOL, SUITS, parseCard, isRed, relativePositions, groupHand } from './cards.js';
import { buildSheet, finalStandings, SHEET_CEZA_RIGHTS, SHEET_KOZ_RIGHTS } from './sheet.js';
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
// Düzen kuralları (kayma olmaması için): her bölgenin boyutu sabit; bildirim/seçim/sonuç katmanları mutlak konumlu;
// görünmesi ve kaybolması gereken her şeyin yeri baştan ayrılmıştır (visibility ile gizlenir).

function cardBack(extra = '') {
  return h('span', { class: `card back ${extra}`.trim(), 'aria-hidden': 'true' });
}

/** Açık duran ceza kartları: üst üste binen küçük yüzü açık kartlar. */
function penaltyRow(cards, owner) {
  return h('div', { class: 'pen-row', dataset: { penalty: owner }, 'aria-label': t('game.penaltyCards') },
    cards.map((c) => cardFace(c, 'mini')));
}

/** El almaz: alınan el sayısı önde tek yatay kart + sarı rakam olarak görünür (herkese açık). */
function tricksRow(n, owner) {
  return h('div', { class: 'pen-row tricks-row', dataset: { tricks: n, penalty: owner }, 'aria-label': `${t('game.tricksTaken')}: ${n}` },
    n > 0 ? cardBack('mini land') : null, // tek kart, yatay; alınan el sayısı sarı rakamla (0 iken gösterilmez, yer ayrılı kalır)
    n > 0 ? h('div', { class: 'count' }, `${n}`) : null);
}

function seatPanel(state, seat, pos, trickInfo) {
  const { view, room } = state;
  const s = room.seats[seat];
  const myTurn = view.turn === seat && (view.phase === 'PLAYING' || view.phase === 'CONTRACT_SELECT');
  const thinking = state.thinking && state.thinking.seat === seat;
  const isBot = s.kind === 'bot' || s.botControlled;
  const offline = s.kind === 'human' && !s.connected;
  const took = trickInfo.finished && trickInfo.winner === seat;
  const isMe = seat === view.seat;
  const backs = isMe ? null : h('div', { class: 'backs', 'aria-label': `${view.handSizes[seat]}` },
    Array.from({ length: view.handSizes[seat] }, () => cardBack('tiny')));
  return h('div', { class: `seat-panel pos-${pos} ${myTurn ? 'turn' : ''} ${took ? 'took' : ''}`.trim(), dataset: { seat } },
    h('div', { class: 'sp-name' }, h('span', { class: 'sp-label' }, seatName(room, seat))),
    h('div', { class: 'sp-icons' },
      h('span', { class: `ico ${isBot ? '' : 'off'}`, title: t('game.bot') }, '🤖'),
      h('span', { class: `ico ${seat === view.declarer ? '' : 'off'}`, title: t('game.declarer') }, '★'),
      h('span', { class: `ico ${offline ? '' : 'off'}`, title: t('game.offline') }, '📴'),
      h('span', { class: `think ${thinking ? 'on' : ''}`, role: 'img', 'aria-label': t('game.thinking'), dataset: { thinking: thinking ? '1' : '0' } },
        h('i'), h('i'), h('i'))),
    backs,
    view.contract?.type === 'EL_ALMAZ' ? tricksRow(view.tricksTaken?.[seat] ?? 0, seat) : penaltyRow(view.penaltyTaken?.[seat] ?? [], seat));
}

function trickArea(state, trickInfo) {
  const { view } = state;
  const { plays, winner, finished } = trickInfo;
  const pos = relativePositions(view.seat);
  const slot = (name) => {
    const seat = pos[name];
    const play = plays.find((p) => p.seat === seat);
    return h('div', { class: `slot slot-${name} ${finished && winner === seat ? 'winner' : ''}`.trim() }, play ? cardFace(play.card) : null);
  };
  return h('div', { class: 'trick' }, ['top', 'left', 'right', 'bottom'].map(slot));
}

function contractChooser(state, actions) {
  const sel = state.view.selectable;
  const uses = state.view.ledger.typeUses;
  return h('div', { class: 'overlay-in', id: 'chooser-layer' },
    h('div', { class: 'chooser', id: 'chooser' },
      h('h3', null, t('game.chooseContract')),
      h('div', { class: 'contract-grid' },
        CONTRACT_ORDER.map((c) => {
          const ok = sel.penalties.includes(c);
          return h('button', { class: 'contract', dataset: { contract: c }, disabled: !ok, onClick: () => actions.chooseContract(c) },
            h('strong', null, t(`contract.${c}`)),
            h('span', { class: 'small desc' }, t(`contract.desc.${c}`)),
            h('span', { class: 'small muted' }, t('game.usesLeft', { n: 2 - uses[c] })));
        })),
      h('div', { class: 'koz-row' },
        h('div', { class: 'small muted' }, `${t('contract.KOZ')} — ${t('contract.desc.KOZ')}`),
        h('div', { class: 'suit-buttons' },
          SUITS.map((s) => h('button', { class: `suit-btn ${isRed(s) ? 'red' : ''}`, dataset: { trump: s }, disabled: !sel.koz, title: t(`suit.${s}`), 'aria-label': `${t('contract.KOZ')} ${t('suit.' + s)}`,
            onClick: () => actions.chooseContract('KOZ', s) }, SUIT_SYMBOL[s]))))));
}

function handResultLayer(state) {
  const { view, room } = state;
  const r = view.handResults[view.handResults.length - 1];
  return h('div', { class: 'overlay-in', id: 'hand-result-layer' },
    h('div', { class: 'result' },
      h('h3', null, `${t('game.handScored')} — ${contractText(r.contract)}`),
      r.earlyEnd ? h('p', { class: 'small muted' }, t('game.earlyEnd', { n: r.tricksPlayed })) : null,
      h('ul', null, r.deltas.map((d, i) => h('li', null, h('span', null, seatName(room, i)), h('span', { class: d < 0 ? 'neg' : 'pos' }, d > 0 ? `+${d}` : d)))),
      view.phase === 'HAND_SCORED' ? h('p', { class: 'muted small' }, t('game.nextHandSoon')) : null));
}

function gameOverLayer(state, actions) {
  const { view, room } = state;
  const standings = finalStandings(view.scores);
  return h('div', { class: 'overlay-in', id: 'game-over-layer' },
    h('div', { class: 'result final', id: 'game-over' },
      h('h3', null, t('game.gameOver')),
      h('ol', null, standings.map(({ seat, score, won }) => h('li', { class: won ? 'win' : 'lose', dataset: { seat, result: won ? 'win' : 'lose' } },
        h('span', { class: 'ico-result', role: 'img', 'aria-label': t(won ? 'game.won' : 'game.lost') }, won ? '🏆' : '😞'),
        h('span', { class: 'who' }, seatName(room, seat)),
        h('span', { class: `num ${score < 0 ? 'neg' : score > 0 ? 'pos' : ''}` }, score)))),
      h('div', { class: 'row-btns' },
        h('button', { id: 'final-sheet', onClick: () => actions.toggleScores() }, t('game.scores')),
        h('button', { class: 'primary', onClick: () => actions.leave(false) }, t('game.back')))));
}

function boardLayer(state, actions, now) {
  const { view, room } = state;
  if (view.phase === 'GAME_OVER') return gameOverLayer(state, actions);
  if (view.phase === 'CONTRACT_SELECT' && view.turn === view.seat) return contractChooser(state, actions);
  if (view.phase === 'HAND_SCORED' && !(state.shownTrick && state.shownTrick.until > now)) return handResultLayer(state);
  return null;
}

function centerContent(state, trickInfo) {
  const { view, room } = state;
  if (view.phase === 'CONTRACT_SELECT') {
    return h('div', { class: `status ${view.turn === view.seat ? 'mine' : ''}`.trim() },
      view.turn === view.seat ? t('game.chooseBelow') : t('game.chooses', { name: seatName(room, view.turn) }));
  }
  return trickArea(state, trickInfo);
}

function myHand(state, actions) {
  const { view } = state;
  const legal = new Set(view.legalCards ?? []);
  const yourTurn = view.phase === 'PLAYING' && view.turn === view.seat;
  return h('div', { class: `hand ${yourTurn ? 'active' : ''}`.trim(), id: 'hand' },
    groupHand(view.myHand).map((g) => h('div', { class: 'suit-group', dataset: { suit: g.suit, n: g.cards.length } },
      g.cards.map((c) => {
        const ok = legal.has(c);
        const { suit, rank } = parseCard(c);
        return h('button', { class: `card-btn ${isRed(suit) ? 'red' : 'black'} ${ok ? 'legal' : ''}`.trim(), dataset: { card: c }, disabled: !ok,
          'aria-label': `${rank} ${t('suit.' + suit)}`, onClick: () => actions.playCard(c) },
          h('span', { class: 'rank' }, rank), h('span', { class: 'suit' }, SUIT_SYMBOL[suit]));
      }))));
}

// ---------- puan cetveli ----------
function marks(filled, total, onChar, offChar) {
  return Array.from({ length: total }, (_, i) => (i < filled ? onChar : offChar)).join('');
}

function sheetCell(line, seat) {
  if (!line) return h('td', { class: 'cell empty' }, '');
  const d = line.deltas[seat];
  return h('td', { class: `cell ${d < 0 ? 'neg' : d > 0 ? 'pos' : 'zero'} ${line.declarer === seat ? 'chooser-cell' : ''}`.trim() }, d === 0 ? '0' : d > 0 ? `+${d}` : `${d}`);
}

function scoreboard(state, actions) {
  const { view, room } = state;
  const sheet = buildSheet(view.handResults, view.ledger);
  const seats = [0, 1, 2, 3];
  const head = h('tr', null,
    h('th', { class: 'label' }, t('app.title')),
    seats.map((s) => h('th', { class: `player ${s === view.seat ? 'me' : ''}`.trim() },
      h('div', { class: 'pname' }, seatName(room, s)),
      h('div', { class: 'pmarks', 'aria-label': `${t('sheet.rights')}` },
        h('span', { class: 'tri' }, marks(sheet.marks[s].ceza, SHEET_CEZA_RIGHTS, '▲', '△')),
        h('span', { class: 'circ' }, marks(sheet.marks[s].koz, SHEET_KOZ_RIGHTS, '●', '○'))))));
  const typeRows = sheet.rows.flatMap((row) => row.lines.map((line, i) => h('tr', { class: `type-row ${i === 1 ? 'second' : 'first'}`, dataset: { type: row.type } },
    i === 0 ? h('th', { class: 'label', rowSpan: 2 }, t(`contract.${row.type}`), h('span', { class: 'pts' }, ` (${row.points})`)) : null,
    seats.map((s) => sheetCell(line, s)))));
  const kozRows = sheet.koz.map((line, i) => h('tr', { class: 'koz-row-sheet' },
    i === 0 ? h('th', { class: 'label koz-label', rowSpan: sheet.koz.length }, t('contract.KOZ'), h('span', { class: 'pts' }, ' (+50)')) : null,
    seats.map((s) => sheetCell(line, s))));
  const totalRow = (key, labelKey, cls) => h('tr', { class: `total-row ${cls}` },
    h('th', { class: 'label' }, t(labelKey)),
    seats.map((s) => {
      const v = sheet.totals[s][key];
      return h('td', { class: `cell ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}`.trim(), dataset: { total: key, seat: s } }, v);
    }));
  return h('div', { class: 'overlay', id: 'scoreboard', onClick: (e) => { if (e.target.classList.contains('overlay')) actions.toggleScores(); } },
    h('div', { class: 'modal sheet-modal', role: 'dialog', 'aria-label': t('game.scores') },
      h('div', { class: 'table-wrap' },
        h('table', { class: 'sheet' },
          h('thead', null, head),
          h('tbody', null, typeRows, h('tr', { class: 'gap' }, h('td', { colSpan: 5 })), kozRows),
          h('tfoot', null,
            totalRow('ceza', 'sheet.cezaTotal', 'sub'),
            totalRow('koz', 'sheet.kozTotal', 'sub'),
            totalRow('total', 'sheet.grandTotal', 'grand')))),
      h('div', { class: 'row-btns' }, h('button', { id: 'close-sheet', onClick: () => actions.toggleScores() }, t('game.close')))));
}

export function tableScreen(state, ui, actions, now) {
  const { view, room } = state;
  const pos = relativePositions(view.seat);
  const trickInfo = activeTrick(state, now);
  const yourTurn = view.turn === view.seat && (view.phase === 'PLAYING' || view.phase === 'CONTRACT_SELECT');
  const turnText = yourTurn ? t('game.yourTurn') : (view.turn !== null && view.turn !== undefined ? t('game.waitingFor', { name: seatName(room, view.turn) }) : '');
  return h('main', { class: 'game' },
    connBanner(state),
    h('header', { class: 'topbar' },
      h('span', { class: 'hand-no' }, t('game.hand', { n: view.handNo, total: TOTAL_HANDS })),
      h('span', { class: `contract-badge ${view.contract ? '' : 'idle'}`.trim(), id: 'contract-badge' }, contractText(view.contract)),
      h('span', { class: `turn-note ${yourTurn ? 'mine' : ''}`.trim() }, turnText),
      h('button', { id: 'show-scores', class: 'small', onClick: () => actions.toggleScores() }, t('game.scores')),
      h('button', { id: 'leave', class: 'small danger', onClick: () => actions.leave(true) }, t('game.leave'))),
    h('div', { class: 'board' },
      seatPanel(state, pos.top, 'top', trickInfo), seatPanel(state, pos.left, 'left', trickInfo), seatPanel(state, pos.right, 'right', trickInfo),
      h('div', { class: 'center' }, centerContent(state, trickInfo)),
      seatPanel(state, pos.bottom, 'bottom', trickInfo),
      boardLayer(state, actions, now)),
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
