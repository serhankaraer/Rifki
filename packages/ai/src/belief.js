// Bot hafızası ve çıkarımı: oynanan kartları fark etme (takip), renk bitirme/kart çıkarımı (çıkarım),
// bilinmeyen kartların olası dağılımlarını örnekleme.
import fs from 'node:fs';
import { makeDeck, shuffle, suitOf, rankSymbol, rankOf, KOZ, SUITS, breaksHearts } from '@rifki/engine';
import { isPenaltyCard } from '@rifki/engine';

const DECK = makeDeck();
// İlan edenin sözleşme seçiminin elini ele vermesi: kart sınıfı başına olabilirlik oranları (tools/gen-declarer-prior.js)
const PRIOR = JSON.parse(fs.readFileSync(new URL('./declarer-prior.json', import.meta.url), 'utf8')).ratios;
const ALL_QUEENS = ['QC', 'QD', 'QH', 'QS'];
const ALL_KJ = DECK.filter((c) => rankSymbol(c) === 'K' || rankSymbol(c) === 'J');

/** Kart sınıfı: özel renk (koz ya da kupa) için 0-5, diğer renkler için 6-11; grup: A, K, Q, J, 10-8, 7-2. */
export function cardClass(card, specialSuit) {
  const r = rankSymbol(card);
  const g = r === 'A' ? 0 : r === 'K' ? 1 : r === 'Q' ? 2 : r === 'J' ? 3 : rankOf(card) >= 8 ? 4 : 5;
  return (suitOf(card) === specialSuit ? 0 : 6) + g;
}

export function createMemory() {
  return { handNo: null, processed: 0, seen: new Set(), voids: [], cannot: [], must: null, tilt: 0 };
}

function resetMemory(mem, handNo) {
  mem.handNo = handNo;
  mem.processed = 0;
  mem.seen = new Set();
  mem.voids = [new Set(), new Set(), new Set(), new Set()];
  mem.cannot = [new Set(), new Set(), new Set(), new Set()];
  mem.must = null;
}

function isRelevantCard(contract, card) {
  if (!contract) return false;
  if (contract.type === KOZ) return suitOf(card) === contract.trump;
  return isPenaltyCard(contract.type, card);
}

function isOpenPenaltyCard(contract, card) {
  return !!contract && contract.type !== KOZ && isPenaltyCard(contract.type, card);
}

// Renk bitiren oyuncunun attığı karttan çıkarılabilecek ek bilgiler (kuralların tersten okunması)
function applyExclusions(mem, seat, card, contract) {
  switch (contract.type) {
    case KOZ:
      if (suitOf(card) !== contract.trump) mem.voids[seat].add(contract.trump);
      break;
    case 'RIFKI':
      if (card !== 'KH') {
        if (suitOf(card) !== 'H') mem.voids[seat].add('H');
        else mem.cannot[seat].add('KH');
      }
      break;
    case 'KIZ':
      if (rankSymbol(card) !== 'Q') for (const q of ALL_QUEENS) mem.cannot[seat].add(q);
      break;
    case 'ERKEK':
      if (!(rankSymbol(card) === 'K' || rankSymbol(card) === 'J')) for (const c of ALL_KJ) mem.cannot[seat].add(c);
      break;
    case 'KUPA':
      if (suitOf(card) !== 'H') mem.voids[seat].add('H');
      break;
    default:
  }
}

const HONOR_RANKS = ['A', 'K', 'Q'];
const MISREAD_MAX = 0.12;

// Kuralların tersten okunmasıyla elde edilen kesin çıkarımlar (derin çıkarım: yalnız çıkarım özelliği yüksek botlar fark eder).
//  1. Koz: masadaki en büyük kozdan küçük koz atan oyuncunun elinde daha büyük koz yoktur (yükseltme zorunluluğu).
//  2. Koz kırılmadan, A/K/Q olmayan bir kozla açan oyuncunun elinde yalnız koz kalmıştır.
//  3. Kupa almaz / Rıfkı: kupa kırılmadan kupa ile açan oyuncunun elinde yalnız kupa kalmıştır.
function deepDeductions(mem, e, contract) {
  const seat = e.seat;
  const suit = suitOf(e.card);
  if (contract.type === KOZ) {
    const trump = contract.trump;
    if (suit === trump) {
      let top = -1;
      for (const p of e.before) if (suitOf(p.card) === trump) top = Math.max(top, rankOf(p.card));
      if (top >= 0 && rankOf(e.card) < top) {
        for (const c of DECK) if (suitOf(c) === trump && rankOf(c) > top) mem.cannot[seat].add(c);
      }
      if (e.before.length === 0 && !e.tb && !HONOR_RANKS.includes(rankSymbol(e.card))) {
        for (const s of SUITS) if (s !== trump) mem.voids[seat].add(s);
      }
    }
  } else if ((contract.type === 'RIFKI' || contract.type === 'KUPA') && e.before.length === 0 && suit === 'H' && !e.hb) {
    for (const s of SUITS) if (s !== 'H') mem.voids[seat].add(s);
  }
}

/**
 * Görünümdeki yeni oynanmış kartları hafızaya işler.
 * - tracking: bir kartı fark etme olasılığını belirler (yeni oynanan tur ve kendi kartları her zaman fark edilir).
 * - inference: renk bitirmeyi (ve buradan çıkarılan bilgileri) fark etme olasılığını belirler.
 */
export function updateMemory(mem, view, traits, rng) {
  if (mem.handNo !== view.handNo) resetMemory(mem, view.handNo);
  const events = [];
  let tb = false; // koz kırıldı mı (kronolojik)
  let hb = false; // kupa kırıldı mı (kronolojik)
  const pushTrick = (plays, current) => {
    const led = suitOf(plays[0].card);
    plays.forEach((p, i) => {
      const before = plays.slice(0, i);
      events.push({ seat: p.seat, card: p.card, led, current, before, tb, hb });
      if (view.contract) {
        if (breaksHearts(view.contract.type, before, p.card)) hb = true;
        if (view.contract.type === KOZ && before.length > 0 && led !== view.contract.trump && suitOf(p.card) === view.contract.trump) tb = true;
      }
    });
  };
  for (const t of view.trickHistory) pushTrick(t.plays, false);
  if (view.trick.plays.length > 0) pushTrick(view.trick.plays, true);
  const pBase = 0.4 + 0.6 * (traits.tracking / 100);
  const pInfer = 0.15 + 0.85 * (traits.inference / 100);
  const pDeep = Math.max(0, (traits.inference - 15) / 85);
  const pMisread = MISREAD_MAX * (1 - traits.inference / 100); // yanlış çıkarım olasılığı (her renge uyma hamlesinde)
  mem.tilt = 0.9 * (traits.inference / 100); // ilan edenin elini sözleşme seçiminden tahmin etme gücü
  for (let i = mem.processed; i < events.length; i++) {
    const e = events[i];
    const pNotice = isRelevantCard(view.contract, e.card) ? Math.min(1, pBase + 0.25) : pBase;
    // Ceza kartları alanın önünde açık durur: her zaman bilinir (hafıza/takip özelliğinden bağımsız)
    const openPenalty = isOpenPenaltyCard(view.contract, e.card);
    const noticed = e.seat === view.seat || e.current || openPenalty || rng() < pNotice;
    if (noticed) mem.seen.add(e.card);
    if (noticed && e.seat !== view.seat && suitOf(e.card) !== e.led && rng() < pInfer) {
      mem.voids[e.seat].add(e.led);
      if (view.contract) applyExclusions(mem, e.seat, e.card, view.contract);
    }
    if (noticed && e.seat !== view.seat && view.contract && rng() < pDeep) deepDeductions(mem, e, view.contract);
    // Yanlış çıkarım: çıkarımı zayıf oyuncu, renge uyan bir rakibi bazen başka bir renkten bitmiş sanır
    if (noticed && e.seat !== view.seat && e.before.length > 0 && suitOf(e.card) === e.led && rng() < pMisread) {
      const others = SUITS.filter((s) => s !== e.led);
      mem.voids[e.seat].add(others[Math.floor(rng() * others.length)]);
    }
  }
  // A-K-Q serisi sürüyorsa: serideki oyuncunun elinde kalan onur kartları kesin vardır
  mem.must = null;
  if (view.contract && view.contract.type === KOZ && view.trumpRun && view.trumpRun.seat !== view.seat && rng() < pDeep) {
    mem.must = { seat: view.trumpRun.seat, cards: view.trumpRun.need.map((r) => `${r}${view.contract.trump}`) };
  }
  mem.processed = events.length;
  // Masada açık duran (alınmış) ceza kartları her zaman bilinen kartlardır
  for (const cards of view.penaltyTaken ?? []) for (const c of cards) mem.seen.add(c);
}

/** Botun bilinmeyen saydığı kartlar: tüm deste - kendi eli - fark edilen oynanmış kartlar. */
export function unseenPool(view, mem) {
  const mine = new Set(view.myHand);
  return DECK.filter((c) => !mine.has(c) && !mem.seen.has(c));
}

function assign(pool, opps, sizes, mem, rng, tilt = null) {
  const cap = new Map(opps.map((s) => [s, sizes[s]]));
  const eligible = (s, c) => !mem.voids[s].has(suitOf(c)) && !mem.cannot[s].has(c);
  const need = opps.reduce((a, s) => a + sizes[s], 0);
  const cards = shuffle(pool, rng).filter((c) => opps.some((s) => eligible(s, c)));
  if (cards.length < need) return null;
  const chosen = cards.slice(0, need);
  chosen.sort((a, b) => opps.filter((s) => eligible(s, a)).length - opps.filter((s) => eligible(s, b)).length);
  const out = new Map(opps.map((s) => [s, []]));
  for (const c of chosen) {
    const options = opps.filter((s) => cap.get(s) > 0 && eligible(s, c));
    if (options.length === 0) return null;
    const wt = (s) => cap.get(s) * (tilt && s === tilt.seat ? tilt.w.get(c) ?? 1 : 1);
    let total = 0;
    for (const s of options) total += wt(s);
    let r = rng() * total;
    let pick = options[options.length - 1];
    for (const s of options) {
      r -= wt(s);
      if (r < 0) { pick = s; break; }
    }
    out.get(pick).push(c);
    cap.set(pick, cap.get(pick) - 1);
  }
  return out;
}

/**
 * Bilinmeyen kartları rakiplere, bilinen kısıtlara (renk bitirme vb.) uyarak olası bir dağılımla paylaştırır.
 * Dönen: 4 elli dizi (kendi eli gerçek; rakiplerinki örneklenmiş).
 */
export function sampleWorld(view, mem, rng, pool = unseenPool(view, mem)) {
  const me = view.seat;
  const opps = [0, 1, 2, 3].filter((s) => s !== me);
  const sizes = view.handSizes.slice();
  // Kesin bilinen kartlar (A-K-Q serisi): önce ilgili oyuncuya verilir
  let forcedSeat = -1;
  let forced = [];
  if (mem.must && mem.must.seat !== me) {
    forced = mem.must.cards.filter((c) => pool.includes(c));
    if (forced.length > 0) { forcedSeat = mem.must.seat; sizes[forcedSeat] -= forced.length; pool = pool.filter((c) => !forced.includes(c)); }
  }
  // İlan eden rakibin elinin tahmini: seçtiği sözleşmeye uygun kartlara daha yüksek ağırlık
  let tilt = null;
  const dec = view.declarer;
  if (mem.tilt > 0 && view.contract && dec !== me && dec !== null && dec !== undefined) {
    const ratios = PRIOR[view.contract.type];
    if (ratios) {
      const special = view.contract.type === KOZ ? view.contract.trump : 'H';
      tilt = { seat: dec, w: new Map(pool.map((c) => [c, Math.pow(ratios[cardClass(c, special)], mem.tilt)])) };
    }
  }
  let out = null;
  for (let attempt = 0; attempt < 8 && !out; attempt++) out = assign(pool, opps, sizes, mem, rng, tilt);
  if (!out) {
    // kısıtlar sağlanamadı (nadir): kısıtsız dağıt
    const free = { voids: [new Set(), new Set(), new Set(), new Set()], cannot: [new Set(), new Set(), new Set(), new Set()] };
    out = assign(pool, opps, sizes, free, rng);
  }
  const hands = [[], [], [], []];
  hands[me] = view.myHand.slice();
  for (const s of opps) hands[s] = out.get(s);
  if (forcedSeat >= 0) hands[forcedSeat].push(...forced);
  return hands;
}
