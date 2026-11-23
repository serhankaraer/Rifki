import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDeck, suitOf, createRng, createGame, applyCommand, viewFor, currentOptions, RuleError,
  legalCards, breaksHearts, advanceTrumpRun, rifkiNeedsRedeal, trickWinner, scoreHand, selectableContracts, newLedger, isLedgerFeasible,
  PENALTY_TYPES, STRUCTURE,
} from '../src/index.js';

// ---- yardımcılar ----
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function randomContractCmd(state, rng) {
  const o = currentOptions(state);
  const choices = [];
  if (o.koz) choices.push('KOZ');
  choices.push(...o.penalties);
  const contract = pick(choices, rng);
  return { type: 'CHOOSE_CONTRACT', seat: o.seat, contract, trump: contract === 'KOZ' ? pick(['C', 'D', 'H', 'S'], rng) : undefined };
}

// Sözleşme seç; Rıfkı yeniden dağıtımı tetiklenirse (faz hâlâ CONTRACT_SELECT) tekrar seçer.
function chooseUntilPlaying(state, rng, contractCmd) {
  let s = state;
  for (let i = 0; i < 50 && s.phase === 'CONTRACT_SELECT'; i++) {
    s = applyCommand(s, contractCmd ? { ...contractCmd, seat: s.turn } : randomContractCmd(s, rng)).state;
  }
  assert.equal(s.phase, 'PLAYING');
  return s;
}

function playOutHand(state, rng, contractCmd) {
  let s = chooseUntilPlaying(state, rng, contractCmd);
  while (s.phase === 'PLAYING') {
    const o = currentOptions(s);
    assert.ok(o.cards.length > 0, 'oynanabilir kart olmalı');
    s = applyCommand(s, { type: 'PLAY_CARD', seat: o.seat, card: pick(o.cards, rng) }).state;
  }
  return s;
}

// ---- dağıtım ----
test('deste 52 benzersiz kart; her el 13 kart', () => {
  assert.equal(new Set(makeDeck()).size, 52);
  const { state } = createGame({ seed: 'a' });
  const all = state.hand.hands.flat();
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
  state.hand.hands.forEach((h) => assert.equal(h.length, 13));
});

test('aynı seed aynı dağıtım, farklı seed farklı dağıtım', () => {
  const a = createGame({ seed: 'x' }).state;
  const b = createGame({ seed: 'x' }).state;
  const c = createGame({ seed: 'y' }).state;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.hand.hands, c.hand.hands);
});

test('1. elde karo 7 kimdeyse o ilk seçici/açıcıdır; sonra saat yönünde döner', () => {
  for (let i = 0; i < 50; i++) {
    const { state } = createGame({ seed: `seed-${i}` });
    assert.ok(state.hand.hands[state.declarer].includes('7D'));
    assert.equal(state.turn, state.declarer);
  }
  const rng = createRng('rot');
  let { state } = createGame({ seed: 'rot' });
  const first = state.declarer;
  state = playOutHand(state, rng, { type: 'CHOOSE_CONTRACT', seat: first, contract: 'KUPA' });
  state = applyCommand(state, { type: 'NEXT_HAND' }).state;
  assert.equal(state.declarer, (first + 1) % 4);
});

// ---- sözleşme kuralları ----
test('ilk 4 el yalnızca ceza; her oyuncu bir kez seçer', () => {
  const rng = createRng('first4');
  let { state } = createGame({ seed: 'first4' });
  const declarers = [];
  for (let hand = 1; hand <= 4; hand++) {
    declarers.push(state.declarer);
    assert.equal(selectableContracts(state.ledger, state.handNo, state.declarer).koz, false);
    assert.throws(
      () => applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.declarer, contract: 'KOZ', trump: 'S' }),
      (e) => e instanceof RuleError && e.code === 'ILLEGAL_CONTRACT',
    );
    state = playOutHand(state, rng);
    if (hand < 4) state = applyCommand(state, { type: 'NEXT_HAND' }).state;
  }
  assert.equal(new Set(declarers).size, 4);
});

test('her ceza türü en fazla 2 kez; aynı tür farklı oyuncularca tekrar seçilebilir', () => {
  const rng = createRng('uses');
  let { state } = createGame({ seed: 'uses' });
  state = playOutHand(state, rng, { type: 'CHOOSE_CONTRACT', seat: state.declarer, contract: 'KUPA' });
  state = applyCommand(state, { type: 'NEXT_HAND' }).state;
  state = playOutHand(state, rng, { type: 'CHOOSE_CONTRACT', seat: state.declarer, contract: 'KUPA' });
  state = applyCommand(state, { type: 'NEXT_HAND' }).state;
  assert.equal(state.ledger.typeUses.KUPA, 2);
  assert.throws(
    () => applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.declarer, contract: 'KUPA' }),
    (e) => e.code === 'ILLEGAL_CONTRACT',
  );
});

test('oyuncu başı 3 ceza + 2 koz; defter tutarlılığı', () => {
  const l = newLedger();
  assert.ok(isLedgerFeasible(l));
  const o = selectableContracts(l, 5, 0);
  assert.equal(o.koz, true);
  assert.deepEqual(o.penalties, PENALTY_TYPES);
  l.koz[0] = 2;
  assert.equal(selectableContracts(l, 5, 0).koz, false);
  const l2 = newLedger(); l2.ceza[1] = 3;
  assert.deepEqual(selectableContracts(l2, 5, 1).penalties, []);
});

// ---- tur kuralları ----
const mk = (contract, hands, plays, heartsBroken = false, trumpBroken = false) => ({ contract, hands, trick: { leader: plays[0]?.seat ?? 0, plays }, heartsBroken, trumpBroken });
const led9C = [{ seat: 1, card: '9C' }];

test('renge uyma zorunluluğu', () => {
  const h = mk({ type: 'KUPA' }, [['2C', 'KC', '3D'], [], [], []], led9C);
  assert.deepEqual(legalCards(h, 0).sort(), ['2C', 'KC'].sort());
});

test('koz elinde rengi yoksa koz oynamak zorunda; kozu da yoksa serbest', () => {
  const h1 = mk({ type: 'KOZ', trump: 'S' }, [['2H', 'KS', '3D'], [], [], []], led9C);
  assert.deepEqual(legalCards(h1, 0), ['KS']);
  const h2 = mk({ type: 'KOZ', trump: 'S' }, [['2H', '3D'], [], [], []], led9C);
  assert.equal(legalCards(h2, 0).length, 2);
});

test('ceza kartı atma zorunluluğu (Kız, Erkek, Kupa, Rıfkı)', () => {
  assert.deepEqual(legalCards(mk({ type: 'KIZ' }, [['QH', '2D', '3S'], [], [], []], led9C), 0), ['QH']);
  assert.deepEqual(legalCards(mk({ type: 'ERKEK' }, [['KD', 'JH', '2S'], [], [], []], led9C), 0).sort(), ['JH', 'KD']);
  assert.deepEqual(legalCards(mk({ type: 'KUPA' }, [['2H', '9H', '3S'], [], [], []], led9C), 0).sort(), ['2H', '9H']);
  // Rıfkı: papaz varsa papaz zorunlu; papaz yoksa herhangi bir kupa; kupa da yoksa serbest
  assert.deepEqual(legalCards(mk({ type: 'RIFKI' }, [['KH', '2H', '3S'], [], [], []], led9C), 0), ['KH']);
  assert.deepEqual(legalCards(mk({ type: 'RIFKI' }, [['5H', '2H', '3S'], [], [], []], led9C), 0).sort(), ['2H', '5H']);
  assert.deepEqual(legalCards(mk({ type: 'RIFKI' }, [['3S', '4D'], [], [], []], led9C), 0).sort(), ['3S', '4D']);
  // Rıfkı'da rengi varsa renge uymak önceliklidir
  assert.deepEqual(legalCards(mk({ type: 'RIFKI' }, [['KH', '2C'], [], [], []], led9C), 0), ['2C']);
  // Son İki / El Almaz: serbest
  assert.equal(legalCards(mk({ type: 'SON_IKI' }, [['QH', '2D'], [], [], []], led9C), 0).length, 2);
});

test('Rıfkı/Kupa: kupa dökülmeden kupa açılamaz (yalnız kupası kalan açabilir)', () => {
  const open = (type, hand, broken) => legalCards(mk({ type }, [hand, [], [], []], [], broken), 0);
  assert.deepEqual(open('KUPA', ['2H', '5C'], false), ['5C']);
  assert.deepEqual(open('RIFKI', ['2H', '5C'], false), ['5C']);
  assert.equal(open('KUPA', ['2H', '3H'], false).length, 2);
  assert.equal(open('KUPA', ['2H', '5C'], true).length, 2);
  assert.equal(open('KIZ', ['2H', '5C'], false).length, 2); // diğer sözleşmelerde kısıt yok
});

test('Kupa almaz: kupa yalnız rengi olmayan oyuncu kupa atmak zorunda kalınca dökülür; kupa açmak/kupaya kupa atmak dökmez', () => {
  const led = (c) => [{ seat: 1, card: c }];
  assert.equal(breaksHearts('KUPA', led('9C'), '2H'), true, 'rengi olmayan kupa attı');
  assert.equal(breaksHearts('KUPA', [], '2H'), false, 'kupa ile açılış (yalnız kupası kalan)');
  assert.equal(breaksHearts('KUPA', led('9H'), '2H'), false, 'kupaya kupa uydu');
  assert.equal(breaksHearts('KUPA', led('9C'), '2D'), false);
  assert.equal(breaksHearts('RIFKI', [], '2H'), false, 'Rıfkı da aynı: kupa açmak dökmez');
  assert.equal(breaksHearts('RIFKI', led('9C'), 'KH'), true, 'Rıfkı: rengi olmayan kupa papazı atınca dökülür');
  // oyun içinde: yalnız kupası olan açar, diğerleri uyar -> dökülmez; sonra rengi olmayan kupa atınca dökülür
  let { state } = createGame({ seed: 'hb' });
  state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: 'KUPA' }).state;
  const d = state.turn; const order = [0, 1, 2, 3].map((i) => (d + i) % 4);
  const layout = [['2H', '3H'], ['4H', '5C'], ['6H', '7C'], ['8H', '9C']];
  state.hand.hands = [0, 1, 2, 3].map((seat) => layout[order.indexOf(seat)]);
  state = applyCommand(state, { type: 'PLAY_CARD', seat: order[0], card: '2H' }).state;
  state = applyCommand(state, { type: 'PLAY_CARD', seat: order[1], card: '4H' }).state;
  assert.equal(state.hand.heartsBroken, false);
  state = applyCommand(state, { type: 'PLAY_CARD', seat: order[2], card: '6H' }).state;
  state = applyCommand(state, { type: 'PLAY_CARD', seat: order[3], card: '8H' }).state;
  assert.equal(state.hand.heartsBroken, false, 'dört kupa tur oynandı ama kimse rengi olmadığı için kupa atmadı');
});

test('koz: A-K-Q ile koz açan oyuncu arka arkaya üç turda A, K, Q açmak zorundadır', () => {
  const koz = { type: 'KOZ', trump: 'S' };
  const hand = ['AS', 'KS', 'QS', '9S', '2D', '3C'];
  const h = { contract: koz, hands: [hand, [], [], []], trick: { leader: 0, plays: [] }, heartsBroken: false, trumpBroken: false, trumpRun: null };
  // 1. tur: A açılır -> seri başlar, K ve Q kalır
  advanceTrumpRun(h, 0, 'AS', hand);
  assert.deepEqual(h.trumpRun, { seat: 0, need: ['K', 'Q'] });
  h.hands[0] = hand.filter((c) => c !== 'AS');
  assert.deepEqual(legalCards(h, 0).sort(), ['KS', 'QS'], 'seri sürerken yalnız K ya da Q açılabilir');
  // 2. tur: K
  advanceTrumpRun(h, 0, 'KS', h.hands[0]);
  assert.deepEqual(h.trumpRun, { seat: 0, need: ['Q'] });
  h.hands[0] = h.hands[0].filter((c) => c !== 'KS');
  assert.deepEqual(legalCards(h, 0), ['QS']);
  // 3. tur: Q -> seri biter, normal kurallara dönülür (koz hâlâ kırılmamış, A-K-Q artık yok)
  advanceTrumpRun(h, 0, 'QS', h.hands[0]);
  assert.equal(h.trumpRun, null);
  h.hands[0] = h.hands[0].filter((c) => c !== 'QS');
  assert.deepEqual(legalCards(h, 0).sort(), ['2D', '3C']);
  // koz kırılmışsa ya da yalnız koz varsa seri zorunluluğu doğmaz
  const broken = { ...h, hands: [hand, [], [], []], trumpBroken: true, trumpRun: null, trick: { leader: 0, plays: [] } };
  advanceTrumpRun(broken, 0, 'AS', hand);
  assert.equal(broken.trumpRun, null);
  const onlyTrumps = ['AS', 'KS', 'QS', '2S'];
  const ot = { contract: koz, hands: [onlyTrumps, [], [], []], trick: { leader: 0, plays: [] }, trumpBroken: false, trumpRun: null };
  advanceTrumpRun(ot, 0, '2S', onlyTrumps);
  assert.equal(ot.trumpRun, null);
  // A-K-Q olmadan açan (ör. koz kırılmışken) seri başlatmaz; eksik onurla açılamaz
  const noQ = { contract: koz, hands: [['AS', 'KS', '5S', '2D'], [], [], []], trick: { leader: 0, plays: [] }, trumpBroken: false, trumpRun: null };
  assert.deepEqual(legalCards(noQ, 0), ['2D']);
});

test('oyun içinde: A-K-Q serisi motor tarafından zorunlu kılınır', () => {
  let { state } = createGame({ seed: 'akq' });
  state.handNo = 5;
  state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: 'KOZ', trump: 'S' }).state;
  const d = state.turn; const order = [0, 1, 2, 3].map((i) => (d + i) % 4);
  const layout = [['AS', 'KS', 'QS', '2D', '3D'], ['4S', '4D', '5D', '6D', '7D'], ['5S', '8D', '9D', '10D', 'JD'], ['6S', 'QD', 'KD', 'AD', '2C']];
  state.hand.hands = [0, 1, 2, 3].map((seat) => layout[order.indexOf(seat)]);
  state = applyCommand(state, { type: 'PLAY_CARD', seat: d, card: 'AS' }).state;
  for (let i = 1; i < 4; i++) state = applyCommand(state, { type: 'PLAY_CARD', seat: order[i], card: ['4S', '5S', '6S'][i - 1] }).state;
  assert.equal(state.turn, d, 'A açan turu kazanır');
  assert.deepEqual(viewFor(state, d).trumpRun, { seat: d, need: ['K', 'Q'] });
  assert.throws(() => applyCommand(state, { type: 'PLAY_CARD', seat: d, card: '2D' }), (e) => e.code === 'ILLEGAL_CARD');
  state = applyCommand(state, { type: 'PLAY_CARD', seat: d, card: 'QS' }).state; // Q önce de olabilir
  assert.deepEqual(viewFor(state, d).trumpRun, { seat: d, need: ['K'] });
});

test('ceza sözleşmeleri: rengi olmayan oyuncu elindeki ceza kartını atmak zorundadır', () => {
  const led = [{ seat: 1, card: '9C' }];
  const legal = (type, hand) => legalCards(mk({ type }, [hand, [], [], []], led), 0).sort();
  assert.deepEqual(legal('KIZ', ['QH', 'QS', '5D', '6D']), ['QH', 'QS']);
  assert.deepEqual(legal('KIZ', ['5D', '6D']), ['5D', '6D'], 'ceza kartı yoksa serbest');
  assert.deepEqual(legal('ERKEK', ['KD', 'JS', 'QS', '5D']), ['JS', 'KD']);
  assert.deepEqual(legal('KUPA', ['2H', '9H', '5D']), ['2H', '9H']);
  assert.deepEqual(legal('RIFKI', ['KH', '2H', '5D']), ['KH'], 'Rıfkı: kupa papazı varsa onu');
  assert.deepEqual(legal('RIFKI', ['2H', '9H', '5D']), ['2H', '9H'], 'Rıfkı: papaz yoksa herhangi bir kupa');
  assert.deepEqual(legal('RIFKI', ['5D', '6D']), ['5D', '6D']);
  // renge uyabiliyorsa ceza kartını atamaz (önce renge uyma)
  assert.deepEqual(legalCards(mk({ type: 'KIZ' }, [['QH', '2C', '5D'], [], [], []], led), 0), ['2C']);
});

test('ceza sözleşmelerinde büyütme zorunluluğu yoktur; koz yükseltme yalnız koz içindir', () => {
  const plays = [{ seat: 1, card: '9C' }, { seat: 2, card: 'KC' }];
  for (const type of ['KIZ', 'ERKEK', 'KUPA', 'RIFKI', 'EL_ALMAZ', 'SON_IKI']) {
    assert.deepEqual(legalCards(mk({ type }, [['2C', 'QC', 'AC'], [], [], []], plays), 0).sort(), ['2C', 'AC', 'QC'], `${type}: küçük kart da atılabilir`);
  }
  // koz oyununda koz olmayan rengi büyütmek zorunlu değil
  assert.deepEqual(legalCards(mk({ type: 'KOZ', trump: 'S' }, [['2C', 'QC', 'AC'], [], [], []], plays), 0).sort(), ['2C', 'AC', 'QC']);
});

test('viewFor: tricksTaken alınan el sayısını verir', () => {
  const rng = createRng('tt');
  let { state } = createGame({ seed: 'tt' });
  state.handNo = 5;
  state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: 'EL_ALMAZ' }).state;
  assert.deepEqual(viewFor(state, 0).tricksTaken, [0, 0, 0, 0]);
  for (let i = 0; i < 8; i++) { const o = currentOptions(state); state = applyCommand(state, { type: 'PLAY_CARD', seat: o.seat, card: pick(o.cards, rng) }).state; }
  assert.equal(viewFor(state, 0).tricksTaken.reduce((a, b) => a + b, 0), 2);
});

test('Rıfkı yeniden dağıtım şartı: başkasında kupa yalnızca [A], [K] ya da [A,K]', () => {
  const H = (...hearts) => ['2C', '3C', ...hearts];
  const mkHands = (a, b, c, d) => [a, b, c, d];
  assert.equal(rifkiNeedsRedeal(mkHands(H('2H', '5H'), H('AH'), H('3H', '4H'), H('9H')), 0), true, 'tek A');
  assert.equal(rifkiNeedsRedeal(mkHands(H('2H'), H('3H', '4H'), H('KH'), H('9H')), 0), true, 'tek K');
  assert.equal(rifkiNeedsRedeal(mkHands(H('2H'), H('3H', '4H'), H('9H'), H('AH', 'KH')), 0), true, 'A ve K');
  assert.equal(rifkiNeedsRedeal(mkHands(H('2H'), H('AH', 'QH'), H('KH', '3H'), H('AH', 'KH', 'QH')), 0), false, 'A+Q, K+3, A+K+Q yeniden dağıtım gerektirmez');
  assert.equal(rifkiNeedsRedeal(mkHands(H('AH'), H('2H'), H('3H'), H('4H')), 0), false, 'seçicinin kendi eli sayılmaz');
  assert.equal(rifkiNeedsRedeal(mkHands(H(), H('2H'), H('3H'), H('4H')), 0), false, 'kupası olmayan oyuncu tetiklemez');
});

test('Rıfkı seçilince tetikleyici varsa el yeniden dağıtılır; sözleşme kaydedilmez, seçici yine seçer', () => {
  let { state } = createGame({ seed: 'redeal' });
  state.handNo = 3; state.firstDeclarer = 0; state.declarer = 2; state.turn = 2;
  const d = state.declarer;
  const others = [0, 1, 2, 3].filter((x) => x !== d);
  // tetikleyici: bir rakipte yalnız kupa A
  const hands = state.hand.hands.map((x) => x.filter((c) => !c.endsWith('H')));
  const noHearts = state.hand.hands.flat().filter((c) => c.endsWith('H'));
  hands[others[0]] = [...hands[others[0]].slice(0, 12), 'AH'];
  const before = JSON.stringify(hands);
  state.hand.hands = hands;
  const ledgerBefore = JSON.stringify(state.ledger);
  const r = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'RIFKI' });
  assert.ok(r.events.some((e) => e.type === 'REDEALT'));
  assert.ok(r.events.some((e) => e.type === 'HAND_DEALT'));
  assert.equal(JSON.stringify(r.state.ledger), ledgerBefore, 'sözleşme hakkı harcanmaz');
  assert.equal(r.state.phase, 'CONTRACT_SELECT');
  assert.equal(r.state.handNo, 3);
  assert.equal(r.state.declarer, d);
  assert.equal(r.state.turn, d);
  assert.equal(r.state.redeals, 1);
  assert.equal(new Set(r.state.hand.hands.flat()).size, 52);
  assert.notEqual(JSON.stringify(r.state.hand.hands), before);
  assert.equal(r.state.hand.contract, null);
  // tetikleyici yoksa normal ilerler
  const ok = JSON.parse(JSON.stringify(state));
  ok.hand.hands = ok.hand.hands.map((x, i) => (i === others[0] ? [...x.slice(0, 12), '2H'] : x));
  const r2 = applyCommand(ok, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'RIFKI' });
  assert.ok(!r2.events.some((e) => e.type === 'REDEALT'));
  assert.equal(r2.state.phase, 'PLAYING');
  // yalnız Rıfkı'da: Kız almaz seçilirse yeniden dağıtım yok
  const r3 = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'KIZ' });
  assert.ok(!r3.events.some((e) => e.type === 'REDEALT'));
});

test('tur kazananı', () => {
  const plays = (cards) => cards.map((card, i) => ({ seat: i, card }));
  assert.equal(trickWinner(plays(['9C', 'KC', 'AD', '2C']), { type: 'KUPA' }), 1);
  assert.equal(trickWinner(plays(['9C', 'KC', '2S', '3S']), { type: 'KOZ', trump: 'S' }), 3);
  assert.equal(trickWinner(plays(['9C', 'KC', '2S', '3S']), { type: 'KIZ' }), 1); // kozsuz: kesmek işe yaramaz
  assert.equal(trickWinner(plays(['9S', 'KS', '2S', '3C']), { type: 'KOZ', trump: 'S' }), 1);
});

// ---- puanlama ----
test('el puanlaması', () => {
  const taken = [['KH', 'QS', 'QD'], ['KC', 'JD', '2H', '3H'], ['QC'], []];
  const w = [0, 1, 1, 2, 2, 2, 0, 0, 1, 3, 3, 3, 3];
  assert.deepEqual(scoreHand({ type: 'RIFKI' }, taken, w), [-320, 0, 0, 0]);
  assert.deepEqual(scoreHand({ type: 'KIZ' }, taken, w), [-200, 0, -100, 0]);
  assert.deepEqual(scoreHand({ type: 'ERKEK' }, taken, w), [-60, -120, 0, 0]);
  assert.deepEqual(scoreHand({ type: 'KUPA' }, taken, w), [-30, -60, 0, 0]);
  assert.deepEqual(scoreHand({ type: 'SON_IKI' }, taken, w), [0, 0, 0, -360]);
  assert.deepEqual(scoreHand({ type: 'EL_ALMAZ' }, taken, w), [-150, -150, -150, -200]);
  assert.deepEqual(scoreHand({ type: 'KOZ', trump: 'S' }, taken, w), [150, 150, 150, 200]);
});

// ---- bilgi sızıntısı ----
test('viewFor başka oyuncunun elini sızdırmaz', () => {
  const { state } = createGame({ seed: 'leak' });
  for (let seat = 0; seat < 4; seat++) {
    const json = JSON.stringify(viewFor(state, seat));
    state.hand.hands.forEach((hand, other) => {
      if (other === seat) return;
      for (const c of hand) assert.ok(!json.includes(`"${c}"`), `koltuk ${seat} görünümünde ${other}. elin kartı: ${c}`);
    });
  }
});

test('hatalı komutlar anlamlı hata kodu verir', () => {
  const { state } = createGame({ seed: 'err' });
  const wrong = (state.declarer + 1) % 4;
  assert.throws(() => applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: wrong, contract: 'KUPA' }), (e) => e.code === 'NOT_YOUR_TURN');
  assert.throws(() => applyCommand(state, { type: 'PLAY_CARD', seat: state.declarer, card: '2C' }), (e) => e.code === 'WRONG_PHASE');
  assert.throws(() => applyCommand(state, { type: 'NEXT_HAND' }), (e) => e.code === 'WRONG_PHASE');
});

test('koz: koz atıldığında sonraki oyuncu kozu yükseltmek zorunda; büyüğü yoksa herhangi koz', () => {
  const koz = { type: 'KOZ', trump: 'S' };
  // koz açıldı (9S): elindeki 10S ve QS daha büyük, 3S küçük -> yalnız büyükler
  const led = [{ seat: 1, card: '9S' }];
  assert.deepEqual(legalCards(mk(koz, [['3S', '10S', 'QS', '2D'], [], [], []], led), 0).sort(), ['10S', 'QS']);
  // büyüğü yoksa elindeki koz serisinden herhangi biri (koz zorunlu)
  assert.deepEqual(legalCards(mk(koz, [['3S', '5S', '2D'], [], [], []], led), 0).sort(), ['3S', '5S']);
});

test('koz: rengi olmayan oyuncu kesmek zorunda; masada koz varsa onu da yükseltmek zorunda', () => {
  const koz = { type: 'KOZ', trump: 'S' };
  const plays = [{ seat: 1, card: '9C' }, { seat: 2, card: '6S' }]; // 6S ile kesildi
  assert.deepEqual(legalCards(mk(koz, [['3S', '8S', 'KS', '2D'], [], [], []], plays), 0).sort(), ['8S', 'KS']);
  assert.deepEqual(legalCards(mk(koz, [['3S', '4S', '2D'], [], [], []], plays), 0).sort(), ['3S', '4S']);
  // renge uyan oyuncu kozu yükseltmek zorunda değil (renk zorunluluğu geçerli)
  assert.deepEqual(legalCards(mk(koz, [['2C', '3S'], [], [], []], plays), 0), ['2C']);
});

test('koz: kırılmadan koz açılamaz; kozun A, K ve Q üçü birden varsa ya da yalnız koz kaldıysa açılabilir', () => {
  const koz = { type: 'KOZ', trump: 'S' };
  const lead = (hand, broken = false) => legalCards(mk(koz, [hand, [], [], []], [], false, broken), 0).sort();
  assert.deepEqual(lead(['3S', '9S', '2D', '5C']), ['2D', '5C']);
  assert.deepEqual(lead(['3S', 'JS', '2D']), ['2D']);
  assert.deepEqual(lead(['3S', 'AS', 'KS', '2D']), ['2D'], 'A ve K yetmez');
  assert.deepEqual(lead(['3S', 'QS', 'KS', '2D']), ['2D'], 'K ve Q yetmez');
  assert.deepEqual(lead(['3S', 'AS', 'KS', 'QS', '2D']), ['2D', 'AS', 'KS', 'QS'].sort(), 'A+K+Q varsa yalnız bu üç kozla açılabilir (3S açılamaz)');
  assert.deepEqual(lead(['3S', '9S']), ['3S', '9S']); // yalnız koz
  assert.deepEqual(lead(['3S', '9S', '2D'], true), ['2D', '3S', '9S'].sort()); // kırılmış
});

test('koz kırılması yalnız rengi olmayan oyuncunun kozla kesmesiyle olur (koz açmak kırmaz)', () => {
  let { state } = createGame({ seed: 'broken' });
  state.handNo = 5; // koz seçilebilen bir el
  state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: 'KOZ', trump: 'S' }).state;
  assert.equal(viewFor(state, 0).trumpBroken, false);
  const rng = createRng('broken-play');
  let expected = false;
  while (state.phase === 'PLAYING') {
    const o = currentOptions(state);
    const card = pick(o.cards, rng);
    const plays = state.hand.trick.plays;
    if (plays.length > 0 && suitOf(plays[0].card) !== 'S' && suitOf(card) === 'S') expected = true;
    state = applyCommand(state, { type: 'PLAY_CARD', seat: o.seat, card }).state;
    assert.equal(viewFor(state, 0).trumpBroken, expected);
  }
  assert.deepEqual(viewFor(state, 0).penaltyTaken, [[], [], [], []]);
});

test('koz açılışı (A+K+Q ile) kozu kırmaz; kesme kırar', () => {
  const mkState = (hands) => {
    let { state } = createGame({ seed: 'cut' });
    state.handNo = 5;
    state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: 'KOZ', trump: 'S' }).state;
    const d = state.turn;
    state.hand.hands = hands.map((x) => x.slice());
    return { state, d };
  };
  // d koz açar (A K Q elinde), diğerleri koz oynar -> kırılmaz
  const a = mkState([['AS', 'KS', 'QS', '2D'], ['3S', '4D'], ['5S', '6D'], ['7S', '8D']]);
  let st = a.state;
  const order = [0, 1, 2, 3].map((i) => (a.d + i) % 4);
  // el dizilimi koltuk numarasına göre atanmış olduğundan, açıcı koltuğun eli ilk dizi olmalı
  st.hand.hands = [0, 1, 2, 3].map((seat) => [['AS', 'KS', 'QS', '2D'], ['3S', '4D'], ['5S', '6D'], ['7S', '8D']][order.indexOf(seat)]);
  st = applyCommand(st, { type: 'PLAY_CARD', seat: order[0], card: 'AS' }).state;
  assert.equal(st.hand.trumpBroken, false);
  st = applyCommand(st, { type: 'PLAY_CARD', seat: order[1], card: '3S' }).state;
  assert.equal(st.hand.trumpBroken, false);
  // d koz olmayan renkle açar, sonraki rengi olmayıp kozla keser -> kırılır
  const b = mkState([['2D', '9C'], ['3S', '4H'], ['5S', '6H'], ['7S', '8H']]);
  const ob = [0, 1, 2, 3].map((i) => (b.d + i) % 4);
  let sb = b.state;
  sb.hand.hands = [0, 1, 2, 3].map((seat) => [['2D', '9C'], ['3S', '4H'], ['5S', '6H'], ['7S', '8H']][ob.indexOf(seat)]);
  sb = applyCommand(sb, { type: 'PLAY_CARD', seat: ob[0], card: '2D' }).state;
  assert.equal(sb.hand.trumpBroken, false);
  sb = applyCommand(sb, { type: 'PLAY_CARD', seat: ob[1], card: '3S' }).state;
  assert.equal(sb.hand.trumpBroken, true);
});

test('erken bitiş: tüm ceza kartları alınınca el biter (Kız/Erkek/Kupa/Rıfkı); El Almaz ve Son İki bitmez', () => {
  for (const [type, total] of [['RIFKI', 1], ['KIZ', 4], ['ERKEK', 8], ['KUPA', 13]]) {
    let early = 0;
    for (let g = 0; g < 40; g++) {
      const rng = createRng(`early-${type}-${g}`);
      let { state } = createGame({ seed: `early-${type}-${g}` });
      const o = currentOptions(state);
      state = chooseUntilPlaying(state, rng, { type: 'CHOOSE_CONTRACT', contract: type });
      let sawAll = false;
      while (state.phase === 'PLAYING') {
        const v = viewFor(state, 0);
        const taken = v.penaltyTaken.flat().length;
        assert.ok(taken < total, 'tüm ceza kartları alınmışsa el sürmemeli');
        const oo = currentOptions(state);
        state = applyCommand(state, { type: 'PLAY_CARD', seat: oo.seat, card: pick(oo.cards, rng) }).state;
      }
      const r = state.handResults.at(-1);
      assert.ok(r.tricksPlayed <= 13);
      if (r.earlyEnd) { early++; assert.ok(r.tricksPlayed < 13); }
      assert.equal(r.deltas.reduce((a, b) => a + b, 0), -{ RIFKI: 320, KIZ: 400, ERKEK: 480, KUPA: 390 }[type]);
      sawAll = true;
      assert.ok(sawAll);
    }
    assert.ok(early > 0, `${type}: en az bir el erken bitmeli`);
  }
  for (const type of ['EL_ALMAZ', 'SON_IKI']) {
    const rng = createRng(`noearly-${type}`);
    let { state } = createGame({ seed: `noearly-${type}` });
    const o = currentOptions(state);
    state = playOutHand(state, rng, { type: 'CHOOSE_CONTRACT', seat: o.seat, contract: type });
    assert.equal(state.handResults.at(-1).tricksPlayed, 13);
    assert.equal(state.handResults.at(-1).earlyEnd, false);
  }
});

test('oyun sonu: yalnız sıfırın üstündeki oyuncular kazanır', () => {
  const rng = createRng('winners');
  let { state } = createGame({ seed: 'winners' });
  let last;
  for (let hand = 1; hand <= STRUCTURE.hands; hand++) {
    state = chooseUntilPlaying(state, rng);
    while (state.phase === 'PLAYING') {
      const oo = currentOptions(state);
      const res = applyCommand(state, { type: 'PLAY_CARD', seat: oo.seat, card: pick(oo.cards, rng) });
      state = res.state;
      const ended = res.events.find((e) => e.type === 'GAME_ENDED');
      if (ended) last = ended;
    }
    if (hand < STRUCTURE.hands) state = applyCommand(state, { type: 'NEXT_HAND' }).state;
  }
  assert.deepEqual(last.winners, state.scores.flatMap((s, i) => (s > 0 ? [i] : [])));
});

// ---- tam oyun simülasyonu ----
test('rastgele tam oyunlar: takılma yok, yapı kuralları ve toplam puan 0', () => {
  for (let g = 0; g < 100; g++) {
    const rng = createRng(`sim-${g}`);
    let { state } = createGame({ seed: `sim-${g}` });
    const handDeltaSums = [];
    for (let hand = 1; hand <= STRUCTURE.hands; hand++) {
      state = playOutHand(state, rng);
      assert.ok(isLedgerFeasible(state.ledger), 'defter tutarlı kalmalı');
      const r = state.handResults.at(-1);
      handDeltaSums.push([r.contract.type, r.deltas.reduce((a, b) => a + b, 0)]);
      if (hand < STRUCTURE.hands) state = applyCommand(state, { type: 'NEXT_HAND' }).state;
    }
    assert.equal(state.phase, 'GAME_OVER');
    assert.equal(state.handResults.length, 20);
    assert.deepEqual(state.ledger.koz, [2, 2, 2, 2]);
    assert.deepEqual(state.ledger.ceza, [3, 3, 3, 3]);
    for (const t of PENALTY_TYPES) assert.equal(state.ledger.typeUses[t], 2);
    // el toplamları: koz +650, Rıfkı -320, Kız -400, Erkek -480, Kupa -390, Son İki -360, El Almaz -650
    const expected = { KOZ: 650, RIFKI: -320, KIZ: -400, ERKEK: -480, KUPA: -390, SON_IKI: -360, EL_ALMAZ: -650 };
    for (const [type, sum] of handDeltaSums) assert.equal(sum, expected[type], `${type} el toplamı`);
    assert.equal(state.scores.reduce((a, b) => a + b, 0), 0, 'oyun sonunda toplam puan 0');
    // ilk 4 el ceza
    assert.ok(state.handResults.slice(0, 4).every((r) => r.contract.type !== 'KOZ'));
  }
});

test('saf fonksiyon: applyCommand girdiyi değiştirmez', () => {
  const { state } = createGame({ seed: 'pure' });
  const snapshot = structuredClone(state);
  applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.declarer, contract: 'KIZ' });
  assert.deepEqual(state, snapshot);
});

// ---- King ----
function kozGame(seed) {
  const { state } = createGame({ seed });
  state.handNo = 5; state.firstDeclarer = 0; state.declarer = 0; state.turn = 0; // ilk 4 el zorunlu ceza: koz 5. elden
  return state;
}

function kingState({ declarerTricks, trickNo, hands }) {
  let state = kozGame('king');
  const d = state.declarer;
  state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'KOZ', trump: 'S', king: true }).state;
  const used = new Set(hands.flat());
  const pool = makeDeck().filter((c) => !used.has(c));
  const taken = [[], [], [], []];
  const others = [0, 1, 2, 3].filter((x) => x !== d);
  for (let i = 0; i < declarerTricks * 4; i++) taken[d].push(pool.shift());
  const rest = trickNo - declarerTricks;
  for (let i = 0; i < rest * 4; i++) taken[others[0]].push(pool.shift());
  state.hand.hands = hands;
  state.hand.takenCards = taken;
  state.hand.trickNo = trickNo;
  state.hand.trick = { leader: d, plays: [] };
  state.turn = d;
  return { state, d, others };
}

test('King yalnız koz sözleşmesinde seçilebilir; sözleşmede ve olayda işaretlenir', () => {
  const state = kozGame('king-flag');
  const d = state.declarer;
  assert.throws(() => applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'KIZ', king: true }), (e) => e.code === 'ILLEGAL_CONTRACT');
  const r = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'KOZ', trump: 'H', king: true });
  assert.equal(r.state.hand.contract.king, true);
  assert.equal(r.events.find((e) => e.type === 'CONTRACT_CHOSEN').king, true);
  assert.equal(viewFor(r.state, d).contract.king, true);
  const plain = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'KOZ', trump: 'H' });
  assert.equal(plain.state.hand.contract.king, undefined);
});

test('King başarılı: 11. el alınınca oyun biter, yalnız seçici çıkar', () => {
  const probe = kozGame('king');
  const d = probe.declarer;
  const lows = [['2C', '3C', '4C'], ['5C', '6C', '7C'], ['8C', '9C', '10C']];
  const hands = [[], [], [], []];
  hands[d] = ['AS', 'KS', 'QS'];
  [0, 1, 2, 3].filter((x) => x !== d).forEach((s, i) => { hands[s] = lows[i]; });
  const { state } = kingState({ declarerTricks: 10, trickNo: 10, hands });
  let s = state;
  let events = [];
  for (const seat of [d, (d + 1) % 4, (d + 2) % 4, (d + 3) % 4]) {
    const card = seat === d ? 'AS' : s.hand.hands[seat][0];
    const r = applyCommand(s, { type: 'PLAY_CARD', seat, card });
    s = r.state; events = r.events;
  }
  assert.equal(s.phase, 'GAME_OVER');
  const ended = events.find((e) => e.type === 'GAME_ENDED');
  assert.deepEqual(ended.winners, [d]);
  assert.equal(ended.king, true);
  assert.equal(events.find((e) => e.type === 'KING_ENDED').success, true);
  assert.equal(viewFor(s, 0).kingEnd.declarer, d);
});

test('King başarısız: seçici 3. eli kaybedince tam olarak o anda biter', () => {
  const probe = kozGame('king');
  const d = probe.declarer;
  const o = [0, 1, 2, 3].filter((x) => x !== d);
  const hands = [[], [], [], []];
  hands[d] = ['2C', '3C']; hands[o[0]] = ['AC', 'KC']; hands[o[1]] = ['QC', 'JC']; hands[o[2]] = ['9C', '8C'];
  const { state } = kingState({ declarerTricks: 9, trickNo: 11, hands });
  state.hand.trick = { leader: o[0], plays: [] };
  state.turn = o[0];
  let s = state; let events = [];
  for (const seat of [o[0], (o[0] + 1) % 4, (o[0] + 2) % 4, (o[0] + 3) % 4]) {
    const card = seat === o[0] ? 'AC' : s.hand.hands[seat][0];
    const r = applyCommand(s, { type: 'PLAY_CARD', seat, card });
    s = r.state; events = r.events;
  }
  assert.equal(s.phase, 'GAME_OVER');
  assert.deepEqual(events.find((e) => e.type === 'GAME_ENDED').winners, o);
  assert.equal(s.kingEnd.success, false);
  assert.equal(s.handResults.length, 0, 'King eli puanlanmaz');
});

test('Rıfkı yeniden dağıtımı: tetikleyen tüm oyuncuların eski elleri olayda açılır', () => {
  let { state } = createGame({ seed: 'reveal' });
  const d = state.declarer;
  const o = [0, 1, 2, 3].filter((x) => x !== d);
  const hands = state.hand.hands.map((x) => x.filter((c) => !c.endsWith('H')));
  hands[o[0]] = [...hands[o[0]].slice(0, 12), 'AH'];
  hands[o[1]] = [...hands[o[1]].slice(0, 11), 'KH', 'AH'].filter((c, i, a) => a.indexOf(c) === i);
  hands[o[2]] = [...hands[o[2]].slice(0, 12), '2H'];
  state.hand.hands = hands;
  const r = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: d, contract: 'RIFKI' });
  const ev = r.events.find((e) => e.type === 'REDEALT');
  assert.deepEqual(ev.reveals.map((x) => x.seat), [o[0], o[1]]);
  assert.deepEqual(ev.reveals[0].hand, hands[o[0]]);
  assert.equal(ev.declarer, d);
});

test('oyun kaydı: oyun bitince tüm elleri, dağıtımları ve turları içerir; oyun sürerken görünümde yoktur', () => {
  const rng = createRng('log-test');
  let { state } = createGame({ seed: 'logseed' });
  let sawEarly = false;
  for (let guard = 0; state.phase !== 'GAME_OVER'; guard++) {
    assert.ok(guard < 5000);
    if (viewFor(state, 0).gameLog) sawEarly = true;
    if (state.phase === 'HAND_SCORED') { state = applyCommand(state, { type: 'NEXT_HAND' }).state; continue; }
    const opts = currentOptions(state);
    let cmd;
    if (opts.kind === 'CHOOSE_CONTRACT') {
      cmd = opts.penalties.length ? { type: 'CHOOSE_CONTRACT', seat: opts.seat, contract: opts.penalties[Math.floor(rng() * opts.penalties.length)] } : { type: 'CHOOSE_CONTRACT', seat: opts.seat, contract: 'KOZ', trump: 'S' };
    } else cmd = { type: 'PLAY_CARD', seat: opts.seat, card: opts.cards[Math.floor(rng() * opts.cards.length)] };
    state = applyCommand(state, cmd).state;
  }
  assert.equal(sawEarly, false, 'oyun sürerken başkalarının elleri sızmaz');
  const log = viewFor(state, 2).gameLog;
  assert.equal(log.length, 20);
  log.forEach((rec, i) => {
    assert.equal(rec.handNo, i + 1);
    assert.equal(rec.deal.length, 4);
    assert.ok(rec.deal.every((h) => h.length === 13));
    assert.ok(rec.tricks.length >= 1 && rec.tricks.length <= 13);
    const hands = rec.deal.map((h) => [...h]);
    for (const tr of rec.tricks) {
      assert.equal(tr.plays.length, 4);
      assert.equal(tr.plays[0].seat, tr.leader, 'ilk kartı açan koltuk');
      for (const p of tr.plays) { // kayıttaki her kart gerçekten o oyuncunun dağıtım elindeydi
        const idx = hands[p.seat].indexOf(p.card);
        assert.ok(idx >= 0, `el ${rec.handNo}: ${p.card} koltuk ${p.seat} elinde yok`);
        hands[p.seat].splice(idx, 1);
      }
    }
    assert.equal(rec.scoresAfter.length, 4);
  });
  assert.deepEqual(log[19].scoresAfter, state.scores);
});

test('oyun kaydı: King ile biten oyunda kesilen el de kayıtta (kingEnd)', () => {
  const probe = kozGame('king');
  const d = probe.declarer;
  const lows = [['2C', '3C', '4C'], ['5C', '6C', '7C'], ['8C', '9C', '10C']];
  const hands = [[], [], [], []];
  hands[d] = ['AS', 'KS', 'QS'];
  [0, 1, 2, 3].filter((x) => x !== d).forEach((x, i) => { hands[x] = lows[i]; });
  let { state: s } = kingState({ declarerTricks: 10, trickNo: 10, hands });
  for (const seat of [d, (d + 1) % 4, (d + 2) % 4, (d + 3) % 4]) {
    s = applyCommand(s, { type: 'PLAY_CARD', seat, card: seat === d ? 'AS' : s.hand.hands[seat][0] }).state;
  }
  const log = viewFor(s, 0).gameLog;
  assert.equal(log.length, 1);
  assert.equal(log[0].kingEnd, true);
  assert.equal(log[0].deltas, null);
  assert.equal(log[0].contract.king, true);
  assert.equal(log[0].tricks.at(-1).winner, d);
});
