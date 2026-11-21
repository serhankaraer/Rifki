// Bot hafızası ve çıkarımı: oynanan kartları fark etme (takip), renk bitirme/kart çıkarımı (çıkarım),
// bilinmeyen kartların olası dağılımlarını örnekleme.
import { makeDeck, shuffle, suitOf, rankSymbol, rankOf, KOZ } from '@rifki/engine';
import { isPenaltyCard } from '@rifki/engine';

const DECK = makeDeck();
const ALL_QUEENS = ['QC', 'QD', 'QH', 'QS'];
const ALL_KJ = DECK.filter((c) => rankSymbol(c) === 'K' || rankSymbol(c) === 'J');

export function createMemory() {
  return { handNo: null, processed: 0, seen: new Set(), voids: [], cannot: [] };
}

function resetMemory(mem, handNo) {
  mem.handNo = handNo;
  mem.processed = 0;
  mem.seen = new Set();
  mem.voids = [new Set(), new Set(), new Set(), new Set()];
  mem.cannot = [new Set(), new Set(), new Set(), new Set()];
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

/**
 * Görünümdeki yeni oynanmış kartları hafızaya işler.
 * - tracking: bir kartı fark etme olasılığını belirler (yeni oynanan tur ve kendi kartları her zaman fark edilir).
 * - inference: renk bitirmeyi (ve buradan çıkarılan bilgileri) fark etme olasılığını belirler.
 */
export function updateMemory(mem, view, traits, rng) {
  if (mem.handNo !== view.handNo) resetMemory(mem, view.handNo);
  const events = [];
  for (const t of view.trickHistory) {
    const led = suitOf(t.plays[0].card);
    for (const p of t.plays) events.push({ seat: p.seat, card: p.card, led, current: false });
  }
  if (view.trick.plays.length > 0) {
    const led = suitOf(view.trick.plays[0].card);
    for (const p of view.trick.plays) events.push({ seat: p.seat, card: p.card, led, current: true });
  }
  const pBase = 0.4 + 0.6 * (traits.tracking / 100);
  const pInfer = 0.15 + 0.85 * (traits.inference / 100);
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

function assign(pool, opps, sizes, mem, rng) {
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
    let total = 0;
    for (const s of options) total += cap.get(s);
    let r = rng() * total;
    let pick = options[options.length - 1];
    for (const s of options) {
      r -= cap.get(s);
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
  const sizes = view.handSizes;
  let out = null;
  for (let attempt = 0; attempt < 8 && !out; attempt++) out = assign(pool, opps, sizes, mem, rng);
  if (!out) {
    // kısıtlar sağlanamadı (nadir): kısıtsız dağıt
    const free = { voids: [new Set(), new Set(), new Set(), new Set()], cannot: [new Set(), new Set(), new Set(), new Set()] };
    out = assign(pool, opps, sizes, free, rng);
  }
  const hands = [[], [], [], []];
  hands[me] = view.myHand.slice();
  for (const s of opps) hands[s] = out.get(s);
  return hands;
}
