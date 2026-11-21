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
