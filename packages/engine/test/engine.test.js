import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDeck, suitOf, createRng, createGame, applyCommand, viewFor, currentOptions, RuleError,
  legalCards, trickWinner, scoreHand, selectableContracts, newLedger, isLedgerFeasible,
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

function playOutHand(state, rng, contractCmd) {
  let s = applyCommand(state, contractCmd ?? randomContractCmd(state, rng)).state;
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
const mk = (contract, hands, plays, heartsBroken = false) => ({ contract, hands, trick: { leader: plays[0]?.seat ?? 0, plays }, heartsBroken });
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
