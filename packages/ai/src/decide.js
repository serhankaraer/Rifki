// Karar mekanizması: sözleşme seçimi ve kart oynama.
// Monte Carlo (determinization): bilinmeyen kartlar olası dağılımlarla paylaştırılır, her aday hamle
// sezgisel politikayla sonuna kadar oynatılıp puanlanır.
import { SUITS, suitOf, KOZ, breaksHearts, advanceTrumpRun } from '@rifki/engine';
import { updateMemory, sampleWorld, unseenPool } from './belief.js';
import { heuristicPlay, rollout } from './sim.js';
import { gauss } from './traits.js';
import { continuationValue } from './contract-plan.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Ayar katsayıları (ölçüm araçları geçici olarak değiştirebilir; üretimde varsayılanlar kullanılır).
export const TUNING_DEFAULTS = {
  riskCard: 0.6,       // risk iştahının kart seçimine etkisi (sapma katsayısı)
  riskContract: 0.5,   // risk iştahının sözleşme seçimine etkisi
  aggression: 2.0,     // saldırganlık 100 iken öndeki rakibin zararının ağırlığı
  saShift: 120,        // skor farkındalığı 100 iken, rahat öndeyken/umutsuz gerideyken risk iştahı kayması (z=±1 -> ±60)
};
export const TUNING = { ...TUNING_DEFAULTS };
const pickRandom = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Skor farkındalığı: oyunun amacı sıfırın üstünde bitirmektir (kazanan = puanı > 0). Kalan ellerde beklenen oynaklığa göre
// durum z = puan / (el sapması * karekök(kalan el)) ile ölçülür: rahat öndeyken (z > 0) oyun güvene alınır (risk iştahı düşer),
// umutsuz gerideyken (z < 0) kaybedecek bir şey olmadığı için risk iştahı artar. Erken oyunda z küçüktür, bu yüzden kayma da küçüktür.
const HAND_SD = 140;
function effectiveRisk(view, traits) {
  const left = Math.max(0, 20 - view.handNo);
  const z = view.scores[view.seat] / (HAND_SD * Math.sqrt(Math.max(left, 0.25)));
  const shift = -clamp(z, -2, 2) * 0.5 * (traits.scoreAwareness / 100) * TUNING.saShift;
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

// Risk iştahı: yüksekse oynak (yüksek sapmalı) seçenekleri, düşükse güvenli olanları tercih eder.
function riskAdjusted(values, effRisk, k) {
  const { mean, std } = meanStd(values);
  return mean + ((effRisk - 50) / 50) * k * std;
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

// El değerlendirme: yüksekse sözleşmeyi daha çok dağıtımla değerlendirir (daha kesin tahmin).
function simsForContract(lookahead, scale, handEval) {
  return Math.max(4, Math.round(scale * (8 + lookahead * 0.5) * (0.6 + 0.8 * (handEval / 100))));
}

export function decideCard(view, profile, memory, rng, opts = {}) {
  const t = profile.traits;
  const me = view.seat;
  updateMemory(memory, view, t, rng);
  const legal = view.legalCards;
  if (legal.length === 1) return legal[0];

  const trickNo = view.trickNo + 1; // oynanmakta olan tur
  const sample = opts.sampleWorld ?? sampleWorld; // (ölçüm için: hile yapan örnekleyici takılabilir)
  const sims = simsForCard(t.lookahead, opts.simsScale ?? 1);
  const pool = unseenPool(view, memory);
  const effRisk = effectiveRisk(view, t);
  const leader = scoreLeader(view);
  const aggrFactor = TUNING.aggression * (t.aggression / 100);
  const results = legal.map(() => []);

  for (let w = 0; w < sims; w++) {
    const world = sample(view, memory, rng, pool);
    legal.forEach((card, ci) => {
      const hands = world.map((a) => a.slice());
      hands[me].splice(hands[me].indexOf(card), 1);
      const plays = view.trick.plays.map((p) => ({ ...p }));
      // A-K-Q serisi: bu kart seriyi başlatıyor/ilerletiyor mu?
      const h0 = { contract: view.contract, trick: { plays: view.trick.plays }, trumpBroken: view.trumpBroken, trumpRun: view.trumpRun ? { seat: view.trumpRun.seat, need: [...view.trumpRun.need] } : null };
      advanceTrumpRun(h0, me, card, view.myHand);
      plays.push({ seat: me, card });
      const deltas = rollout(view.contract, hands, plays, (me + 1) % 4, trickNo, view.heartsBroken || breaksHearts(view.contract.type, view.trick.plays, card),
        view.trumpBroken || (view.contract.type === KOZ && plays.length > 1 && suitOf(plays[0].card) !== view.contract.trump && suitOf(card) === view.contract.trump),
        h0.trumpRun);
      results[ci].push(utility(deltas, me, leader, aggrFactor));
    });
  }

  const ranked = legal
    .map((card, ci) => ({ card, score: riskAdjusted(results[ci], effRisk, TUNING.riskCard) }))
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

  const sample = opts.sampleWorld ?? sampleWorld;
  const sims = simsForContract(t.lookahead, opts.simsScale ?? 1, t.handEval);
  const pool = unseenPool(view, memory);
  const effRisk = effectiveRisk(view, t);
  const noiseSd = ((100 - t.handEval) / 100) * 90; // el değerlendirme zayıfsa değerlendirme gürültülü
  // Fırsat maliyeti: kalan koz/ceza haklarının gelecekteki değeri (el değerlendirme yüksekse tam, düşükse az hesaba katılır)
  const planWeight = t.handEval / 100;
  const results = options.map(() => []);

  for (let w = 0; w < sims; w++) {
    const world = sample(view, memory, rng, pool);
    options.forEach((opt, oi) => {
      const hands = world.map((a) => a.slice());
      const contract = { type: opt.contract, trump: opt.trump };
      const deltas = rollout(contract, hands, [], me, 1, false, false);
      results[oi].push(utility(deltas, me, -1, 0));
    });
  }

  const ranked = options
    .map((opt, oi) => ({ opt, score: riskAdjusted(results[oi], effRisk, TUNING.riskContract) + planWeight * continuationValue(view, opt) + gauss(rng) * noiseSd }))
    .sort((a, b) => b.score - a.score);
  return chooseWithNoise(ranked, t.consistency, rng).opt;
}
