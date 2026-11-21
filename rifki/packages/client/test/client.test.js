import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, reduce, seatName, activeTrick, nextExpiry, pruneExpired, TRICK_SHOW_MS, TOAST_MS } from '../public/store.js';
import { relativePositions, positionOf, parseCard, isRed, groupHand } from '../public/cards.js';
import { buildSheet, finalStandings } from '../public/sheet.js';
import { t, setLocale, registerLocale } from '../public/i18n.js';
import tr from '../public/locales/tr.js';
import { ERR } from '../../server/src/protocol.js';
import { createNet } from '../public/net.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '../public');

const room = {
  t: 'ROOM_STATE', code: 'ABCDE', phase: 'PLAYING', hostSeat: 0,
  seats: [{ kind: 'human', nickname: 'Serhan', connected: true }, { kind: 'bot', name: 'Ayşe', traits: {} }, { kind: 'bot', name: 'Ali', traits: {} }, { kind: 'bot', name: 'Can', traits: {} }],
};
const view = (extra = {}) => ({ seat: 0, phase: 'PLAYING', turn: 0, trick: { plays: [{ seat: 1, card: '7D' }] }, ...extra });

// ---------- yerleşim ----------
test('koltuk yerleşimi: kendi koltuğum altta, sıra saat yönünde (sonraki oyuncu solumda)', () => {
  assert.deepEqual(relativePositions(0), { bottom: 0, left: 1, top: 2, right: 3 });
  assert.deepEqual(relativePositions(2), { bottom: 2, left: 3, top: 0, right: 1 });
  assert.equal(positionOf(3, 0), 'left');
  assert.equal(positionOf(3, 1), 'top');
  for (let me = 0; me < 4; me++) assert.equal(new Set(Object.values(relativePositions(me))).size, 4);
});

test('kart ayrıştırma ve renk', () => {
  assert.deepEqual(parseCard('10H'), { rank: '10', suit: 'H' });
  assert.deepEqual(parseCard('KS'), { rank: 'K', suit: 'S' });
  assert.equal(isRed('H'), true); assert.equal(isRed('D'), true);
  assert.equal(isRed('S'), false); assert.equal(isRed('C'), false);
});

// ---------- el gruplama ----------
test('groupHand: renk grupları, grup içinde büyükten küçüğe; aynı renkli seriler yan yana gelmez', () => {
  const hand = ['2C', 'AC', '9H', 'KH', '3D', 'QS', '10S', 'JS', '4D', '7H'];
  const groups = groupHand(hand);
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map((g) => isRed(g.suit)), [false, true, false, true].map((x, i) => (isRed(groups[0].suit) ? [true, false, true, false][i] : x)));
  for (let i = 1; i < groups.length; i++) assert.notEqual(isRed(groups[i].suit), isRed(groups[i - 1].suit));
  const hearts = groups.find((g) => g.suit === 'H').cards;
  assert.deepEqual(hearts, ['KH', '9H', '7H']);
  assert.deepEqual(groups.find((g) => g.suit === 'S').cards, ['QS', 'JS', '10S']);
  assert.equal(groups.flatMap((g) => g.cards).length, hand.length);
});

test('groupHand: üç renk varsa fazla olan renk kenarlara gider; eksik renkte de mümkün olduğunca değişir', () => {
  const g3 = groupHand(['2C', '3S', '4H']);
  assert.deepEqual(g3.map((g) => isRed(g.suit)), [false, true, false]);
  const g3b = groupHand(['2C', '3H', '4D']);
  assert.deepEqual(g3b.map((g) => isRed(g.suit)), [true, false, true]);
  assert.deepEqual(groupHand([]), []);
  assert.equal(groupHand(['AH']).length, 1);
});

// ---------- puan cetveli ----------
test('buildSheet: ceza satırları iki çizgi, koz bloğu 8 satır, toplamlar ve işaretler', () => {
  const results = [
    { handNo: 1, declarer: 0, contract: { type: 'RIFKI', trump: null }, deltas: [-320, 0, 0, 0] },
    { handNo: 2, declarer: 1, contract: { type: 'KIZ', trump: null }, deltas: [-100, -200, -100, 0] },
    { handNo: 5, declarer: 2, contract: { type: 'KOZ', trump: 'S' }, deltas: [100, 150, 200, 200] },
    { handNo: 9, declarer: 3, contract: { type: 'RIFKI', trump: null }, deltas: [0, 0, -320, 0], earlyEnd: true },
  ];
  const ledger = { koz: [0, 0, 1, 0], ceza: [1, 1, 0, 1], typeUses: {} };
  const sheet = buildSheet(results, ledger);
  assert.equal(sheet.rows.length, 6);
  assert.deepEqual(sheet.rows.map((r) => r.type), ['RIFKI', 'EL_ALMAZ', 'KUPA', 'ERKEK', 'KIZ', 'SON_IKI']);
  assert.deepEqual(sheet.rows.map((r) => r.points), [320, 50, 30, 60, 100, 180]);
  const rifki = sheet.rows[0];
  assert.equal(rifki.lines.length, 2);
  assert.equal(rifki.lines[0].handNo, 1);
  assert.equal(rifki.lines[1].handNo, 9);
  assert.equal(rifki.lines[1].earlyEnd, true);
  assert.equal(sheet.rows[1].lines[0], null);
  assert.equal(sheet.koz.length, 8);
  assert.equal(sheet.koz[0].trump, 'S');
  assert.equal(sheet.koz[1], null);
  assert.deepEqual(sheet.marks[2], { ceza: 0, koz: 1 });
  assert.deepEqual(sheet.totals.map((x) => x.ceza), [-420, -200, -420, 0]);
  assert.deepEqual(sheet.totals.map((x) => x.koz), [100, 150, 200, 200]);
  assert.deepEqual(sheet.totals.map((x) => x.total), [-320, -50, -220, 200]);
});

test('finalStandings: yalnız sıfırın üstündekiler kazanır, sıralama puana göre', () => {
  const st = finalStandings([120, -300, 0, 180]);
  assert.deepEqual(st.map((x) => x.seat), [3, 0, 2, 1]);
  assert.deepEqual(st.map((x) => x.won), [true, true, false, false]);
});

// ---------- indirgeyici ----------
test('oturum, oda ve görünüm mesajları duruma işlenir', () => {
  let s = initialState();
  s = reduce(s, { t: 'ROOM_JOINED', code: 'ABCDE', seat: 0, token: 'tok', nickname: 'Serhan' }, 0);
  assert.deepEqual(s.session, { code: 'ABCDE', seat: 0, token: 'tok', nickname: 'Serhan' });
  s = reduce(s, room, 0);
  assert.equal(s.room.code, 'ABCDE');
  assert.equal(seatName(s.room, 0), 'Serhan');
  assert.equal(seatName(s.room, 2), 'Ali');
  s = reduce(s, { t: 'GAME_VIEW', seq: 3, view: view(), events: [] }, 0);
  assert.equal(s.seq, 3);
});

test('eski görünüm (daha küçük seq) yok sayılır', () => {
  let s = initialState();
  s = reduce(s, { t: 'GAME_VIEW', seq: 5, view: view({ turn: 1 }) }, 0);
  const same = reduce(s, { t: 'GAME_VIEW', seq: 4, view: view({ turn: 2 }) }, 0);
  assert.equal(same, s);
  assert.equal(same.view.turn, 1);
});

test('biten tur kısa süre masada kalır, sonra yeni tur görünür', () => {
  let s = initialState();
  const plays = [{ seat: 0, card: '2C' }, { seat: 1, card: '3C' }, { seat: 2, card: '4C' }, { seat: 3, card: '9C' }];
  s = reduce(s, { t: 'GAME_VIEW', seq: 1, view: view({ trick: { plays: [] } }), events: [{ type: 'TRICK_WON', winner: 3, plays }] }, 1000);
  const shown = activeTrick(s, 1000 + 100);
  assert.equal(shown.finished, true);
  assert.equal(shown.winner, 3);
  assert.equal(shown.plays.length, 4);
  assert.equal(nextExpiry(s), 1000 + TRICK_SHOW_MS);
  const later = activeTrick(s, 1000 + TRICK_SHOW_MS + 1);
  assert.equal(later.finished, false);
  assert.equal(later.plays.length, 0);
  assert.equal(pruneExpired(s, 1000 + TRICK_SHOW_MS + 1).shownTrick, null);
});

test('REDEALT olayı bildirim üretir', () => {
  let s = initialState();
  s = reduce(s, { t: 'GAME_VIEW', seq: 1, view: view(), events: [{ type: 'REDEALT', handNo: 3 }] }, 0);
  assert.equal(s.toasts.at(-1).key, 'game.redealt');
  assert.ok('game.redealt' in tr);
});

test('bot düşünüyor göstergesi yeni görünümle temizlenir', () => {
  let s = initialState();
  s = reduce(s, { t: 'BOT_THINKING', seat: 2, delayMs: 4000 }, 10);
  assert.equal(s.thinking.seat, 2);
  s = reduce(s, { t: 'GAME_VIEW', seq: 1, view: view(), events: [] }, 20);
  assert.equal(s.thinking, null);
});

test('koltuk olayları bildirim üretir ve süresi dolunca silinir; en fazla 4 bildirim', () => {
  let s = initialState();
  s = reduce(s, room, 0);
  s = reduce(s, { t: 'SEAT_EVENT', event: 'DISCONNECTED', seat: 0, takeoverMs: 30000 }, 100);
  assert.equal(s.toasts[0].key, 'seat.event.DISCONNECTED');
  assert.deepEqual(s.toasts[0].params, { name: 'Serhan', sec: 30 });
  assert.equal(nextExpiry(s), 100 + TOAST_MS);
  assert.equal(pruneExpired(s, 100 + TOAST_MS + 1).toasts.length, 0);
  for (let i = 0; i < 8; i++) s = reduce(s, { t: 'SEAT_EVENT', event: 'RECONNECTED', seat: 1 }, 100);
  assert.ok(s.toasts.length <= 4);
});

test('hata kodları: bilinen kod bildirime, INVALID_TOKEN oturumu sıfırlar, SESSION_REPLACED ölümcül', () => {
  let s = initialState({ code: 'A', seat: 0, token: 'x', nickname: 'S' });
  s = reduce(s, room, 0);
  s = reduce(s, { t: 'ERROR', code: 'ILLEGAL_CARD' }, 0);
  assert.equal(s.toasts.at(-1).key, 'error.ILLEGAL_CARD');
  assert.equal(s.toasts.at(-1).kind, 'error');
  s = reduce(s, { t: 'ERROR', code: 'INVALID_TOKEN' }, 0);
  assert.equal(s.session, null);
  assert.equal(s.room, null);
  assert.equal(reduce(initialState(), { t: 'ERROR', code: 'SESSION_REPLACED' }, 0).fatal, 'SESSION_REPLACED');
});

test('LEFT_ROOM her şeyi sıfırlar; bağlantı durumu korunur', () => {
  let s = initialState({ code: 'A', seat: 0, token: 'x', nickname: 'S' });
  s = reduce(s, room, 0);
  s = reduce(s, { t: '@conn', status: 'open' }, 0);
  s = reduce(s, { t: 'LEFT_ROOM' }, 0);
  assert.equal(s.session, null); assert.equal(s.room, null); assert.equal(s.view, null);
  assert.equal(s.conn, 'open');
});

// ---------- çeviri ----------
test('t(): yer tutucular, eksik anahtar yedekleri, dil yedeği', () => {
  setLocale('tr-TR');
  assert.equal(t('game.hand', { n: 3, total: 20 }), 'El 3/20');
  assert.equal(t('olmayan.anahtar'), 'olmayan.anahtar');
  assert.equal(t('game.usesLeft', {}), 'kalan hak: {n}');
  registerLocale('en', { 'app.title': 'King' });
  assert.equal(setLocale('en-US'), 'en');
  assert.equal(t('app.title'), 'King');
  assert.equal(t('home.join'), tr['home.join'], 'eksik anahtar Türkçe yedeğe düşer');
  assert.equal(setLocale('xx'), 'tr');
});

test('çeviri anahtarı kapsamı: kodda kullanılan her anahtar ve her dinamik anahtar ailesi tr.js içinde var', () => {
  const src = fs.readdirSync(pub).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(pub, f), 'utf8')).join('\n');
  const used = new Set([...src.matchAll(/\bt\('([\w.]+)'[,)]/g)].map((m) => m[1]));
  assert.ok(used.size > 40);
  for (const k of used) assert.ok(k in tr, `eksik çeviri: ${k}`);
  for (const s of ['C', 'D', 'H', 'S']) assert.ok(`suit.${s}` in tr);
  for (const c of ['KOZ', 'RIFKI', 'KIZ', 'ERKEK', 'KUPA', 'SON_IKI', 'EL_ALMAZ']) { assert.ok(`contract.${c}` in tr); assert.ok(`contract.desc.${c}` in tr); }
  for (const k of ['risk', 'tracking', 'inference', 'lookahead', 'handEval', 'scoreAwareness', 'aggression', 'consistency', 'thinkSpeed']) assert.ok(`trait.${k}` in tr);
  for (const e of ['DISCONNECTED', 'RECONNECTED', 'BOT_TOOK_OVER', 'CONTROL_RETURNED', 'LEFT']) assert.ok(`seat.event.${e}` in tr);
  for (const code of [...Object.values(ERR), 'NOT_YOUR_TURN', 'WRONG_PHASE', 'ILLEGAL_CONTRACT', 'INVALID_TRUMP', 'CARD_NOT_IN_HAND', 'ILLEGAL_CARD', 'INTERNAL']) {
    assert.ok(`error.${code}` in tr, `eksik hata metni: ${code}`);
  }
  assert.ok('conn.fatal.SESSION_REPLACED' in tr);
});

test('güvenlik: istemci kodunda innerHTML/eval/satır içi stil yok (CSP ile uyumlu)', () => {
  for (const f of fs.readdirSync(pub).filter((x) => x.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(pub, f), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(code), `${f}: tehlikeli API`);
  }
  assert.ok(!/<style|style=/.test(fs.readFileSync(path.join(pub, 'index.html'), 'utf8')));
});

// ---------- ağ ----------
class FakeWS {
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.instances.push(this); }
  send(d) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

test('net: bağlanınca token varsa RESUME gönderir; kopunca yeniden bağlanır', () => {
  FakeWS.instances = [];
  const status = []; const got = []; const timers = [];
  let token = 'tok-1';
  const net = createNet({
    url: 'ws://x/ws', WebSocketImpl: FakeWS, getToken: () => token,
    onStatus: (s) => status.push(s), onMessage: (m) => got.push(m),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
  });
  net.start();
  const a = FakeWS.instances[0];
  a.open();
  assert.deepEqual(a.sent[0], { t: 'RESUME', token: 'tok-1' });
  a.recv({ t: 'PONG' });
  a.onmessage({ data: 'bozuk{' }); // çökmez
  assert.deepEqual(got, [{ t: 'PONG' }]);
  assert.equal(net.send({ t: 'PING' }), true);
  a.readyState = 3; a.onclose();
  assert.equal(status.at(-1), 'reconnecting');
  assert.equal(net.send({ t: 'PING' }), false, 'bağlı değilken gönderme başarısız');
  assert.ok(timers[0].ms >= 500 && timers[0].ms <= 5300);
  token = null;
  timers[0].fn();
  const b = FakeWS.instances[1];
  b.open();
  assert.equal(b.sent.length, 0, 'token yoksa RESUME yok');
  assert.equal(status.at(-1), 'open');
  net.stop();
});
