// Tur kuralları: oynanabilir kartlar ve tur kazananı.
import { suitOf, rankOf, rankSymbol } from './cards.js';
import { KOZ, hasDiscardDuty, isPenaltyCard } from './contracts.js';

/**
 * Bu kart oynanınca "kupa dökülmüş" (hearts broken) olur mu? playsBefore: karttan önce masadaki kartlar.
 * Kupa almaz ve Rıfkı: yalnız rengi olmayan oyuncu kupa atmak zorunda kalınca (açılan renk kupa değilken kupa atılınca).
 * Kupa açmak (yalnız kupası kalan) ya da kupaya kupa atmak kırmaz.
 */
export function breaksHearts(type, playsBefore, card) {
  if (suitOf(card) !== 'H') return false;
  return playsBefore.length > 0 && suitOf(playsBefore[0].card) !== 'H';
}

const HONORS = ['A', 'K', 'Q'];
const hasAllHonors = (trumps) => HONORS.every((r) => trumps.some((c) => rankSymbol(c) === r));

/**
 * Koz kozlanmadan (kırılmadan) koz ile açma imtiyazı: elinde kozun A, K ve Q'sunun üçü de olan oyuncu
 * koz ile açabilir — ama yalnızca bu üç kartla ve arka arkaya üç turda hepsini oynamak zorundadır
 * (h.trumpRun: { seat, need: [henüz oynanmamış A/K/Q] }).
 * Bu fonksiyon, kart oynanmadan ÖNCE (tur açılırken) çağrılır: handBefore = oyuncunun oynamadan önceki eli.
 */
export function advanceTrumpRun(h, seat, card, handBefore) {
  if (h.contract.type !== KOZ || h.trick.plays.length > 0) return;
  const trump = h.contract.trump;
  const r = rankSymbol(card);
  if (h.trumpRun && h.trumpRun.seat === seat) {
    if (suitOf(card) === trump) {
      const need = h.trumpRun.need.filter((x) => x !== r);
      h.trumpRun = need.length > 0 ? { seat, need } : null;
    }
    return;
  }
  h.trumpRun = null;
  if (suitOf(card) !== trump || !HONORS.includes(r) || h.trumpBroken) return;
  const trumps = handBefore.filter((c) => suitOf(c) === trump);
  if (trumps.length < handBefore.length && hasAllHonors(trumps)) h.trumpRun = { seat, need: HONORS.filter((x) => x !== r) };
}

/** Masada koz varsa, oynanacak kozlar arasında daha büyük koz varsa yalnız onlar; yoksa hepsi. */
function raiseTrump(trumpCards, plays, trump) {
  let top = -1;
  for (const p of plays) if (suitOf(p.card) === trump) top = Math.max(top, rankOf(p.card));
  if (top < 0) return trumpCards;
  const higher = trumpCards.filter((c) => rankOf(c) > top);
  return higher.length > 0 ? higher : trumpCards;
}

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
    if (type === KOZ) {
      const trumps = cards.filter((c) => suitOf(c) === trump);
      const run = h.trumpRun;
      if (run && run.seat === seat) {
        // A-K-Q serisi sürüyor: kalan onur kartlarını arka arkaya açmak zorunda
        const need = trumps.filter((c) => run.need.includes(rankSymbol(c)));
        if (need.length > 0) return need;
      }
      if (trumps.length > 0 && trumps.length < cards.length && !h.trumpBroken) {
        // Koz kırılmadan koz açılamaz; istisna: A, K, Q'nun üçü de elindeyse bu üç kartla
        const withHonors = hasAllHonors(trumps);
        return cards.filter((c) => suitOf(c) !== trump || (withHonors && HONORS.includes(rankSymbol(c))));
      }
      return cards.slice();
    }
    if ((type === 'RIFKI' || type === 'KUPA') && !h.heartsBroken) {
      const nonHearts = cards.filter((c) => suitOf(c) !== 'H');
      if (nonHearts.length > 0) return nonHearts; // yalnız kupası kalan açabilir
    }
    return cards.slice();
  }

  // Renge uyma zorunluluğu
  const led = suitOf(plays[0].card);
  const follow = cards.filter((c) => suitOf(c) === led);
  if (type === KOZ && led === trump && follow.length > 0) return raiseTrump(follow, plays, trump);
  if (follow.length > 0) return follow;

  // Rengi yoksa
  if (type === KOZ) {
    const trumps = cards.filter((c) => suitOf(c) === trump);
    if (trumps.length > 0) return raiseTrump(trumps, plays, trump); // koz zorunluluğu + yükseltme
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
