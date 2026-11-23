// Ekranlar: ana ekran, lobi, masa. Her fonksiyon (state, ui, actions, now) alıp DOM düğümü döner.
import { h } from './ui.js';
import { t } from './i18n.js';
import { SUIT_SYMBOL, SUITS, parseCard, isRed, relativePositions, groupHand } from './cards.js';
import { buildSheet, finalStandings, certainStatus, seatOutlook, seatHandNotes, seatTrend, isLastHands, SHEET_CEZA_RIGHTS, SHEET_KOZ_RIGHTS } from './sheet.js';
import { formatGameLog, buildHandGrid, cardText, handText, contractLabel } from './gamelog.js';
import { seatName, activeTrick, lastTrick, turnCountdown, revealLeft, COUNTDOWN_MS, REVEAL_MS } from './store.js';

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
  if (contract.type !== 'KOZ') return t(`contract.${contract.type}`);
  return `${t('contract.KOZ')} ${SUIT_SYMBOL[contract.trump]}${contract.king ? ` 👑 ${t('game.king')}` : ''}`;
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
    ui.lastLog ? h('button', { id: 'last-log', class: 'small', onClick: () => actions.openStoredLog() }, t('log.lastGame')) : null,
    toasts(state));
}

// ---------- lobi ----------
/** Bot gücü etiketi: 5 çubuklu gösterge + kategori adı (çok zayıf … çok güçlü). */
function strengthBadge(level) {
  if (!level) return null;
  return h('span', { class: `strength s${level}`, dataset: { strength: level }, title: t('strength.title') },
    h('span', { class: 'meter', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= level ? 'on' : '' }))),
    h('span', { class: 'lab' }, t(`strength.${level}`)));
}

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
        h('div', { class: 'seat-sub' },
          strengthBadge(s.strength),
          h('button', { class: 'small', dataset: { toggleTraits: i }, 'aria-expanded': String(!!ui.lobbyTraits?.[i]), onClick: () => actions.toggleLobbyTraits(i) }, t(ui.lobbyTraits?.[i] ? 'lobby.hideTraits' : 'lobby.showTraits')),
          isHost ? h('button', { class: 'small danger', onClick: () => actions.removeBot(i) }, t('lobby.removeBot')) : null)),
      ui.lobbyTraits?.[i] ? traitBars(s.traits) : null);
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

/** El almaz ve Koz: alınan el sayısı önde tek yatay kart + sarı rakam olarak görünür (herkese açık). */
function tricksRow(n, owner) {
  return h('div', { class: 'pen-row tricks-row', dataset: { tricks: n, penalty: owner }, 'aria-label': `${t('game.tricksTaken')}: ${n}` },
    n > 0 ? cardBack('mini land') : null, // tek kart, yatay; alınan el sayısı sarı rakamla (0 iken gösterilmez, yer ayrılı kalır)
    n > 0 ? h('div', { class: 'count' }, `${n}`) : null);
}

/** İsim satırı: bot adına tıklayınca karakter özellikleri açılır; insanın son 10 sn'sinde ismin yanında geri sayım çubuğu çıkar. */
function seatNameRow(state, seat, actions, now, outlook, score = null) {
  const { room } = state;
  const name = seatName(room, seat);
  const cd = turnCountdown(state, seat, now);
  const label = room.seats[seat].kind === 'bot'
    ? h('button', { type: 'button', class: 'sp-label botname', title: t('game.traitsTitle'), onClick: () => actions.toggleTraits(seat) }, name)
    : h('span', { class: 'sp-label' }, name);
  return h('div', { class: `sp-name ${cd ? 'counting' : ''}`.trim() },
    label,
    score !== null ? h('span', { class: `sp-score ${score > 0 ? 'pos' : 'neg'}`, dataset: { score }, title: t('game.scoreOf', { n: score }) }, h('span', { class: 'lg' }, `${t('game.scoreWord')} `), `${score}`) : null,
    cd ? h('span', { class: `cd-sec ${cd.sec <= 5 ? 'hot' : ''}`.trim(), role: 'timer', 'aria-label': t('game.countdown', { sec: cd.sec }) }, t('game.secShort', { sec: cd.sec })) : null,
    cd ? h('span', { class: 'cd-bar', 'aria-hidden': 'true' }, h('i', { style: { animationDelay: `-${((COUNTDOWN_MS - cd.leftMs) / 1000).toFixed(2)}s` } })) : null);
}

function seatPanel(state, seat, pos, trickInfo, actions, now, outlooks, handNotes, trends) {
  const { view, room } = state;
  const s = room.seats[seat];
  const myTurn = view.turn === seat && (view.phase === 'PLAYING' || view.phase === 'CONTRACT_SELECT');
  const thinking = state.thinking && state.thinking.seat === seat;
  const isBot = s.kind === 'bot' || s.botControlled;
  const offline = s.kind === 'human' && !s.connected;
  const took = trickInfo.finished && trickInfo.winner === seat;
  const isMe = seat === view.seat;
  const backs = isMe ? null : h('div', { class: `backs ${pos === 'left' || pos === 'right' ? 'vert' : ''}`.trim(), 'aria-label': `${view.handSizes[seat]}` },
    Array.from({ length: view.handSizes[seat] }, () => cardBack('tiny')));
  const outlook = outlooks[seat];
  const certCls = outlook.status ? `cert-${outlook.status}` : '';
  const late = isLastHands(view.handNo);
  const noteLines = late ? seatNoteLines(outlook, handNotes[seat]) : [];
  const showScore = late && view.scores;
  return h('div', { class: `seat-panel pos-${pos} ${myTurn ? 'turn' : ''} ${took ? 'took' : ''} ${certCls}`.replace(/\s+/g, ' ').trim(), dataset: { seat, ...(outlook.status ? { certain: outlook.status } : {}) } },
    seatNameRow(state, seat, actions, now, outlook, showScore ? view.scores[seat] : null),
    trends[seat] ? h('div', { class: `sp-trend ${trends[seat].level}`, dataset: { trend: trends[seat].level }, title: t('game.trendTitle', { n: trends[seat].estimate }) }, t(`game.trend.${trends[seat].level}`)) : null,
    h('div', { class: 'sp-icons' },
      h('span', { class: `ico ${isBot ? '' : 'off'}`, title: t('game.bot') }, '🤖'),
      h('span', { class: `ico ${seat === view.declarer ? '' : 'off'}`, title: t('game.declarer') }, '★'),
      h('span', { class: `ico ${offline ? '' : 'off'}`, title: t('game.offline') }, '📴'),
      outlook.status ? h('span', { class: 'sp-cert', role: 'img', 'aria-label': t(outlook.status === 'win' ? 'game.certainWin' : 'game.certainLose'), title: t(outlook.status === 'win' ? 'game.certainWin' : 'game.certainLose') }, outlook.status === 'win' ? '🏆' : '😞') : null,
      h('span', { class: `think ${thinking ? 'on' : ''}`, role: 'img', 'aria-label': t('game.thinking'), dataset: { thinking: thinking ? '1' : '0' } },
        h('i'), h('i'), h('i'))),
    backs,
    view.contract?.type === 'EL_ALMAZ' || view.contract?.type === 'KOZ' ? tricksRow(view.tricksTaken?.[seat] ?? 0, seat) : penaltyRow(view.penaltyTaken?.[seat] ?? [], seat),
    noteLines.length ? h('div', { class: 'sp-note' }, noteLines.map((l) => h('div', null, l))) : null);
}

/** Kesin olmayan oyuncu için durum açıklamaları: önce oynanan elin eşiği, sonra genel durum. */
function seatNoteLines(outlook, handNote) {
  const lines = [];
  if (handNote?.lose) lines.push(t(`game.noteLose.${handNote.lose.type}`, { k: handNote.lose.k }));
  if (handNote?.needKoz) lines.push(t('game.noteHandKoz', { k: handNote.needKoz }));
  if (lines.length) return lines; // oynanan elin eşiği daha özgüldür: varsa genel durum satırı gösterilmez (yer kazanılır)
  if (outlook.canEat !== undefined) lines.push(outlook.canEat > 0 ? t('game.noteEat', { n: outlook.canEat }) : t('game.noteEatNone'));
  else if (outlook.needKoz) lines.push(t('game.noteNeedKoz', { n: outlook.needKoz.points, k: outlook.needKoz.tricks }));
  return lines;
}

/** Üst çubuğun altında yeri sabit durum şeridi (boşken de yer kaplar): King ilerlemesi, koz/kupa kırıldı mı. */
function statusStrip(state) {
  const { view } = state;
  const c = view.contract;
  const items = [];
  if (c?.king) items.push(h('span', { class: 'sx gold lg', id: 'king-progress' }, `👑 ${t('game.kingProgress', { n: view.tricksTaken?.[view.declarer] ?? 0 })}`));
  if (c?.type === 'KOZ') {
    items.push(view.trumpBroken ? h('span', { class: 'sx green', id: 'broken-note' }, `✅ ${t('game.kozBroken')}`) : h('span', { class: 'sx amber', id: 'broken-note' }, `🔒 ${t('game.kozNotBroken')}`));
  } else if (c?.type === 'KUPA' || c?.type === 'RIFKI') {
    items.push(view.heartsBroken ? h('span', { class: 'sx green', id: 'broken-note' }, `✅ ${t('game.heartsBroken')}`) : h('span', { class: 'sx amber', id: 'broken-note' }, `🔒 ${t('game.heartsNotBroken')}`));
  }
  return h('div', { class: 'strip', id: 'status-strip', 'aria-live': 'polite' }, items);
}

/** Üst çubuktaki sözleşme rozeti. King'de geniş ekranda "King", dar ekranda alınan el sayısı (n/11) görünür. */
function contractBadge(view) {
  const c = view.contract;
  if (!c) return h('span', { class: 'contract-badge idle', id: 'contract-badge' }, t('game.noContract'));
  if (c.type !== 'KOZ' || !c.king) return h('span', { class: 'contract-badge', id: 'contract-badge' }, contractText(c));
  const n = view.tricksTaken?.[view.declarer] ?? 0;
  return h('span', { class: 'contract-badge', id: 'contract-badge' },
    `${t('contract.KOZ')} ${SUIT_SYMBOL[c.trump]} 👑 `, h('span', { class: 'lg' }, t('game.king')), h('span', { class: 'sm' }, `${n}/11`));
}

/** Oyunculardan bağımsız, masanın sağ alt köşesinde hep görünen son biten tur: oynanış sırasıyla 4 kart (2×2), kazanan işaretli. */
function lastTrickBox(state, now) {
  const lt = lastTrick(state, now);
  if (!lt) return h('div', { class: 'last-trick empty', 'aria-hidden': 'true' });
  return h('div', { class: 'last-trick', id: 'last-trick' },
    h('div', { class: 'lt-title' }, t('game.lastTrick')),
    h('div', { class: 'lt-cards' }, lt.plays.map((p) => h('div', { class: `lt-play ${p.seat === lt.winner ? 'win' : ''}`.trim(), title: seatName(state.room, p.seat) },
      cardFace(p.card, 'mini')))));
}

function traitPopover(state, ui, actions) {
  const s = ui.traitSeat === null ? null : state.room.seats[ui.traitSeat];
  if (!s || s.kind !== 'bot') return null;
  return h('div', { class: 'overlay-in clear', id: 'trait-layer', onClick: (e) => { if (e.target === e.currentTarget) actions.toggleTraits(ui.traitSeat); } },
    h('div', { class: 'trait-pop', role: 'dialog', 'aria-label': `${s.name} — ${t('game.traitsTitle')}` },
      h('h4', null, h('span', { class: 'pop-title' }, `🤖 ${s.name}`, strengthBadge(s.strength)), h('button', { class: 'small', id: 'close-traits', 'aria-label': t('game.close'), onClick: () => actions.toggleTraits(ui.traitSeat) }, '✕')),
      traitBars(s.traits)));
}

function trickArea(state, trickInfo) {
  const { view } = state;
  const { plays, winner, finished } = trickInfo;
  const pos = relativePositions(view.seat);
  const slot = (name) => {
    const seat = pos[name];
    const play = plays.find((p) => p.seat === seat);
    const lead = plays.length > 0 && plays[0].seat === seat;
    return h('div', { class: `slot slot-${name} ${finished && winner === seat ? 'winner' : ''} ${lead ? 'lead' : ''}`.replace(/\s+/g, ' ').trim() },
      play ? cardFace(play.card) : null,
      lead ? h('span', { class: 'lead-tag' }, t('game.led')) : null);
  };
  return h('div', { class: 'trick' }, ['top', 'left', 'right', 'bottom'].map(slot));
}

function contractChooser(state, ui, actions) {
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
            onClick: () => actions.chooseContract('KOZ', s) }, SUIT_SYMBOL[s]))),
        h('button', { type: 'button', id: 'king-toggle', class: `king-toggle ${ui.king ? 'on' : ''}`.trim(), 'aria-pressed': String(!!ui.king), disabled: !sel.koz, onClick: () => actions.toggleKing() },
          h('span', { class: 'sw', 'aria-hidden': 'true' }),
          h('span', { class: 'kt-text' }, h('b', null, `👑 ${t('game.kingToggle')}`), h('small', null, t('game.kingHint')))))));
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
  const ke = view.kingEnd;
  if (ke) return kingEndLayer(state, actions);
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
        view.gameLog ? h('button', { id: 'open-log', onClick: () => actions.openLog() }, t('log.open')) : null,
        h('button', { class: 'primary', onClick: () => actions.leave(false) }, t('game.back')))));
}

/** King ile biten oyun: puan yok, yalnız çıktı / battı. */
function kingEndLayer(state, actions) {
  const { view, room } = state;
  const ke = view.kingEnd;
  const name = seatName(room, ke.declarer);
  const rows = [0, 1, 2, 3].map((seat) => ({ seat, won: (seat === ke.declarer) === ke.success }))
    .sort((a, b) => Number(b.won) - Number(a.won) || a.seat - b.seat);
  return h('div', { class: 'overlay-in', id: 'game-over-layer' },
    h('div', { class: `result final king-end ${ke.success ? 'ok' : 'fail'}`, id: 'game-over' },
      h('h3', null, `👑 ${t(ke.success ? 'game.kingWonTitle' : 'game.kingLostTitle')}`),
      h('p', { class: 'small muted center-text' }, ke.success ? t('game.kingWonNote', { name, n: ke.tricks }) : t('game.kingLostNote', { name })),
      h('ol', null, rows.map(({ seat, won }) => h('li', { class: won ? 'win' : 'lose', dataset: { seat, result: won ? 'win' : 'lose' } },
        h('span', { class: 'ico-result', role: 'img', 'aria-label': t(won ? 'game.won' : 'game.lost') }, won ? '🏆' : '😞'),
        h('span', { class: 'who' }, seatName(room, seat)),
        h('span', { class: `num ${won ? 'pos' : 'neg'}` }, t(won ? 'game.cikti' : 'game.batti'))))),
      h('div', { class: 'row-btns' },
        h('button', { id: 'final-sheet', onClick: () => actions.toggleScores() }, t('game.scores')),
        view.gameLog ? h('button', { id: 'open-log', onClick: () => actions.openLog() }, t('log.open')) : null,
        h('button', { class: 'primary', onClick: () => actions.leave(false) }, t('game.back')))));
}

/** Rıfkı'da el bozulunca: tetikleyen oyuncuların bütün kartları herkese açık (10 sn). */
function revealLayer(state, left) {
  const { reveal, room } = state;
  const fresh = left > REVEAL_MS - 1200;
  const sec = Math.ceil(left / 1000);
  return h('div', { class: 'overlay-in', id: 'redeal-layer' },
    h('div', { class: `result broken ${fresh ? 'fresh' : ''}`.trim() },
      h('h3', null, `🃏 ${t('game.redealTitle')}`),
      reveal.reveals.map(({ seat, hand }) => {
        const hearts = hand.filter((c) => c.endsWith('H'));
        const what = hearts.some((c) => c.startsWith('A')) && hearts.some((c) => c.startsWith('K')) ? 'AK' : hearts.some((c) => c.startsWith('A')) ? 'A' : 'K';
        return h('div', { class: 'reveal-block', dataset: { seat } },
          h('p', { class: 'reveal-who' }, t('game.redealWho', { name: seatName(room, seat), what: t(`game.redealWhat.${what}`) })),
          h('div', { class: 'reveal' }, groupHand(hand).flatMap((g) => g.cards).map((c) => cardFace(c, c === 'AH' || c === 'KH' ? 'mini hot' : 'mini'))));
      }),
      h('p', { class: 'small muted' }, t('game.redealNote')),
      h('div', { class: 'cd' }, h('i', { style: { animationDelay: `-${((REVEAL_MS - left) / 1000).toFixed(2)}s` } })),
      h('p', { class: 'small muted', role: 'timer' }, t('game.redealTimer', { sec }))));
}

function boardLayer(state, ui, actions, now) {
  const { view } = state;
  const left = revealLeft(state, now);
  if (left !== null && view.phase === 'CONTRACT_SELECT') return revealLayer(state, left);
  if (view.phase === 'GAME_OVER') return gameOverLayer(state, actions);
  if (view.phase === 'CONTRACT_SELECT' && view.turn === view.seat) return contractChooser(state, ui, actions);
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

function sheetCell(line, seat, status) {
  const tint = status === 'win' ? 'col-win' : status === 'lose' ? 'col-lose' : '';
  if (!line) return h('td', { class: `cell empty ${tint}`.trim() }, '');
  const d = line.deltas[seat];
  return h('td', { class: `cell ${d < 0 ? 'neg' : d > 0 ? 'pos' : 'zero'} ${line.declarer === seat ? 'chooser-cell' : ''} ${tint}`.trim() }, d === 0 ? '0' : d > 0 ? `+${d}` : `${d}`);
}

function sheetLegend(view, status) {
  const lines = [];
  if (view.kingEnd) lines.push(h('p', { class: 'legend-line', dataset: { legend: 'king' } }, t('sheet.certainKing')));
  if (status.includes('win')) lines.push(h('p', { class: 'legend-line', dataset: { legend: 'win' } }, `🏆 ${t('sheet.certainWin')}`));
  if (status.includes('lose')) lines.push(h('p', { class: 'legend-line', dataset: { legend: 'lose' } }, `😞 ${t('sheet.certainLose')}`));
  return lines.length ? h('div', { class: 'legend', id: 'sheet-legend' }, lines) : null;
}

function scoreboard(state, actions) {
  const { view, room } = state;
  const sheet = buildSheet(view.handResults, view.ledger);
  const seats = [0, 1, 2, 3];
  const status = certainStatus(view.handResults, view.scores, view.kingEnd);
  const icon = (s) => (status[s] === 'win' ? '🏆 ' : status[s] === 'lose' ? '😞 ' : '');
  const head = h('tr', null,
    h('th', { class: 'label' }, t('app.title')),
    seats.map((s) => h('th', { class: `player ${s === view.seat ? 'me' : ''} ${status[s] ? `hd-${status[s]}` : ''}`.trim(), dataset: status[s] ? { certain: status[s] } : undefined },
      status[s] ? h('div', { class: 'pcert', role: 'img', 'aria-label': t(status[s] === 'win' ? 'game.won' : 'game.lost') }, icon(s).trim()) : null,
      h('div', { class: 'pname' }, seatName(room, s)),
      h('div', { class: 'pmarks', 'aria-label': `${t('sheet.rights')}` },
        h('span', { class: 'tri' }, marks(sheet.marks[s].ceza, SHEET_CEZA_RIGHTS, '▲', '△')),
        h('span', { class: 'circ' }, marks(sheet.marks[s].koz, SHEET_KOZ_RIGHTS, '●', '○'))))));
  const typeRows = sheet.rows.flatMap((row) => row.lines.map((line, i) => h('tr', { class: `type-row ${i === 1 ? 'second' : 'first'}`, dataset: { type: row.type } },
    i === 0 ? h('th', { class: 'label', rowSpan: 2 }, t(`contract.${row.type}`), h('span', { class: 'pts' }, ` (${row.points})`)) : null,
    seats.map((s) => sheetCell(line, s, status[s])))));
  const kozRows = sheet.koz.map((line, i) => h('tr', { class: 'koz-row-sheet' },
    i === 0 ? h('th', { class: 'label koz-label', rowSpan: sheet.koz.length }, t('contract.KOZ'), h('span', { class: 'pts' }, ' (+50)')) : null,
    seats.map((s) => sheetCell(line, s, status[s]))));
  const totalRow = (key, labelKey, cls) => h('tr', { class: `total-row ${cls}` },
    h('th', { class: 'label' }, t(labelKey)),
    seats.map((s) => {
      const v = sheet.totals[s][key];
      const tint = status[s] === 'win' ? 'col-win' : status[s] === 'lose' ? 'col-lose' : '';
      return h('td', { class: `cell ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''} ${tint}`.trim(), dataset: { total: key, seat: s } }, v);
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
      sheetLegend(view, status),
      h('div', { class: 'row-btns' }, h('button', { id: 'close-sheet', onClick: () => actions.toggleScores() }, t('game.close')))));
}

export function tableScreen(state, ui, actions, now) {
  const { view, room } = state;
  const pos = relativePositions(view.seat);
  const trickInfo = activeTrick(state, now);
  const yourTurn = view.turn === view.seat && (view.phase === 'PLAYING' || view.phase === 'CONTRACT_SELECT');
  const outlooks = seatOutlook(view.handResults, view.scores, view.kingEnd);
  const trends = view.phase === 'PLAYING' ? seatTrend(view.handResults, view.scores, view.kingEnd, view.handNo) : view.scores.map(() => null);
  const handNotes = view.phase === 'PLAYING' ? seatHandNotes(view.handResults, view.scores, view.contract, view.kingEnd, view.handNo) : view.scores.map(() => null);
  const turnText = yourTurn ? t('game.yourTurn') : (view.turn !== null && view.turn !== undefined ? t('game.waitingFor', { name: seatName(room, view.turn) }) : '');
  return h('main', { class: 'game' },
    connBanner(state),
    h('header', { class: 'topbar' },
      h('span', { class: 'hand-no' }, h('span', { class: 'lg' }, `${t('game.handWord')} `), `${view.handNo}/${TOTAL_HANDS}`),
      contractBadge(view),
      statusStrip(state),
      h('span', { class: `turn-note ${yourTurn ? 'mine' : ''}`.trim() }, turnText),
      document.fullscreenEnabled ? h('button', { id: 'fullscreen', class: 'small', 'aria-label': t('game.fullscreen'), title: t('game.fullscreen'), onClick: () => actions.toggleFullscreen() }, '⛶') : null,
      h('button', { id: 'show-scores', class: 'small', 'aria-label': t('game.scores'), title: t('game.scores'), onClick: () => actions.toggleScores() }, h('span', { class: 'lg' }, t('game.scores')), h('span', { class: 'sm' }, '📊')),
      h('button', { id: 'leave', class: 'small danger', 'aria-label': t('game.leave'), title: t('game.leave'), onClick: () => actions.leave(true) }, h('span', { class: 'lg' }, t('game.leave')), h('span', { class: 'sm' }, '✕'))),
    h('div', { class: 'board' },
      seatPanel(state, pos.top, 'top', trickInfo, actions, now, outlooks, handNotes, trends), seatPanel(state, pos.left, 'left', trickInfo, actions, now, outlooks, handNotes, trends), seatPanel(state, pos.right, 'right', trickInfo, actions, now, outlooks, handNotes, trends),
      h('div', { class: 'center' }, centerContent(state, trickInfo)),
      seatPanel(state, pos.bottom, 'bottom', trickInfo, actions, now, outlooks, handNotes, trends),
      lastTrickBox(state, now),
      boardLayer(state, ui, actions, now),
      traitPopover(state, ui, actions)),
    myHand(state, actions),
    ui.showScores ? scoreboard(state, actions) : null,
    toasts(state));
}

export function loadingScreen(state) {
  return h('main', { class: 'center-card' }, connBanner(state), h('p', { class: 'muted' }, t('game.loading')), toasts(state));
}

const initial = (name) => Array.from(name).slice(0, 2).join('');

function logCard(c) {
  const red = c.card.endsWith('H') || c.card.endsWith('D');
  return h('span', { class: `lc ${red ? 'r' : ''} ${c.penalty ? 'pen' : ''}`.replace(/\s+/g, ' ').trim() }, h('sup', { class: 'o' }, c.order), cardText(c.card));
}

function handGrid(data, rec, order, on) {
  const { names, me } = data;
  const rows = buildHandGrid(rec);
  const cols = order.map((seat) => seat);
  const cut = !!rec.kingEnd;
  return h('section', { class: `hand-grid ${on ? 'on' : ''}`.trim(), dataset: { hand: rec.handNo } },
    h('div', { class: 'hg-head' },
      h('strong', null, t('log.hand', { n: rec.handNo, total: 20 })),
      h('span', null, contractLabel(rec.contract)),
      h('span', { class: 'tag-dec' }, `${t('log.declarer')}: ${names[rec.declarer]}`),
      rec.deltas ? h('span', { class: 'muted small' }, names.map((n, i) => `${n} ${rec.deltas[i] > 0 ? '+' : ''}${rec.deltas[i]}`).join(' · ')) : null),
    (rec.redeals ?? []).map((rd, i) => h('p', { class: 'hg-note small muted' }, `${t('log.redealShort', { n: i + 1, name: names[rd.declarer] })}  ${rd.deal.map((cards, s) => `${names[s]}: ${handText(cards)}`).join(' | ')}`)),
    h('table', null,
      h('thead', null, h('tr', null, h('th', null, ''), cols.map((seat) => h('th', { class: seat === rec.declarer ? 'dec' : '' },
        seat === me ? `${names[seat]} ${t('log.you')}` : names[seat], seat === rec.declarer ? h('small', null, t('log.declarerShort')) : null)))),
      h('tbody', null,
        h('tr', { class: 'deal' }, h('td', null, t('log.deal')), cols.map((seat) => h('td', null, handText(rec.deal[seat])))),
        rows.map((r) => h('tr', null, h('td', null, t('log.trick', { n: r.n })),
          cols.map((seat) => {
            const c = r.cells[seat];
            if (!c) return h('td', null, '');
            return h('td', { class: `cell ${c.win ? 'win' : ''} ${c.lead ? 'lead' : ''}`.replace(/\s+/g, ' ').trim() },
              c.lead ? h('span', { class: 'dot', title: t('log.leads') }) : null, logCard(c),
              c.noSuit ? h('span', { class: 'no' }, t('log.noSuit')) : null,
              c.hadSuit ? h('span', { class: 'no warn' }, `⚠ ${t('log.hadSuit')}`) : null);
          }))),
        cut ? h('tr', { class: 'res' }, h('td', { colspan: 5 }, t('log.kingCut')))
          : [h('tr', { class: 'res' }, h('td', null, t('log.result')), cols.map((seat) => h('td', null, rec.deltas[seat] > 0 ? `+${rec.deltas[seat]}` : rec.deltas[seat]))),
            h('tr', { class: 'res' }, h('td', null, t('log.total')), cols.map((seat) => h('td', null, rec.scoresAfter[seat])))])));
}

/** Oyun kaydı ekranı: el seçicili ızgara (sütun = oyuncu, satır = tur); yazdırma, kopyalama ve .txt indirme düğmeleri vardır. */
export function logScreen(data, ui, actions) {
  const order = [0, 1, 2, 3].map((i) => (data.me + i) % 4);
  const sel = data.gameLog.some((r) => r.handNo === ui.logHand) ? ui.logHand : data.gameLog[0]?.handNo;
  return h('main', { class: 'log-screen' },
    h('div', { class: 'log-bar' },
      h('button', { id: 'log-back', class: 'small', onClick: () => actions.closeLog() }, `← ${t('log.back')}`),
      h('button', { id: 'log-print', class: 'small', onClick: () => actions.printLog() }, t('log.print')),
      h('button', { id: 'log-copy', class: 'small', onClick: () => actions.copyLog() }, ui.logCopied ? t('log.copied') : t('log.copy')),
      h('button', { id: 'log-download', class: 'small primary', onClick: () => actions.downloadLog() }, t('log.download'))),
    h('p', { class: 'log-sum small muted' }, `${t('log.room')} ${data.code ?? '-'} · ${t('log.finalScores')}: ${data.names.map((n, i) => `${n} ${data.scores?.[i] ?? 0}`).join(' | ')}`),
    h('div', { class: 'log-chips', role: 'tablist', 'aria-label': t('log.hands') },
      data.gameLog.map((rec) => h('button', { class: `log-chip ${rec.handNo === sel ? 'on' : ''} ${rec.kingEnd ? 'king' : ''}`.replace(/\s+/g, ' ').trim(), dataset: { hand: rec.handNo }, role: 'tab', 'aria-selected': String(rec.handNo === sel),
        title: `${contractLabel(rec.contract)} — ${data.names[rec.declarer]}`, onClick: () => actions.selectLogHand(rec.handNo) },
        String(rec.handNo), h('small', null, initial(data.names[rec.declarer]))))),
    data.gameLog.map((rec) => handGrid(data, rec, order, rec.handNo === sel)),
    h('p', { class: 'log-leg small muted' }, t('log.gridLegend')));
}

export function renderScreen(state, ui, actions, now) {
  if (ui.logData) return logScreen(ui.logData, ui, actions);
  if (state.fatal) return fatalScreen(state);
  if (!state.session || !state.room) return homeScreen(state, ui, actions);
  if (state.room.phase === 'LOBBY') return lobbyScreen(state, ui, actions);
  if (!state.view) return loadingScreen(state);
  return tableScreen(state, ui, actions, now);
}
