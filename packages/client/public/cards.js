// Kart ve koltuk yardımcıları (saf fonksiyonlar). Kart biçimi: "<rütbe><takım>", örn. "7D", "10H", "KS".

export const SUIT_SYMBOL = { C: '♣', D: '♦', H: '♥', S: '♠' };
export const SUITS = ['C', 'D', 'H', 'S'];

export const parseCard = (card) => ({ rank: card.slice(0, -1), suit: card.slice(-1) });
export const isRed = (suit) => suit === 'D' || suit === 'H';

/** Benim koltuğuma göre yerleşim. Sıra saat yönünde ilerler: bir sonraki oyuncu solumda. */
export function relativePositions(mySeat) {
  return {
    bottom: mySeat,
    left: (mySeat + 1) % 4,
    top: (mySeat + 2) % 4,
    right: (mySeat + 3) % 4,
  };
}

/** Bir koltuğun masadaki konumu: 'bottom' | 'left' | 'top' | 'right' */
export function positionOf(mySeat, seat) {
  const p = relativePositions(mySeat);
  return Object.keys(p).find((k) => p[k] === seat);
}

const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankIndex = (card) => RANK_ORDER.indexOf(parseCard(card).rank);

/**
 * Eli renk gruplarına ayırır (grup içinde büyükten küçüğe).
 * Grup sırası: kırmızı renkler birbirinin, siyah renkler birbirinin yanına gelmez (mümkün olduğunca).
 * Dönen: [{ suit, cards: [...] }]
 */
export function groupHand(cards) {
  const bySuit = { C: [], D: [], H: [], S: [] };
  for (const c of cards) bySuit[parseCard(c).suit].push(c);
  for (const s of SUITS) bySuit[s].sort((a, b) => rankIndex(b) - rankIndex(a));
  const present = (list) => list.filter((s) => bySuit[s].length > 0);
  const blacks = present(['S', 'C']);
  const reds = present(['H', 'D']);
  let a = blacks.length >= reds.length ? blacks : reds; // çok olan renkle başla: S H C D gibi
  let b = a === blacks ? reds : blacks;
  a = a.slice(); b = b.slice();
  const order = [];
  while (a.length || b.length) {
    if (a.length) order.push(a.shift());
    if (b.length) order.push(b.shift());
  }
  return order.map((suit) => ({ suit, cards: bySuit[suit] }));
}
