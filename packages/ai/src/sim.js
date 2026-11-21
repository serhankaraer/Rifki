// Hızlı el simülasyonu (Monte Carlo rollout) ve sezgisel (heuristic) oynama politikası.
// Motorun saf fonksiyonlarını (legalCards, trickWinner) kullanır ama durumu klonlamaz.
import { suitOf, rankOf, rankSymbol, legalCards, trickWinner, breaksHearts, KOZ, POINTS } from '@rifki/engine';

export function cardPenalty(type, card) {
  switch (type) {
    case 'RIFKI': return card === 'KH' ? POINTS.RIFKI : 0;
    case 'KIZ': return rankSymbol(card) === 'Q' ? POINTS.KIZ : 0;
    case 'ERKEK': { const r = rankSymbol(card); return r === 'K' || r === 'J' ? POINTS.ERKEK : 0; }
    case 'KUPA': return suitOf(card) === 'H' ? POINTS.KUPA : 0;
    default: return 0;
  }
}

/** Tek bir turun kazanana yazdığı puan (koz: +, ceza: -). trickNo: 1..13 */
export function trickPointsFor(contract, cards, trickNo) {
  const type = contract.type;
  switch (type) {
    case KOZ: return POINTS.KOZ_TRICK;
    case 'SON_IKI': return trickNo >= 12 ? -POINTS.SON_IKI : 0;
    case 'EL_ALMAZ': return -POINTS.EL_ALMAZ;
    default: {
      let s = 0;
      for (const c of cards) s += cardPenalty(type, c);
      return -s;
    }
  }
}

const lowest = (cards) => cards.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
const highest = (cards) => cards.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));

function beats(a, b, trump) {
  const sa = suitOf(a);
  const sb = suitOf(b);
  if (sa === sb) return rankOf(a) > rankOf(b);
  return trump !== null && sa === trump;
}

function winningCard(plays, trump) {
  let best = plays[0].card;
  for (let i = 1; i < plays.length; i++) if (beats(plays[i].card, best, trump)) best = plays[i].card;
  return best;
}

function playAvoid(legal, plays, trickNo, type) {
  const early = type === 'SON_IKI' && trickNo < 12; // son iki: erken turlarda yüksek kartlardan kurtul
  if (plays.length === 0) return early ? highest(legal) : lowest(legal);

  const led = suitOf(plays[0].card);
  const following = suitOf(legal[0]) === led;

  if (!following) {
    // rengi yok: ceza kartı (zorunluysa zaten legal içinde), yoksa en yüksek kartı at
    let best = legal[0];
    let bestScore = -1;
    for (const c of legal) {
      const s = cardPenalty(type, c) * 100 + rankOf(c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return best;
  }

  if (early) return highest(legal);
  const win = winningCard(plays, null);
  const under = legal.filter((c) => rankOf(c) < rankOf(win));
  if (under.length > 0) return highest(under); // turu almadan en yüksek kartı yak
  // turu almak zorunda
  let danger = 0;
  for (const p of plays) danger += cardPenalty(type, p.card);
  const costlyWin = type === 'EL_ALMAZ' || (type === 'SON_IKI' && trickNo >= 12);
  if (plays.length === 3 && danger === 0 && !costlyWin) return highest(legal); // bedava tur: yüksek kartı yak
  return lowest(legal);
}

function playKoz(legal, plays, trump) {
  if (plays.length === 0) {
    const nonTrump = legal.filter((c) => suitOf(c) !== trump);
    const top = nonTrump.filter((c) => rankOf(c) >= 13);
    if (top.length > 0) return highest(top);
    const trumps = legal.filter((c) => suitOf(c) === trump);
    if (trumps.length >= 4) return highest(trumps);
    return nonTrump.length > 0 ? lowest(nonTrump) : lowest(legal);
  }
  const win = winningCard(plays, trump);
  const winners = legal.filter((c) => beats(c, win, trump));
  if (winners.length > 0) return lowest(winners);
  return lowest(legal);
}

/**
 * Sezgisel oynama. h: { contract, hands, trick: { plays }, heartsBroken, trumpBroken }; trickNo: oynanan turun numarası (1..13).
 * Yalnızca h.hands[seat] gerçek olmalıdır.
 */
export function heuristicPlay(h, seat, trickNo) {
  const legal = legalCards(h, seat);
  if (legal.length === 1) return legal[0];
  const { type, trump } = h.contract;
  return type === KOZ ? playKoz(legal, h.trick.plays, trump) : playAvoid(legal, h.trick.plays, trickNo, type);
}

/**
 * Elin kalanını tüm koltuklar sezgisel politikayla oynayarak simüle eder.
 * hands: 4 el (değiştirilir), plays: oynanmakta olan turun kartları (değiştirilir), turn: sıradaki koltuk,
 * trickNo: oynanmakta olan turun numarası. Dönen: koltuk başına kalan turlardan gelen puan farkı.
 */
export function rollout(contract, hands, plays, turn, trickNo, heartsBroken, trumpBroken = false) {
  const deltas = [0, 0, 0, 0];
  const h = { contract, hands, trick: { plays }, heartsBroken, trumpBroken };
  let cur = plays;
  for (;;) {
    while (cur.length < 4) {
      const card = heuristicPlay(h, turn, trickNo);
      const hand = hands[turn];
      hand.splice(hand.indexOf(card), 1);
      if (breaksHearts(contract.type, cur, card)) h.heartsBroken = true;
      cur.push({ seat: turn, card });
      if (contract.type === KOZ && cur.length > 1 && suitOf(cur[0].card) !== contract.trump && suitOf(card) === contract.trump) h.trumpBroken = true;
      turn = (turn + 1) % 4;
    }
    const winner = trickWinner(cur, contract);
    deltas[winner] += trickPointsFor(contract, cur.map((p) => p.card), trickNo);
    if (trickNo >= 13) break;
    trickNo += 1;
    cur = [];
    h.trick = { plays: cur };
    turn = winner;
  }
  return deltas;
}
