// Karar mekanizması: sözleşme seçimi ve kart oynama.
// Monte Carlo (determinization): bilinmeyen kartlar olası dağılımlarla paylaştırılır, her aday hamle
// sezgisel politikayla sonuna kadar oynatılıp puanlanır.
import { SUITS, suitOf } from '@rifki/engine';
import { updateMemory, sampleWorld, unseenPool } from './belief.js';
import { heuristicPlay, rollout } from './sim.js';
import { gauss } from './traits.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pickRandom = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Skor farkındalığı: gerideyken risk artar, öndeyken azalır.
function effectiveRisk(view, traits) {
  const me = view.scores[view.seat];
  const others = view.scores.filter((_, i) => i !== view.seat);
  const avg = others.reduce((a, b) => a + b, 0) / others.length;
  const shift = clamp((avg - me) / 500, -1, 1) * (traits.scoreAwareness / 100) * 40;
  return clamp(traits.risk + shift, 1, 100);
}

function scoreLeader(view) {
  let leader = -1;
  let best = -Infinity;
  view.scores.forEach((s, i) => {
    if (s > best) { best = s; leader = i; }
  });
  return leader;
}

// Bir simülasyon sonucunun bot için değeri: alandaki ortalamaya göre avantaj, saldırganlıkta öndeki rakibin zararı da eklenir.
function utility(deltas, me, leader, aggrFactor) {
  const total = deltas[0] + deltas[1] + deltas[2] + deltas[3];
  const avg = total / 4;
  let u = deltas[me] - avg;
  if (leader !== me && leader >= 0) u -= aggrFactor * (deltas[leader] - avg);
  return u;
}

function meanStd(values) {
  const n = values.length;
  let m = 0;
  for (const v of values) m += v;
  m /= n;
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return { mean: m, std: Math.sqrt(s / Math.max(1, n - 1)) };
}

function riskAdjusted(values, effRisk) {
  const { mean, std } = meanStd(values);
  return mean + ((effRisk - 50) / 50) * 0.35 * std;
}

// Tutarlılık: düşükse bazen en iyi yerine 2. veya 3. hamleyi seçer.
function chooseWithNoise(ranked, consistency, rng) {
  const pErr = (1 - consistency / 100) * 0.3;
  if (ranked.length > 1 && rng() < pErr) {
    if (ranked.length > 2 && rng() >= 0.65) return ranked[2];
    return ranked[1];
  }
  return ranked[0];
}

function simsForCard(lookahead, scale) {
  return Math.max(4, Math.round(scale * (6 + ((lookahead - 25) / 75) * 70)));
}

function simsForContract(lookahead, scale) {
  return Math.max(4, Math.round(scale * (8 + lookahead * 0.5)));
}

export function decideCard(view, profile, memory, rng, opts = {}) {
  const t = profile.traits;
  const me = view.seat;
  updateMemory(memory, view, t, rng);
  const legal = view.legalCards;
  if (legal.length === 1) return legal[0];

  const trickNo = view.trickNo + 1; // oynanmakta olan tur
  const pErr = (1 - t.consistency / 100) * 0.3;

  // Düşük ileri hesap: sadece sezgisel oynar
  if (t.lookahead < 25) {
    if (rng() < pErr) return pickRandom(legal, rng);
    const hands = [[], [], [], []];
    hands[me] = view.myHand.slice();
    const h = { contract: view.contract, hands, trick: { plays: view.trick.plays.map((p) => ({ ...p })) }, heartsBroken: view.heartsBroken };
    return heuristicPlay(h, me, trickNo);
  }

  const sims = simsForCard(t.lookahead, opts.simsScale ?? 1);
  const pool = unseenPool(view, memory);
  const effRisk = effectiveRisk(view, t);
  const leader = scoreLeader(view);
  const aggrFactor = 0.6 * (t.aggression / 100);
  const results = legal.map(() => []);

  for (let w = 0; w < sims; w++) {
    const world = sampleWorld(view, memory, rng, pool);
    legal.forEach((card, ci) => {
      const hands = world.map((a) => a.slice());
      hands[me].splice(hands[me].indexOf(card), 1);
      const plays = view.trick.plays.map((p) => ({ ...p }));
      plays.push({ seat: me, card });
      const deltas = rollout(view.contract, hands, plays, (me + 1) % 4, trickNo, view.heartsBroken || suitOf(card) === 'H');
      results[ci].push(utility(deltas, me, leader, aggrFactor));
    });
  }

  const ranked = legal
    .map((card, ci) => ({ card, score: riskAdjusted(results[ci], effRisk) }))
    .sort((a, b) => b.score - a.score);
  return chooseWithNoise(ranked, t.consistency, rng).card;
}

export function decideContract(view, profile, memory, rng, opts = {}) {
  const t = profile.traits;
  const me = view.seat;
  updateMemory(memory, view, t, rng); // yeni el: hafızayı sıfırlar
  const sel = view.selectable;
  const options = sel.penalties.map((c) => ({ contract: c, trump: null }));
  if (sel.koz) for (const s of SUITS) options.push({ contract: 'KOZ', trump: s });
  if (options.length === 1) return options[0];

  const sims = simsForContract(t.lookahead, opts.simsScale ?? 1);
  const pool = unseenPool(view, memory);
  const effRisk = effectiveRisk(view, t);
  const noiseSd = ((100 - t.handEval) / 100) * 90; // el değerlendirme zayıfsa değerlendirme gürültülü
  const results = options.map(() => []);

  for (let w = 0; w < sims; w++) {
    const world = sampleWorld(view, memory, rng, pool);
    options.forEach((opt, oi) => {
      const hands = world.map((a) => a.slice());
      const contract = { type: opt.contract, trump: opt.trump };
      const deltas = rollout(contract, hands, [], me, 1, false);
      results[oi].push(utility(deltas, me, -1, 0));
    });
  }

  const ranked = options
    .map((opt, oi) => ({ opt, score: riskAdjusted(results[oi], effRisk) + gauss(rng) * noiseSd }))
    .sort((a, b) => b.score - a.score);
  return chooseWithNoise(ranked, t.consistency, rng).opt;
}
