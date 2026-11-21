import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, createRoom } from './helpers.js';

const room = (h, code) => h.server.rooms.get(code);
const botMsgs = (c) => c.all('BOT_THINKING');

// ---------- oda ve lobi ----------
test('oda kurma: kod 5 karakter, oda sahibi koltuk 0, durum yayını', () => {
  const h = createHarness();
  const { code, host } = createRoom(h, ['Serhan']);
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  const j = host.last('ROOM_JOINED');
  assert.equal(j.seat, 0);
  assert.equal(j.nickname, 'Serhan');
  assert.ok(j.token.length >= 16);
  const s = host.last('ROOM_STATE');
  assert.equal(s.phase, 'LOBBY');
  assert.equal(s.hostSeat, 0);
  assert.deepEqual(s.seats.map((x) => x.kind), ['human', 'empty', 'empty', 'empty']);
});

test('katılım: kod büyük/küçük harf duyarsız; takma ad doğrulama ve çakışma', () => {
  const h = createHarness();
  const { code, host } = createRoom(h, ['Serhan']);
  const b = h.connect();
  b.send({ t: 'JOIN_ROOM', code: code.toLowerCase(), nickname: '  Ayşe   Nur ' });
  assert.equal(b.last('ROOM_JOINED').nickname, 'Ayşe Nur');
  assert.equal(host.last('ROOM_STATE').seats[1].nickname, 'Ayşe Nur');
  const c = h.connect();
  c.send({ t: 'JOIN_ROOM', code, nickname: 'SERHAN' });
  assert.equal(c.error, 'NICKNAME_TAKEN');
  c.send({ t: 'JOIN_ROOM', code, nickname: '   ' });
  assert.equal(c.error, 'BAD_NICKNAME');
  c.send({ t: 'JOIN_ROOM', code, nickname: 'x'.repeat(21) });
  assert.equal(c.error, 'BAD_NICKNAME');
  c.send({ t: 'JOIN_ROOM', code: 'ZZZZZ', nickname: 'Can' });
  assert.equal(c.error, 'ROOM_NOT_FOUND');
});

test('oda en fazla 4 insan; aynı bağlantı iki odaya giremez', () => {
  const h = createHarness();
  const { code, humans } = createRoom(h, ['A', 'B', 'C', 'D']);
  assert.equal(humans.length, 4);
  const e = h.connect();
  e.send({ t: 'JOIN_ROOM', code, nickname: 'E' });
  assert.equal(e.error, 'ROOM_FULL');
  humans[1].send({ t: 'CREATE_ROOM', nickname: 'Z' });
  assert.equal(humans[1].error, 'ALREADY_IN_ROOM');
});

test('bot ekleme/çıkarma: yalnız oda sahibi; botların özellikleri lobide görünür; isimler çakışmaz', () => {
  const h = createHarness();
  const { host, humans } = createRoom(h, ['Serhan', 'Can']);
  humans[1].send({ t: 'ADD_BOT' });
  assert.equal(humans[1].error, 'NOT_HOST');
  host.send({ t: 'ADD_BOT' });
  host.send({ t: 'ADD_BOT' });
  const seats = host.last('ROOM_STATE').seats;
  assert.deepEqual(seats.map((x) => x.kind), ['human', 'human', 'bot', 'bot']);
  for (const b of seats.slice(2)) {
    assert.ok(b.name && (b.gender === 'F' || b.gender === 'M'));
    assert.equal(Object.keys(b.traits).length, 9);
    for (const v of Object.values(b.traits)) assert.ok(v >= 1 && v <= 100);
  }
  assert.notEqual(seats[2].name, seats[3].name);
  host.send({ t: 'ADD_BOT' });
  assert.equal(host.error, 'ROOM_FULL');
  host.send({ t: 'REMOVE_BOT', seat: 1 });
  assert.equal(host.error, 'NOT_A_BOT_SEAT');
  host.send({ t: 'REMOVE_BOT', seat: 3 });
  assert.equal(host.last('ROOM_STATE').seats[3].kind, 'empty');
});

test('oyun başlatma: boş koltuklar botla dolar (1 insan -> 3 bot, 4 insan -> 0 bot); yalnız oda sahibi', () => {
  const h1 = createHarness();
  const r1 = createRoom(h1, ['A']);
  r1.host.send({ t: 'START_GAME' });
  assert.deepEqual(r1.host.last('ROOM_STATE').seats.map((x) => x.kind), ['human', 'bot', 'bot', 'bot']);
  assert.equal(r1.host.last('ROOM_STATE').phase, 'PLAYING');

  const h2 = createHarness();
  const r2 = createRoom(h2, ['A', 'B', 'C', 'D']);
  r2.humans[2].send({ t: 'START_GAME' });
  assert.equal(r2.humans[2].error, 'NOT_HOST');
  r2.host.send({ t: 'START_GAME' });
  assert.deepEqual(r2.host.last('ROOM_STATE').seats.map((x) => x.kind), ['human', 'human', 'human', 'human']);
  const late = h2.connect();
  late.send({ t: 'JOIN_ROOM', code: r2.code, nickname: 'Geç' });
  assert.equal(late.error, 'ROOM_IN_PROGRESS'); // başlamış odaya yalnız token ile dönülebilir
});

test('lobide ayrılan oyuncunun koltuğu boşalır; oda sahibi devredilir; son kişi çıkınca oda silinir', () => {
  const h = createHarness();
  const { code, host, humans } = createRoom(h, ['A', 'B']);
  host.send({ t: 'LEAVE_ROOM' });
  assert.ok(host.last('LEFT_ROOM'));
  const s = humans[1].last('ROOM_STATE');
  assert.equal(s.hostSeat, 1);
  assert.equal(s.seats[0].kind, 'empty');
  humans[1].close();
  assert.equal(room(h, code), undefined);
});

test('geçersiz mesajlar hata kodu döner, sunucu çökmez', () => {
  const h = createHarness();
  const c = h.connect();
  c.send(null); assert.equal(c.error, 'BAD_MESSAGE');
  c.send({ x: 1 }); assert.equal(c.error, 'BAD_MESSAGE');
  c.send({ t: 'NOPE' }); assert.equal(c.error, 'UNKNOWN_MESSAGE');
  c.send({ t: 'PLAY_CARD', card: '2C' }); assert.equal(c.error, 'NOT_IN_ROOM');
  c.send({ t: 'ADD_BOT' }); assert.equal(c.error, 'NOT_IN_ROOM');
  c.send({ t: 'RESUME', token: 'yok' }); assert.equal(c.error, 'INVALID_TOKEN');
  c.send({ t: 'CREATE_ROOM', nickname: 5 }); assert.equal(c.error, 'BAD_NICKNAME');
  c.send({ t: 'PING' }); assert.ok(c.last('PONG'));
});

// ---------- oyun akışı ----------
function startSolo(h, nick = 'Serhan') {
  const r = createRoom(h, [nick]);
  r.host.send({ t: 'START_GAME' });
  return r;
}

test('oyun başlar: her oyuncuya yalnız kendi görünümü gider (başkasının eli sızmaz)', () => {
  const h = createHarness();
  const r = createRoom(h, ['A', 'B']);
  r.host.send({ t: 'START_GAME' });
  const [a, b] = r.humans;
  assert.equal(a.view.seat, 0);
  assert.equal(b.view.seat, 1);
  const st = room(h, r.code).state;
  const ja = JSON.stringify(a.msgs.filter((m) => m.t === 'GAME_VIEW'));
  for (const seat of [1, 2, 3]) for (const c of st.hand.hands[seat]) assert.ok(!ja.includes(`"${c}"`), `A'nın mesajlarında ${seat}. elin kartı`);
  assert.equal(a.view.myHand.length, 13);
  assert.ok(!JSON.stringify(a.msgs).includes(b.token));
});

test('bot hamlesi düşünme süresinden (2-10 sn) önce uygulanmaz, sonra uygulanır', () => {
  const h = createHarness();
  const r = startSolo(h);
  const st0 = room(h, r.code).state;
  const botSeat = [1, 2, 3].includes(st0.turn) ? st0.turn : null;
  if (botSeat === null) { // sıra insandaysa hamleyi yap, sıra bota geçsin
    h.autoPlay(r.host);
  }
  const st = room(h, r.code).state;
  const turn = st.turn;
  assert.notEqual(turn, 0, 'sıra botta');
  const think = botMsgs(r.host).at(-1);
  assert.equal(think.seat, turn);
  assert.ok(think.delayMs >= 2000 && think.delayMs <= 10000, `gecikme ${think.delayMs}`);
  const before = JSON.stringify(room(h, r.code).state);
  h.scheduler.advance(think.delayMs - 1);
  assert.equal(JSON.stringify(room(h, r.code).state), before, 'süre dolmadan değişmez');
  h.scheduler.advance(2);
  assert.notEqual(JSON.stringify(room(h, r.code).state), before, 'süre dolunca bot oynar');
});

test('insan sırası değilken oynarsa motor hata kodu döner; yasadışı kart reddedilir', () => {
  const h = createHarness();
  const r = startSolo(h);
  const st = room(h, r.code).state;
  if (st.turn !== 0) { r.host.send({ t: 'CHOOSE_CONTRACT', contract: 'KUPA' }); assert.equal(r.host.error, 'NOT_YOUR_TURN'); }
  else {
    r.host.send({ t: 'PLAY_CARD', card: '2C' }); assert.equal(r.host.error, 'WRONG_PHASE');
    r.host.send({ t: 'CHOOSE_CONTRACT', contract: 'KOZ', trump: 'S' }); assert.equal(r.host.error, 'ILLEGAL_CONTRACT'); // ilk 4 el ceza
  }
});

test('tam oyun: 2 insan (otomatik) + 2 bot 20 eli bitirir, toplam puan 0', { timeout: 120000 }, () => {
  const h = createHarness({ thinkDelayScale: 0.001, handPauseMs: 10 });
  const r = createRoom(h, ['A', 'B']);
  r.host.send({ t: 'START_GAME' });
  let guard = 0;
  while (room(h, r.code) && room(h, r.code).phase === 'PLAYING' && guard++ < 5000) {
    let acted = false;
    for (const c of r.humans) acted = h.autoPlay(c) || acted;
    if (!acted) h.scheduler.advance(50);
  }
  const v = r.host.view;
  assert.equal(v.phase, 'GAME_OVER');
  assert.equal(v.handResults.length, 20);
  assert.equal(v.scores.reduce((a, b) => a + b, 0), 0);
  assert.equal(r.host.last('ROOM_STATE').phase, 'FINISHED');
});

// ---------- bağlantı kopması, bot devralma ----------
// İnsan (koltuk 0) için sıra gelene kadar ilerletir.
function advanceToHumanTurn(h, r, human) {
  let guard = 0;
  while (guard++ < 400) {
    const st = room(h, r.code).state;
    if ((st.phase === 'CONTRACT_SELECT' || st.phase === 'PLAYING') && st.turn === human.seat) return;
    h.scheduler.advance(1000);
  }
  throw new Error('insanın sırası gelmedi');
}

test('kopma: 30 sn dolmadan bot devralmaz; dolunca devralır ve oynar (odada başka bağlı insan var)', () => {
  const h = createHarness({ handPauseMs: 10 });
  const r = createRoom(h, ['A', 'B']);
  r.host.send({ t: 'START_GAME' });
  const [a, b] = r.humans;
  // A'nın sırası gelene kadar ilerle; B'nin sırası gelirse B oynar
  let guard = 0;
  for (;;) {
    const st = room(h, r.code).state;
    if (st.turn === 0 && (st.phase === 'CONTRACT_SELECT' || st.phase === 'PLAYING')) break;
    if (!h.autoPlay(b)) h.scheduler.advance(1000);
    assert.ok(guard++ < 400, 'A nın sırası gelmedi');
  }
  a.close();
  const before = JSON.stringify(room(h, r.code).state);
  h.scheduler.advance(29_000);
  assert.equal(room(h, r.code).seats[0].control, 'human');
  assert.equal(JSON.stringify(room(h, r.code).state), before, 'süre dolmadan A nın yerine kimse oynamaz');
  h.scheduler.advance(1_100);
  assert.equal(room(h, r.code).seats[0].control, 'bot');
  assert.ok(b.all('SEAT_EVENT').some((e) => e.event === 'BOT_TOOK_OVER' && e.seat === 0));
  h.scheduler.advance(15_000);
  assert.notEqual(JSON.stringify(room(h, r.code).state), before, 'bot A nın yerine oynadı');
});

test('kopma: süre dolmadan token ile dönüş devralmayı iptal eder', () => {
  const h = createHarness({ handPauseMs: 10 });
  const r = startSolo(h);
  advanceToHumanTurn(h, r, r.host);
  const token = r.host.token;
  r.host.close();
  h.scheduler.advance(20_000);
  const back = h.connect();
  back.send({ t: 'RESUME', token });
  assert.equal(back.last('ROOM_JOINED').resumed, true);
  assert.equal(back.last('ROOM_JOINED').seat, 0);
  assert.ok(back.view, 'görünüm yeniden gönderildi');
  h.scheduler.advance(60_000);
  assert.equal(room(h, r.code).seats[0].control, 'human');
  back.send({ t: 'PLAY_CARD', card: back.view.legalCards[0] }); // oynayabilir
  assert.notEqual(back.error, 'SEAT_BOT_CONTROLLED');
});

test('devralmadan sonra dönen insan: o el bot oynar, sonraki elin başında koltuk geri verilir', { timeout: 120000 }, () => {
  const h = createHarness({ handPauseMs: 10, thinkDelayScale: 0.001 });
  const r = createRoom(h, ['A', 'B']);
  r.host.send({ t: 'START_GAME' });
  const [a, b] = r.humans;
  let guard = 0;
  for (;;) { // A'nın sırası gelene kadar (B otomatik oynar)
    const st = room(h, r.code).state;
    if (st.turn === 0 && (st.phase === 'CONTRACT_SELECT' || st.phase === 'PLAYING')) break;
    if (!h.autoPlay(b)) h.scheduler.advance(20);
    assert.ok(guard++ < 2000);
  }
  const token = a.token;
  a.close();
  h.scheduler.advance(31_000); // B oynamıyor: A nın yerine bot oynar, sıra B ye gelince oyun bekler
  assert.equal(room(h, r.code).seats[0].control, 'bot');
  const back = h.connect();
  back.send({ t: 'RESUME', token });
  assert.equal(back.last('ROOM_JOINED').resumed, true);
  assert.ok(back.view && back.view.myHand.length > 0);
  back.send({ t: 'PLAY_CARD', card: back.view.myHand[0] });
  assert.equal(back.error, 'SEAT_BOT_CONTROLLED');
  const handNo = room(h, r.code).state.handNo;
  guard = 0;
  while (room(h, r.code).state.handNo === handNo && guard++ < 5000) {
    if (!h.autoPlay(b)) h.scheduler.advance(20);
  }
  assert.equal(room(h, r.code).seats[0].control, 'human', 'koltuk geri verildi');
  assert.ok(back.all('SEAT_EVENT').some((e) => e.event === 'CONTROL_RETURNED'));
});

test('oyun sürerken ayrılan oyuncunun yerini bot hemen alır ve koltuk geri alınamaz', () => {
  const h = createHarness({ handPauseMs: 10 });
  const r = createRoom(h, ['A', 'B']);
  r.host.send({ t: 'START_GAME' });
  const b = r.humans[1];
  const token = b.token;
  b.send({ t: 'LEAVE_ROOM' });
  assert.equal(room(h, r.code).seats[1].control, 'bot');
  const again = h.connect();
  again.send({ t: 'RESUME', token });
  assert.equal(again.error, 'INVALID_TOKEN');
  assert.ok(r.host.all('SEAT_EVENT').some((e) => e.event === 'LEFT' && e.seat === 1));
});

test('hiç bağlı insan kalmazsa: bekleme süresine kadar oyun ilerlemez, sonra botlar hızla oyunu bitirir; oda 5 dk sonra silinir', () => {
  const h = createHarness({ handPauseMs: 6000 });
  const r = startSolo(h);
  advanceToHumanTurn(h, r, r.host);
  const token = r.host.token;
  r.host.close();
  const frozen = JSON.stringify(room(h, r.code).state);
  h.scheduler.advance(29_000);
  assert.equal(JSON.stringify(room(h, r.code).state), frozen, 'bekleme süresi dolmadan ilerlemez');
  h.scheduler.advance(2_000);
  assert.equal(room(h, r.code).seats[0].control, 'bot');
  h.scheduler.advance(100_000); // gecikmesiz oynarlar: normal hızda saatler sürecek oyun saniyeler içinde biter
  assert.equal(room(h, r.code).state.phase, 'GAME_OVER');
  assert.equal(room(h, r.code).phase, 'FINISHED');
  assert.equal(room(h, r.code).state.scores.reduce((a, b) => a + b, 0), 0);
  h.scheduler.advance(170_000); // bağlantı kopmasından 5 dk
  assert.equal(room(h, r.code), undefined, 'oda silindi');
  const c = h.connect();
  c.send({ t: 'RESUME', token });
  assert.equal(c.error, 'INVALID_TOKEN');
});

test('5 dakika dolmadan dönen insan biten oyunun sonucunu görür', () => {
  const h = createHarness({ handPauseMs: 6000 });
  const r = startSolo(h);
  advanceToHumanTurn(h, r, r.host);
  const token = r.host.token;
  r.host.close();
  h.scheduler.advance(140_000);
  assert.equal(room(h, r.code).state.phase, 'GAME_OVER');
  const back = h.connect();
  back.send({ t: 'RESUME', token });
  assert.equal(back.last('ROOM_JOINED').resumed, true);
  assert.equal(back.view.phase, 'GAME_OVER');
  assert.equal(back.view.handResults.length, 20);
});

test('aynı token ile ikinci bağlantı eskisini düşürür (SESSION_REPLACED)', () => {
  const h = createHarness();
  const r = startSolo(h);
  const old = r.host;
  const fresh = h.connect();
  fresh.send({ t: 'RESUME', token: old.token });
  assert.equal(old.last('ERROR').code, 'SESSION_REPLACED');
  assert.ok(h.closed.has(old.id));
  assert.equal(fresh.last('ROOM_JOINED').resumed, true);
  old.send({ t: 'PLAY_CARD', card: '2C' });
  assert.equal(old.error, 'NOT_IN_ROOM');
});
