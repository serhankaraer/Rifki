// Sözleşmeler, puanlama ve sözleşme defteri (ledger) kuralları.
import { suitOf, rankSymbol } from './cards.js';

export const KOZ = 'KOZ';
export const PENALTY_TYPES = ['RIFKI', 'KIZ', 'ERKEK', 'KUPA', 'SON_IKI', 'EL_ALMAZ'];

// Oyun yapısı (kilitlenen kararlar)
export const STRUCTURE = {
  hands: 20,               // toplam el
  kozPerPlayer: 2,         // oyuncu başına koz eli
  cezaPerPlayer: 3,        // oyuncu başına ceza eli
  usesPerPenaltyType: 2,   // her ceza türü tüm oyunda tam 2 kez
  forcedPenaltyHands: 4,   // ilk 4 el ceza eli (her oyuncu bir kez)
};

export const POINTS = {
  KOZ_TRICK: 50,
  RIFKI: 320,
  KIZ: 100,
  ERKEK: 60,
  KUPA: 30,
  SON_IKI: 180,
  EL_ALMAZ: 50,
};

// Açılan renkten kartı olmayan oyuncunun ceza kartı atma zorunluluğu olan sözleşmeler
const DISCARD_DUTY = ['RIFKI', 'KIZ', 'ERKEK', 'KUPA'];

export const hasDiscardDuty = (type) => DISCARD_DUTY.includes(type);

/**
 * Bir kart, verilen ceza sözleşmesinde "ceza kartı" mı?
 * (Rıfkı'da renk yokken atma kuralı rules.js içinde ayrıca işlenir: önce kupa papazı, sonra herhangi bir kupa.)
 */
export function isPenaltyCard(type, card) {
  const rank = rankSymbol(card);
  const suit = suitOf(card);
  switch (type) {
    case 'RIFKI':
      return card === 'KH';
    case 'KIZ':
      return rank === 'Q';
    case 'ERKEK':
      return rank === 'K' || rank === 'J';
    case 'KUPA':
      return suit === 'H';
    default:
      return false;
  }
}

/**
 * El puanlaması. takenBySeat: her koltuğun aldığı kartlar, trickWinners: 13 turun kazananları (sırayla).
 * Dönen değer: koltuk başına puan farkı (ceza = negatif).
 */
export function scoreHand(contract, takenBySeat, trickWinners) {
  const d = [0, 0, 0, 0];
  const type = contract.type;
  if (type === KOZ) {
    for (const w of trickWinners) d[w] += POINTS.KOZ_TRICK;
    return d;
  }
  if (type === 'SON_IKI') {
    d[trickWinners[trickWinners.length - 1]] -= POINTS.SON_IKI;
    d[trickWinners[trickWinners.length - 2]] -= POINTS.SON_IKI;
    return d;
  }
  if (type === 'EL_ALMAZ') {
    for (const w of trickWinners) d[w] -= POINTS.EL_ALMAZ;
    return d;
  }
  for (let seat = 0; seat < 4; seat++) {
    for (const card of takenBySeat[seat]) {
      const rank = rankSymbol(card);
      const suit = suitOf(card);
      if (type === 'RIFKI' && card === 'KH') d[seat] -= POINTS.RIFKI;
      else if (type === 'KIZ' && rank === 'Q') d[seat] -= POINTS.KIZ;
      else if (type === 'ERKEK' && (rank === 'K' || rank === 'J')) d[seat] -= POINTS.ERKEK;
      else if (type === 'KUPA' && suit === 'H') d[seat] -= POINTS.KUPA;
    }
  }
  return d;
}

// ---- Sözleşme defteri ----

export function newLedger() {
  return {
    koz: [0, 0, 0, 0],
    ceza: [0, 0, 0, 0],
    typeUses: Object.fromEntries(PENALTY_TYPES.map((t) => [t, 0])),
  };
}

/**
 * Sırası gelen oyuncunun seçebileceği sözleşmeler.
 * Dönen: { koz: boolean, penalties: string[] }
 */
export function selectableContracts(ledger, handNo, seat) {
  const penalties = [];
  if (ledger.ceza[seat] < STRUCTURE.cezaPerPlayer) {
    for (const t of PENALTY_TYPES) {
      if (ledger.typeUses[t] < STRUCTURE.usesPerPenaltyType) penalties.push(t);
    }
  }
  const koz = handNo > STRUCTURE.forcedPenaltyHands && ledger.koz[seat] < STRUCTURE.kozPerPlayer;
  return { koz, penalties };
}

export function recordContract(ledger, seat, type) {
  if (type === KOZ) ledger.koz[seat] += 1;
  else {
    ledger.ceza[seat] += 1;
    ledger.typeUses[type] += 1;
  }
}

/**
 * Defter hâlâ oyunu tamamlamaya uygun mu? (Tutarlılık kontrolü: kalan ceza hakları = kalan tür kapasitesi.)
 */
export function isLedgerFeasible(ledger) {
  let cezaNeed = 0;
  for (let p = 0; p < 4; p++) {
    const k = STRUCTURE.kozPerPlayer - ledger.koz[p];
    const c = STRUCTURE.cezaPerPlayer - ledger.ceza[p];
    if (k < 0 || c < 0) return false;
    cezaNeed += c;
  }
  let capacity = 0;
  for (const t of PENALTY_TYPES) {
    const left = STRUCTURE.usesPerPenaltyType - ledger.typeUses[t];
    if (left < 0) return false;
    capacity += left;
  }
  return cezaNeed === capacity;
}
