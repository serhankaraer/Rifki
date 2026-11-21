// Tur kuralları: oynanabilir kartlar ve tur kazananı.
import { suitOf, rankOf } from './cards.js';
import { KOZ, hasDiscardDuty, isPenaltyCard } from './contracts.js';

/**
 * Bir koltuğun şu an oynayabileceği kartlar.
 * @param h el durumu: { contract, hands, trick: { plays }, heartsBroken }
 */
export function legalCards(h, seat, config = {}) {
  const cards = h.hands[seat];
  const plays = h.trick.plays;
  const { type, trump } = h.contract;

  // Tur açma
  if (plays.length === 0) {
    if ((type === 'RIFKI' || type === 'KUPA') && !h.heartsBroken) {
      const nonHearts = cards.filter((c) => suitOf(c) !== 'H');
      if (nonHearts.length > 0) return nonHearts; // yalnız kupası kalan açabilir
    }
    return cards.slice();
  }

  // Renge uyma zorunluluğu
  const led = suitOf(plays[0].card);
  const follow = cards.filter((c) => suitOf(c) === led);
  if (follow.length > 0) return follow;

  // Rengi yoksa
  if (type === KOZ) {
    const trumps = cards.filter((c) => suitOf(c) === trump);
    if (trumps.length > 0) return trumps; // koz oynama zorunluluğu
    return cards.slice();
  }
  if (type === 'RIFKI') {
    // Kupa papazı elindeyse onu atmak zorunda; yoksa herhangi bir kupa; kupası da yoksa serbest.
    if (cards.includes('KH')) return ['KH'];
    const hearts = cards.filter((c) => suitOf(c) === 'H');
    if (hearts.length > 0) return hearts;
    return cards.slice();
  }
  if (hasDiscardDuty(type)) {
    const penalty = cards.filter((c) => isPenaltyCard(type, c));
    if (penalty.length > 0) return penalty; // ceza kartı atma zorunluluğu
  }
  return cards.slice();
}

/** Turu kazanan koltuk. plays: [{ seat, card }] (4 kart, oynanma sırasıyla) */
export function trickWinner(plays, contract) {
  const trump = contract.type === KOZ ? contract.trump : null;
  let best = plays[0];
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i];
    const bs = suitOf(best.card);
    const ps = suitOf(p.card);
    if (ps === bs) {
      if (rankOf(p.card) > rankOf(best.card)) best = p;
    } else if (trump && ps === trump) {
      best = p; // best koz olamaz (takımlar farklı), koz kesti
    }
  }
  return best.seat;
}
