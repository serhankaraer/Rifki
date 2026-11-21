// Kart tanımları. Kart = "<rütbe><takım>" biçiminde string: "7D", "10H", "KH", "QS", "JC", "AD".
// Takımlar: C = Sinek, D = Karo, H = Kupa, S = Maça.

export const SUITS = ['C', 'D', 'H', 'S'];
export const RANK_SYMBOLS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_VALUE = Object.fromEntries(RANK_SYMBOLS.map((s, i) => [s, i + 2]));

export const suitOf = (card) => card.slice(-1);
export const rankSymbol = (card) => card.slice(0, -1);
export const rankOf = (card) => RANK_VALUE[rankSymbol(card)];

export function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANK_SYMBOLS) deck.push(r + s);
  return deck;
}

export function isValidCard(card) {
  return typeof card === 'string' && SUITS.includes(suitOf(card)) && rankOf(card) !== undefined;
}

// El gösterimi için sıralama: takım sırası, sonra rütbe büyükten küçüğe.
export function sortHand(cards) {
  return cards.slice().sort((a, b) => {
    const sa = SUITS.indexOf(suitOf(a));
    const sb = SUITS.indexOf(suitOf(b));
    return sa !== sb ? sa - sb : rankOf(b) - rankOf(a);
  });
}
