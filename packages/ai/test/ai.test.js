import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyCommand, viewFor, currentOptions, createRng, makeDeck, suitOf, scoreHand,
} from '@rifki/engine';
import {
  NAMES, FEMALE_NAMES, MALE_NAMES, TRAIT_KEYS, thinkDelayMs, createBotProfiles,
  createMemory, updateMemory, sampleWorld, unseenPool, rollout, heuristicPlay, trickPointsFor, createBot,
  MIN_THINK_MS, MAX_THINK_MS, effectiveTraits,
  ARCHETYPES, getArchetype, sampleArchetypeTraits, archetypeLevel, levelOfScore, traitScore, traitMean, bandLevels,
  TRAIT_IMPACT, TRAIT_IMPACT_DEFAULTS, setTraitImpact, profileInfo,
} from '../src/index.js';
import { futureValue, continuationValue } from '../src/contract-plan.js';
import { runGame, traitsAll as arenaTraits } from '../tools/arena.js';
import { replayLog, parseLogText, LOG_JSON_BEGIN, LOG_JSON_END } from '../tools/replay-log.mjs';

const traitsAll = (v, over = {}) => ({ ...Object.fromEntries(TRAIT_KEYS.map((k) => [k, v])), ...over });
const profile = (id, v, over) => ({ id, name: id, traits: traitsAll(v, over), thinkSpeed: 50 });
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// ---- isimler ----
test('100 benzersiz isim: 50 kadın, 50 erkek', () => {
  assert.equal(FEMALE_NAMES.length, 50);
  assert.equal(MALE_NAMES.length, 50);
  assert.equal(NAMES.length, 100);
  assert.equal(new Set(NAMES.map((n) => n.name)).size, 100);
});

// ---- arketipler (docs/bot-arketipleri.md) ----
test('21 arketip: benzersiz kimlik, 8 özellik aralığı, hedef ortalama kendi aralıklarıyla uyumlu', () => {
  assert.equal(ARCHETYPES.length, 21);
  assert.equal(new Set(ARCHETYPES.map((a) => a.id)).size, 21);
  const DOC_LEVEL = { 'Çok Zayıf': [1, 20], Zayıf: [21, 40], Orta: [41, 60], Güçlü: [61, 80], 'Çok Güçlü': [81, 100] };
  for (const a of ARCHETYPES) {
    assert.deepEqual(Object.keys(a.ranges), TRAIT_KEYS, a.name);
    for (const [lo, hi] of Object.values(a.ranges)) assert.ok(lo >= 1 && hi <= 100 && lo < hi, a.name);
    const mean = (i) => Object.values(a.ranges).reduce((s, r) => s + r[i], 0) / 8;
    const [tlo, thi] = DOC_LEVEL[a.docLevel];
    assert.ok(a.target[0] >= tlo && a.target[1] <= thi, `${a.name}: hedef ortalama dokümandaki seviye aralığında`);
    assert.ok(mean(0) <= a.target[1] && mean(1) >= a.target[0], `${a.name}: aralıklar hedefle kesişir`);
  }
  assert.equal(ARCHETYPES.filter((a) => a.docLevel === 'Çok Zayıf').length, 1);
  assert.equal(ARCHETYPES.filter((a) => a.docLevel === 'Çok Güçlü').length, 5);
});

test('arketipten üretim: her özellik kendi aralığında (yan özellikler ortalama sınırı için dışarı çıkabilir), ortalama hedefte, botlar birbirinden farklı', () => {
  const rng = createRng('arch-sample');
  for (const a of ARCHETYPES) {
    const seen = new Set();
    let outOfRange = 0;
    for (let i = 0; i < 300; i++) {
      const tr = sampleArchetypeTraits(a, rng);
      assert.deepEqual(Object.keys(tr), TRAIT_KEYS);
      const m = traitMean(tr);
      assert.ok(m >= a.target[0] - 1e-9 && m <= a.target[1] + 1e-9, `${a.name}: ortalama ${m} hedef ${a.target}`);
      for (const k of TRAIT_KEYS) {
        assert.ok(Number.isInteger(tr[k]) && tr[k] >= 1 && tr[k] <= 100);
        if (tr[k] < a.ranges[k][0] || tr[k] > a.ranges[k][1]) outOfRange++;
      }
      seen.add(JSON.stringify(tr));
    }
    assert.ok(seen.size > 250, `${a.name}: dinamik varyasyon (${seen.size}/300)`);
    assert.ok(outOfRange < 300 * 8 * 0.05, `${a.name}: aralık dışı değer nadir (${outOfRange})`);
  }
});

test('ortalama sınırı: hedefin dışına çıkan çekim yan özelliklerin ölçeklenmesiyle hedefe çekilir; çekirdek özellikler aralıkta kalır', () => {
  const a = getArchetype('buz-gibi-cerrah'); // hedef 83-90, aralık ortalaması ~85: ham çekimlerde ~%3 hedef dışı
  const rng = createRng('cap');
  const coreKeys = TRAIT_KEYS.filter((k) => a.ranges[k][1] - a.ranges[k][0] <= 14);
  assert.ok(coreKeys.length >= 4);
  let capped = 0;
  for (let i = 0; i < 4000; i++) {
    const tr = sampleArchetypeTraits(a, rng);
    if (TRAIT_KEYS.some((k) => tr[k] < a.ranges[k][0] || tr[k] > a.ranges[k][1])) {
      capped++;
      for (const k of coreKeys) assert.ok(tr[k] >= a.ranges[k][0] && tr[k] <= a.ranges[k][1], `çekirdek ${k} aralık dışına çıkmadı`);
    }
  }
  assert.ok(capped > 0, 'ortalama sınırı devreye girdi');
});

// ---- özellik etki parametresi ve seviyeler ----
test('seviye kategorileri: 1-20, 21-40, 41-60, 61-80, 81-100', () => {
  assert.deepEqual([1, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(levelOfScore), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('etki parametresi: ağırlıklı genel puan; hepsi eşitse düz ortalama; setTraitImpact doğrular ve varsayılana döner', () => {
  const tr = { handEval: 10, kozAppetite: 90, penaltyAvoid: 50, memory: 50, lookahead: 100, aggression: 50, scoreAwareness: 50, consistency: 20 };
  const equal = Object.fromEntries(TRAIT_KEYS.map((k) => [k, 100]));
  assert.ok(Math.abs(traitScore(tr, equal) - traitMean(tr)) < 1e-9);
  const onlyLook = { ...Object.fromEntries(TRAIT_KEYS.map((k) => [k, 0])), lookahead: 100 };
  assert.equal(traitScore(tr, onlyLook), 100);
  assert.throws(() => setTraitImpact({ lookahead: 101 }));
  assert.throws(() => setTraitImpact({ lookahead: -1 }));
  assert.throws(() => setTraitImpact({ bilinmeyen: 5 }));
  assert.throws(() => setTraitImpact(Object.fromEntries(TRAIT_KEYS.map((k) => [k, 0]))));
  try {
    setTraitImpact(equal);
    assert.ok(TRAIT_KEYS.every((k) => TRAIT_IMPACT[k] === 100));
    // eşit etkide seviye = aralık orta noktalarının düz ortalamasının seviyesi (dokümandaki hesap)
    for (const a of ARCHETYPES) {
      const mids = Object.fromEntries(TRAIT_KEYS.map((k) => [k, (a.ranges[k][0] + a.ranges[k][1]) / 2]));
      assert.equal(archetypeLevel(a), levelOfScore(traitMean(mids)), a.name);
    }
    setTraitImpact({ lookahead: 0, consistency: 0 }); // ağırlık 0: ileri hesap/tutarlılık seviyeyi etkilemez
    assert.equal(traitScore({ ...tr, lookahead: 1 }), traitScore({ ...tr, lookahead: 100 }));
  } finally {
    setTraitImpact(null);
  }
  assert.deepEqual({ ...TRAIT_IMPACT }, TRAIT_IMPACT_DEFAULTS);
  for (const v of Object.values(TRAIT_IMPACT_DEFAULTS)) assert.ok(v >= 0 && v <= 100);
});

test('seviye: ileri hesap ve tutarlılık (varsayılan en etkili) seviyeyi, tarz özelliklerinden daha çok değiştirir', () => {
  const base = Object.fromEntries(TRAIT_KEYS.map((k) => [k, 50]));
  const d = (k) => traitScore({ ...base, [k]: 100 }) - traitScore({ ...base, [k]: 1 });
  assert.ok(d('lookahead') > 2 * d('handEval') && d('consistency') > 2 * d('aggression'));
});

test('createBotProfiles: arketip, aralıktaki özellikler, gizli düşünme hızı; toplu seçim 3\'lü seviye aralığında; aynı odada arketip tekrarı yok', () => {
  for (const band of [1, 2, 3]) {
    const [lo, hi] = bandLevels(band);
    assert.deepEqual([lo, hi], [band, band + 2]);
    for (let i = 0; i < 10; i++) {
      const ps = createBotProfiles({ count: 3, seed: `band${band}-${i}`, band });
      assert.equal(new Set(ps.map((p) => p.archetype)).size, 3, 'aynı odada arketip tekrarı yok');
      for (const p of ps) {
        const l = archetypeLevel(getArchetype(p.archetype));
        assert.ok(l >= lo && l <= hi, `band ${band}: ${p.archetype} seviye ${l}`);
        assert.equal(profileInfo(p).level, l);
        assert.ok(p.thinkSpeed >= 1 && p.thinkSpeed <= 100 && !('thinkSpeed' in p.traits));
      }
    }
  }
  // mevcut arketipler hariç tutulur
  const first = createBotProfiles({ count: 1, seed: 'ex1' })[0];
  for (let i = 0; i < 30; i++) assert.notEqual(createBotProfiles({ count: 1, seed: `ex2-${i}`, excludeArchetypes: [first.archetype] })[0].archetype, first.archetype);
  // tüm arketipler üretilebilir
  const all = new Set();
  for (let i = 0; i < 400; i++) all.add(createBotProfiles({ count: 1, seed: `all-${i}` })[0].archetype);
  assert.equal(all.size, 21);
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
    assert.ok(getArchetype(p.archetype));
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
  assert.ok(low > 0.32 && low < 0.52, `düşük çıkarım ~%40 (${low})`);
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
  assert.ok(low > 0.54 && low < 0.68, `düşük takip ~%60 (${low})`);
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
    const profiles = arr.map((a, i) => (a === 0 ? profile(`strong${i}`, 90) : profile(`weak${i}`, 10)));
    const state = playGame(`power-${g}`, profiles, 0.4);
    const sum = (flag) => state.scores.reduce((acc, s, i) => acc + (arr[i] === flag ? s : 0), 0) / 2;
    const d = sum(0) - sum(1);
    diffSum += d;
    if (d > 0) wins++;
  }
  assert.ok(diffSum / G > 300, `ortalama fark ${diffSum / G}`);
  assert.ok(wins >= 5, `güçlü ${wins}/${G} oyun kazandı`);
});

// ---- karar mekanizmasının gördüğü değerler ----
test('effectiveTraits: alt sınır yok (1 -> 1, 100 -> 100); hafıza takip+çıkarımı sürer; risk koz iştahı ve baskıdan türer', () => {
  const lo = effectiveTraits(traitsAll(1));
  const hi = effectiveTraits(traitsAll(100));
  for (const k of ['handEval', 'lookahead', 'consistency', 'scoreAwareness', 'aggression', 'koz', 'ceza', 'tracking', 'inference', 'risk']) {
    assert.equal(lo[k], 1, k); assert.equal(hi[k], 100, k);
  }
  const e = effectiveTraits(traitsAll(50, { memory: 80, kozAppetite: 90, aggression: 10, penaltyAvoid: 30 }));
  assert.equal(e.tracking, 80); assert.equal(e.inference, 80);
  assert.equal(e.risk, 50); assert.equal(e.koz, 90); assert.equal(e.ceza, 30);
});

test('arena: tam oyun başsız oynanır, toplam puan 0', () => {
  const scores = runGame({ seed: 'arena-smoke', seats: [arenaTraits(1), arenaTraits(50), arenaTraits(100), { kind: 'random' }].map((x) => (x.kind ? x : { kind: 'bot', traits: x })), simsScale: 0.2 });
  assert.equal(scores.reduce((a, b) => a + b, 0), 0);
});

// ---- derin çıkarım ----
const ZERO = () => 0; // her olasılık kontrolünü geçirir
const top = { tracking: 100, inference: 100 };
function stubView(over) {
  return {
    seat: 0, handNo: 1, contract: { type: 'KOZ', trump: 'S' }, trickHistory: [], trick: { plays: [] },
    penaltyTaken: [[], [], [], []], myHand: [], handSizes: [13, 13, 13, 13], trumpRun: null, ...over,
  };
}

test('derin çıkarım: masadaki kozdan küçük koz atan oyuncunun daha büyük kozu yoktur', () => {
  const mem = createMemory();
  updateMemory(mem, stubView({ trick: { plays: [{ seat: 3, card: 'QS' }, { seat: 1, card: '5S' }] } }), top, ZERO);
  assert.ok(mem.cannot[1].has('KS') && mem.cannot[1].has('AS'));
  assert.ok(!mem.cannot[1].has('2S'));
});

test('derin çıkarım: koz kırılmadan A/K/Q olmayan kozla açan oyuncunun elinde yalnız koz vardır', () => {
  const mem = createMemory();
  updateMemory(mem, stubView({ trick: { plays: [{ seat: 2, card: '5S' }] } }), top, ZERO);
  assert.deepEqual([...mem.voids[2]].sort(), ['C', 'D', 'H']);
  const mem2 = createMemory(); // onur kartıyla açış: kesin çıkarım yok
  updateMemory(mem2, stubView({ trick: { plays: [{ seat: 2, card: 'KS' }] } }), top, ZERO);
  assert.equal(mem2.voids[2].size, 0);
});

test('derin çıkarım: kupa kırılmadan kupa ile açan oyuncunun elinde yalnız kupa vardır; çıkarım=1 bunu fark etmez', () => {
  const view = stubView({ contract: { type: 'KUPA', trump: null }, trick: { plays: [{ seat: 2, card: '5H' }] } });
  const mem = createMemory();
  updateMemory(mem, view, top, ZERO);
  assert.deepEqual([...mem.voids[2]].sort(), ['C', 'D', 'S']);
  const weak = createMemory();
  updateMemory(weak, view, { tracking: 100, inference: 1 }, () => 0.5);
  assert.equal(weak.voids[2].size, 0);
});

test('A-K-Q serisi sürerken serideki oyuncunun kalan onur kartları ona dağıtılır', () => {
  const view = stubView({ seat: 0, myHand: ['2C'], handSizes: [1, 4, 1, 1], trumpRun: { seat: 1, need: ['K', 'Q'] }, trick: { plays: [{ seat: 1, card: 'AS' }] } });
  const mem = createMemory();
  updateMemory(mem, view, top, ZERO);
  for (let i = 0; i < 20; i++) {
    const world = sampleWorld(view, mem, createRng(`must-${i}`), unseenPool(view, mem));
    assert.ok(world[1].includes('KS') && world[1].includes('QS'));
  }
});

// ---- sözleşme planlaması ----
test('sözleşme planı: daha çok kalan hak = daha çok gelecek değer; hak yoksa 0', () => {
  const all = [0, 1, 2, 3, 4, 5];
  assert.equal(futureValue(0, 0, all), 0);
  assert.ok(futureValue(2, 3, all) > futureValue(1, 3, all));
  assert.ok(futureValue(1, 1, all) > futureValue(1, 0, all));
  const view = { seat: 0, ledger: { koz: [0, 0, 0, 0], ceza: [0, 0, 0, 0], typeUses: { RIFKI: 0, KIZ: 0, ERKEK: 0, KUPA: 0, SON_IKI: 0, EL_ALMAZ: 0 } } };
  const v = continuationValue(view, { contract: 'KOZ', trump: 'S' });
  assert.ok(Number.isFinite(v) && v > 0);
});

test('ilan edenin sözleşmesi elini ele verir: koz ilan eden rakip daha çok koz alır; çıkarım=1 neredeyse etkilenmez', () => {
  const mine = ['2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', 'JC', 'QC', 'KC', 'AC'];
  const view = stubView({ declarer: 2, myHand: mine, handSizes: [13, 13, 13, 13] });
  const meanTrumps = (inference) => {
    const mem = createMemory();
    updateMemory(mem, view, { tracking: 100, inference }, () => 0.99);
    const pool = unseenPool(view, mem);
    let sum = 0;
    for (let i = 0; i < 400; i++) sum += sampleWorld(view, mem, createRng(`tilt-${i}`), pool)[2].filter((c) => suitOf(c) === 'S').length;
    return sum / 400;
  };
  const strong = meanTrumps(100);
  const none = meanTrumps(1);
  assert.ok(strong > none + 0.5, `çıkarım=100: ${strong}, çıkarım=1: ${none}`);
});

// ---- botlar kurallara uyar (bağımsız denetçi) ----
test('botlar uç karakter değerlerinde bile renge uyar ve rengi yoksa ceza kartı atar (Kız/Erkek/Kupa/Rıfkı)', () => {
  const T = (v, o = {}) => traitsAll(v, o);
  const profiles = [T(1), T(100), T(50, { memory: 1, consistency: 1 }), T(50, { kozAppetite: 100, aggression: 100, consistency: 1 }), T(1, { consistency: 1, memory: 1 }), T(50, { penaltyAvoid: 1 }), T(50, { penaltyAvoid: 100 })];
  const penalty = { KIZ: (c) => c[0] === 'Q', ERKEK: (c) => c[0] === 'K' || c[0] === 'J', KUPA: (c) => suitOf(c) === 'H' };
  let offSuit = 0, checked = 0;
  for (let g = 0; g < 4; g++) {
    const seed = `rules${g}`;
    const bots = [0, 1, 2, 3].map((s) => createBot({ profile: { id: `s${s}`, name: `s${s}`, traits: profiles[(g + s) % profiles.length] }, seed: `${seed}:${s}`, simsScale: 0.1 }));
    let { state } = createGame({ seed });
    for (let guard = 0; state.phase !== 'GAME_OVER'; guard++) {
      assert.ok(guard < 6000, 'takıldı');
      if (state.phase === 'HAND_SCORED') { state = applyCommand(state, { type: 'NEXT_HAND' }).state; continue; }
      const seat = state.turn;
      const cmd = bots[seat].act(viewFor(state, seat));
      if (cmd.type === 'PLAY_CARD') {
        const { hands, trick, contract } = state.hand;
        const hand = hands[seat];
        if (trick.plays.length > 0 && contract.type !== 'KOZ') {
          checked++;
          const led = suitOf(trick.plays[0].card);
          const hasLed = hand.some((c) => suitOf(c) === led);
          if (hasLed) assert.equal(suitOf(cmd.card), led, `${contract.type}: rengi var ama uymadı (${hand} / ${cmd.card})`);
          else {
            offSuit++;
            const pen = penalty[contract.type];
            if (pen && hand.some(pen)) assert.ok(pen(cmd.card), `${contract.type}: ceza kartı atmadı (${hand} / ${cmd.card})`);
          }
        }
      }
      state = applyCommand(state, cmd).state;
    }
  }
  assert.ok(checked > 500 && offSuit > 50, `yeterli örnek (${checked}/${offSuit})`);
});

// ---- Koz İştahı ve Ceza Kaçınma ----
// Koz seçilebilen sözleşme seçim anları (ilk elde koz yasak): botlarla oynatılan oyunlardan toplanır
function kozSelectViews(max) {
  const views = [];
  for (let g = 0; g < 6 && views.length < max; g++) {
    const seed = `kozviews-${g}`;
    const bots = [0, 1, 2, 3].map((s) => createBot({ profile: profile(`b${s}`, 50), seed: `${seed}:${s}`, simsScale: 0.1 }));
    let { state } = createGame({ seed });
    for (let guard = 0; state.phase !== 'GAME_OVER' && state.handNo <= 8 && views.length < max; guard++) {
      if (state.phase === 'HAND_SCORED') { state = applyCommand(state, { type: 'NEXT_HAND' }).state; continue; }
      const view = viewFor(state, state.turn);
      if (state.phase === 'CONTRACT_SELECT' && view.selectable.koz && view.selectable.penalties.length > 0) views.push(view);
      state = applyCommand(state, bots[state.turn].act(view)).state;
    }
  }
  return views;
}

test('koz iştahı sözleşme seçimini etkiler: yüksekse KOZ daha sık seçilir, düşükse daha seyrek', { timeout: 120000 }, () => {
  const views = kozSelectViews(10);
  assert.ok(views.length >= 6, `yeterli koz seçim anı (${views.length})`);
  const kozCount = (koz) => views.filter((v, i) => createBot({ profile: profile('k', 50, { kozAppetite: koz }), seed: `kz-${i}`, simsScale: 0.3 }).act(v).contract === 'KOZ').length;
  const [lo, hi] = [kozCount(1), kozCount(100)];
  assert.ok(hi > lo, `koz=100: ${hi}/${views.length}, koz=1: ${lo}/${views.length}`);
});

test('ceza kaçınma: kart seçimi yasal kalır; ağırlık yalnız negatif (ceza) puanı çarpar', () => {
  const { state } = createGame({ seed: 'ceza' });
  const view = viewFor(state, state.turn);
  for (const penaltyAvoid of [1, 50, 100]) {
    const b = createBot({ profile: profile('c', 50, { penaltyAvoid }), seed: 'ceza', simsScale: 0.2 });
    const cmd = b.act(view);
    assert.ok(cmd && (cmd.type === 'CHOOSE_CONTRACT' || view.legalCards.includes(cmd.card)));
  }
});

// ---- log'dan yeniden oynatma (tools/replay-log.mjs) ----
test('replay-log: sunucu akışıyla oynanmış bir oyunun kaydı, botların her kararını birebir yeniden üretir; bozuk kayıt tespit edilir', { timeout: 300000 }, () => {
  const seed = 'replay-seed:game';
  const profiles = createBotProfiles({ count: 4, seed: 'replay-p' }).map((p, i) => ({ ...p, id: `bot-${i}` }));
  const bots = profiles.map((p) => createBot({ profile: p, seed, simsScale: 0.1 }));
  let { state } = createGame({ seed });
  while (state.phase !== 'GAME_OVER') {
    if (state.phase === 'HAND_SCORED') { state = applyCommand(state, { type: 'NEXT_HAND' }).state; continue; }
    const seat = state.turn;
    const view = viewFor(state, seat);
    const cmd = bots[seat].act(view);
    if (!(state.phase === 'PLAYING' && view.legalCards.length === 1)) bots[seat].thinkDelayMs(); // sunucudaki çekim
    state = applyCommand(state, cmd).state;
  }
  const players = profiles.map((p, i) => ({ seat: i, name: p.name, kind: 'bot', botId: p.id, archetype: p.archetype, archetypeName: p.archetype, traits: p.traits }));
  const data = { v: 2, seed, code: 'TEST', players, hands: viewFor(state, 0).gameLog };
  // metin biçimi: işaretli blok geri çözülür
  const text = ['başlık', '', LOG_JSON_BEGIN, JSON.stringify(data), LOG_JSON_END].join('\n');
  assert.deepEqual(parseLogText(text), data);
  assert.throws(() => parseLogText('eski kayıt'), /JSON bloğu yok/);

  const r = replayLog(data, { simsScale: 0.1 });
  assert.deepEqual(r.integrity, []);
  assert.deepEqual(r.mismatches, [], JSON.stringify(r.mismatches[0]));
  for (const p of r.players) assert.ok(p.decisions > 150 && p.matches === p.decisions, `${p.name}: ${p.matches}/${p.decisions}`);

  // kart değiştirilmiş kayıt: sapma ve açıklama
  const bad = structuredClone(data);
  const tr = bad.hands[2].tricks[0];
  [tr.plays[1].card, tr.plays[2].card] = [tr.plays[2].card, tr.plays[1].card]; // iki kartı yer değiştir
  const r2 = replayLog(bad, { simsScale: 0.1 });
  assert.ok(r2.integrity.some((m) => /motor hamleyi reddetti/.test(m)), 'kurala aykırı/bozuk hamle motor tarafından yakalanır');
  // yanlış tohum: dağıtım uyuşmaz
  const wrong = replayLog({ ...data, seed: 'baska:game' }, { simsScale: 0.1 });
  assert.ok(wrong.integrity.length > 0, 'yanlış tohum bütünlük sorunu verir');
  // açıklama modu: aday sıralaması gelir (tek yasal kartlı hamlede karar hesabı yoktur; ilk gerçek kararı bul)
  let traced = null;
  outer: for (const hand of data.hands.slice(2)) {
    for (let t = 0; t < hand.tricks.length; t++) {
      for (const pl of hand.tricks[t].plays) {
        const r3 = replayLog(data, { simsScale: 0.1, explain: { hand: hand.handNo, trick: t + 1, seat: pl.seat } });
        if (r3.explained.length === 1 && r3.explained[0].trace) { traced = r3.explained[0].trace; break outer; }
      }
    }
  }
  assert.ok(traced, 'en az bir hamle için açıklama izi bulunur');
  assert.ok(traced.ranked.length >= 1 && traced.kind === 'card');
});
