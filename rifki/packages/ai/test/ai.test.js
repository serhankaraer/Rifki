import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyCommand, viewFor, currentOptions, createRng, makeDeck, suitOf, scoreHand,
} from '@rifki/engine';
import {
  NAMES, FEMALE_NAMES, MALE_NAMES, TRAIT_KEYS, TRAIT_MEAN, sampleTrait, thinkDelayMs, createBotProfiles,
  createMemory, updateMemory, sampleWorld, unseenPool, rollout, heuristicPlay, trickPointsFor, createBot,
  MIN_THINK_MS, MAX_THINK_MS,
} from '../src/index.js';

const traitsAll = (v, over = {}) => ({ ...Object.fromEntries(TRAIT_KEYS.map((k) => [k, v])), ...over });
const profile = (id, v, over) => ({ id, name: id, traits: traitsAll(v, over) });
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// ---- isimler ----
test('100 benzersiz isim: 50 kadın, 50 erkek', () => {
  assert.equal(FEMALE_NAMES.length, 50);
  assert.equal(MALE_NAMES.length, 50);
  assert.equal(NAMES.length, 100);
  assert.equal(new Set(NAMES.map((n) => n.name)).size, 100);
});

// ---- özellik dağılımı ----
test('özellikler 1-100 arası ve normal dağılımlı (uçlar nadir, ortalar sık)', () => {
  const rng = createRng('dist');
  const N = 60000;
  const deciles = new Array(10).fill(0);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const v = sampleTrait(rng);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 100);
    deciles[Math.min(9, Math.floor((v - 1) / 10))]++;
    sum += v;
  }
  assert.ok(Math.abs(sum / N - TRAIT_MEAN) < 0.7, 'ortalama ~50');
  const [d1, d2, d3, d4, d5, d6, d7, d8, d9, d10] = deciles;
  assert.ok(d5 > 5 * d1 && d6 > 5 * d10, 'orta onluk uçlardan çok daha sık');
  assert.ok(d1 < d2 && d2 < d3 && d3 < d4 && d4 < d5 + d6, 'sol yarı yükselir');
  assert.ok(d10 < d9 && d9 < d8 && d8 < d7 && d7 < d5 + d6, 'sağ yarı alçalır');
});

// ---- düşünme gecikmesi ----
test('düşünme gecikmesi 1-3 sn aralığında, hız arttıkça kısalır', () => {
  const rng = createRng('delay');
  const avg = (speed) => {
    let s = 0;
    for (let i = 0; i < 400; i++) {
      const d = thinkDelayMs(speed, rng);
      assert.ok(d >= MIN_THINK_MS && d <= MAX_THINK_MS);
      s += d;
    }
    return s / 400;
  };
  const fast = avg(100);
  const mid = avg(50);
  const slow = avg(1);
  assert.ok(fast < 1300, `hızlı ~1 sn (${fast})`);
  assert.ok(slow > 2700, `yavaş ~3 sn (${slow})`);
  assert.ok(fast < mid && mid < slow);
});

// ---- profil üretimi ----
test('createBotProfiles: tekrarsız isim, insan adlarıyla çakışmaz, seed ile tekrarlanabilir', () => {
  const a = createBotProfiles({ count: 3, seed: 's1' });
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((p) => p.name)).size, 3);
  for (const p of a) {
    assert.deepEqual(Object.keys(p.traits), TRAIT_KEYS);
    for (const v of Object.values(p.traits)) assert.ok(v >= 1 && v <= 100);
  }
  assert.deepEqual(a, createBotProfiles({ count: 3, seed: 's1' }));
  assert.notDeepEqual(a, createBotProfiles({ count: 3, seed: 's2' }));
  const taken = createBotProfiles({ count: 3, seed: 's1' }).map((p) => p.name.toUpperCase());
  const b = createBotProfiles({ count: 3, seed: 's1', takenNames: taken });
  for (const p of b) assert.ok(!taken.map((n) => n.toLocaleLowerCase('tr')).includes(p.name.toLocaleLowerCase('tr')));
});

// ---- hafıza: takip ve çıkarım ----
const syntheticView = (contract) => ({
  seat: 0,
  handNo: 3,
  contract,
  myHand: [],
  trickHistory: [
    { trickNo: 1, leader: 1, plays: [{ seat: 1, card: '9C' }, { seat: 2, card: '2D' }, { seat: 3, card: 'KC' }, { seat: 0, card: '3C' }], winner: 3 },
  ],
  trick: { leader: 3, plays: [] },
});

test('çıkarım özelliği renk bitirmeyi fark etme olasılığını belirler', () => {
  const rate = (inference) => {
    let found = 0;
    for (let i = 0; i < 500; i++) {
      const mem = createMemory();
      updateMemory(mem, syntheticView({ type: 'KIZ', trump: null }), { tracking: 100, inference }, createRng(`inf-${inference}-${i}`));
      if (mem.voids[2].has('C')) found++;
    }
    return found / 500;
  };
  assert.equal(rate(100), 1);
  const low = rate(1);
  assert.ok(low > 0.05 && low < 0.3, `düşük çıkarım ~%16 (${low})`);
});

test('çıkarım: Kız elinde rengi yokken kız atmayan oyuncunun kızı olmadığı anlaşılır', () => {
  const mem = createMemory();
  updateMemory(mem, syntheticView({ type: 'KIZ', trump: null }), { tracking: 100, inference: 100 }, createRng('q'));
  for (const q of ['QC', 'QD', 'QH', 'QS']) assert.ok(mem.cannot[2].has(q));
  assert.ok(!mem.cannot[1].has('QC'));
});

test('açık ceza kartları: önde duran ceza kartları takip özelliği 1 olsa bile hep bilinir', () => {
  const view = {
    seat: 0, handNo: 3, contract: { type: 'KIZ', trump: null }, myHand: [],
    trickHistory: [
      { trickNo: 1, leader: 1, plays: [{ seat: 1, card: '9C' }, { seat: 2, card: 'QD' }, { seat: 3, card: 'KC' }, { seat: 0, card: '3C' }], winner: 3 },
    ],
    trick: { leader: 3, plays: [] },
    penaltyTaken: [[], [], [], ['QD']],
  };
  for (let i = 0; i < 200; i++) {
    const mem = createMemory();
    updateMemory(mem, view, { tracking: 1, inference: 1 }, createRng(`open-${i}`));
    assert.ok(mem.seen.has('QD'), 'ceza kartı hep bilinir');
  }
  // yalnız penaltyTaken'da olan kart da (olay listesinde olmasa bile) bilinir
  const mem = createMemory();
  updateMemory(mem, { ...view, trickHistory: [], penaltyTaken: [['QH'], [], [], []] }, { tracking: 1, inference: 1 }, createRng('x'));
  assert.ok(mem.seen.has('QH'));
});

test('takip özelliği oynanan kartları fark etme olasılığını belirler', () => {
  const rate = (tracking) => {
    let seen = 0;
    for (let i = 0; i < 600; i++) {
      const mem = createMemory();
      updateMemory(mem, syntheticView({ type: 'KIZ', trump: null }), { tracking, inference: 1 }, createRng(`trk-${tracking}-${i}`));
      if (mem.seen.has('9C')) seen++; // rakibin oynadığı, kız olmayan bir kart
    }
    return seen / 600;
  };
  assert.equal(rate(100), 1);
  const low = rate(1);
  assert.ok(low > 0.32 && low < 0.48, `düşük takip ~%40 (${low})`);
});

test('sampleWorld: boyutlar, kendi el, kısıtlar (renk bitirme) ve tekrarsızlık', () => {
  const rng = createRng('sw');
  let { state } = createGame({ seed: 'sw' });
  state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: 'KIZ' }).state;
  const mem = createMemory();
  const traits = { tracking: 100, inference: 100 };
  for (let n = 0; n < 24; n++) { // 6 tur oyna
    const o = currentOptions(state);
    state = applyCommand(state, { type: 'PLAY_CARD', seat: o.seat, card: pick(o.cards, rng) }).state;
  }
  const view = viewFor(state, state.turn === 0 ? 1 : 0);
  updateMemory(mem, view, traits, createRng('m'));
  const pool = new Set(unseenPool(view, mem));
  for (let i = 0; i < 100; i++) {
    const w = sampleWorld(view, mem, rng);
    assert.deepEqual(w[view.seat], view.myHand);
    const all = w.flat();
    assert.equal(new Set(all).size, all.length, 'tekrarlı kart yok');
    for (let s = 0; s < 4; s++) {
      assert.equal(w[s].length, view.handSizes[s]);
      if (s === view.seat) continue;
      for (const c of w[s]) {
        assert.ok(pool.has(c), 'örneklenen kart bilinmeyen havuzdan');
        assert.ok(!mem.voids[s].has(suitOf(c)) && !mem.cannot[s].has(c), 'kısıta uyar');
      }
    }
  }
});

// ---- simülasyon doğruluğu ----
test('trickPointsFor toplamı motorun el puanlamasıyla aynı', () => {
  const rng = createRng('tp');
  for (const type of ['KOZ', 'RIFKI', 'KIZ', 'ERKEK', 'KUPA', 'SON_IKI', 'EL_ALMAZ']) {
    let { state } = createGame({ seed: `tp-${type}` });
    state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: type === 'KOZ' ? 'KIZ' : type }).state;
    while (state.phase === 'PLAYING') {
      const o = currentOptions(state);
      state = applyCommand(state, { type: 'PLAY_CARD', seat: o.seat, card: pick(o.cards, rng) }).state;
    }
    const contract = state.handResults.at(-1).contract;
    const deltas = [0, 0, 0, 0];
    for (const t of state.hand.trickHistory) deltas[t.winner] += trickPointsFor(contract, t.plays.map((p) => p.card), t.trickNo);
    assert.deepEqual(deltas, scoreHand(contract, state.hand.takenCards, state.hand.trickHistory.map((t) => t.winner)), type);
  }
});

test('rollout: tam el simülasyonu toplamı sabit ve yasal oynar', () => {
  const rng = createRng('ro');
  const expected = { KOZ: 650, RIFKI: -320, KIZ: -400, ERKEK: -480, KUPA: -390, SON_IKI: -360, EL_ALMAZ: -650 };
  for (let i = 0; i < 60; i++) {
    const deck = makeDeck();
    for (let j = deck.length - 1; j > 0; j--) { const k = Math.floor(rng() * (j + 1)); [deck[j], deck[k]] = [deck[k], deck[j]]; }
    for (const [type, total] of Object.entries(expected)) {
      const hands = [0, 1, 2, 3].map((s) => deck.slice(s * 13, s * 13 + 13));
      const contract = { type, trump: type === 'KOZ' ? 'S' : null };
      const d = rollout(contract, hands, [], i % 4, 1, false);
      assert.equal(d.reduce((a, b) => a + b, 0), total, type);
      hands.forEach((h) => assert.equal(h.length, 0));
    }
  }
});

test('heuristicPlay her zaman yasal kart döndürür', () => {
  const rng = createRng('hp');
  for (let g = 0; g < 8; g++) {
    let { state } = createGame({ seed: `hp-${g}` });
    state = applyCommand(state, { type: 'CHOOSE_CONTRACT', seat: state.turn, contract: ['KUPA', 'RIFKI', 'KIZ', 'ERKEK', 'SON_IKI', 'EL_ALMAZ', 'KUPA', 'KIZ'][g] }).state;
    while (state.phase === 'PLAYING') {
      const o = currentOptions(state);
      const card = heuristicPlay(state.hand, o.seat, state.hand.trickNo + 1);
      assert.ok(o.cards.includes(card));
      state = applyCommand(state, { type: 'PLAY_CARD', seat: o.seat, card }).state;
    }
  }
});

// ---- botlar ----
function playGame(seed, profiles, simsScale) {
  const bots = profiles.map((p) => createBot({ profile: p, seed, simsScale }));
  let { state } = createGame({ seed });
  while (state.phase !== 'GAME_OVER') {
    if (state.phase === 'HAND_SCORED') { state = applyCommand(state, { type: 'NEXT_HAND' }).state; continue; }
    const view = viewFor(state, state.turn);
    const cmd = bots[state.turn].act(view);
    assert.ok(cmd, 'sırası gelen bot komut vermeli');
    state = applyCommand(state, cmd).state; // yasadışı hamle RuleError fırlatır
  }
  return state;
}

test('4 bot tam oyunu yasal biçimde bitirir (rastgele kişilikler)', () => {
  for (let g = 0; g < 3; g++) {
    const profiles = createBotProfiles({ count: 4, seed: `full-${g}` });
    const state = playGame(`full-${g}`, profiles, 0.25);
    assert.equal(state.handResults.length, 20);
    assert.equal(state.scores.reduce((a, b) => a + b, 0), 0);
  }
});

test('uç kişilikler de çalışır (hepsi 1 ve hepsi 100)', () => {
  const profiles = [profile('lo1', 1), profile('hi1', 100), profile('lo2', 1), profile('hi2', 100)];
  const state = playGame('extreme', profiles, 0.25);
  assert.equal(state.phase, 'GAME_OVER');
});

test('bot sırası değilse null döner; deterministik (aynı seed aynı hamle)', () => {
  const { state } = createGame({ seed: 'det' });
  const p = profile('det-bot', 70);
  const a = createBot({ profile: p, seed: 'det', simsScale: 0.25 });
  const b = createBot({ profile: p, seed: 'det', simsScale: 0.25 });
  const notTurn = (state.turn + 1) % 4;
  assert.equal(a.act(viewFor(state, notTurn)), null);
  const view = viewFor(state, state.turn);
  assert.deepEqual(a.act(view), b.act(view));
});

test('botlar gizli bilgiye erişmez: yalnızca viewFor çıktısıyla karar verir', () => {
  const { state } = createGame({ seed: 'blind' });
  const view = viewFor(state, state.turn);
  const json = JSON.stringify(view);
  state.hand.hands.forEach((h, s) => { if (s !== view.seat) for (const c of h) assert.ok(!json.includes(`"${c}"`)); });
});

// ---- kişilik etkisi ----
test('güçlü kişilik, zayıf kişiliğe karşı belirgin biçimde daha iyi puan alır', { timeout: 300000 }, () => {
  const G = 6;
  let diffSum = 0;
  let wins = 0;
  for (let g = 0; g < G; g++) {
    const arr = g % 2 === 0 ? [0, 1, 0, 1] : [1, 0, 1, 0];
    const profiles = arr.map((a, i) => (a === 0 ? profile(`strong${i}`, 90, { thinkSpeed: 50 }) : profile(`weak${i}`, 10, { thinkSpeed: 50 })));
    const state = playGame(`power-${g}`, profiles, 0.4);
    const sum = (flag) => state.scores.reduce((acc, s, i) => acc + (arr[i] === flag ? s : 0), 0) / 2;
    const d = sum(0) - sum(1);
    diffSum += d;
    if (d > 0) wins++;
  }
  assert.ok(diffSum / G > 300, `ortalama fark ${diffSum / G}`);
  assert.ok(wins >= 5, `güçlü ${wins}/${G} oyun kazandı`);
});
