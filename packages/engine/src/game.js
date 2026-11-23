// Oyun durum makinesi. Tüm fonksiyonlar saf: girdiyi değiştirmez, yeni durum + olaylar döner.
// Metin üretmez; olaylar ve hata kodları dilden bağımsızdır (i18n istemci tarafında).
import { SUITS, makeDeck, sortHand, isValidCard, suitOf } from './cards.js';
import { createRng, shuffle } from './rng.js';
import {
  KOZ,
  STRUCTURE,
  newLedger,
  selectableContracts,
  recordContract,
  scoreHand,
  rifkiRedealSeats,
  penaltyCardsTaken,
  allPenaltyTaken,
} from './contracts.js';
import { legalCards, trickWinner, breaksHearts, advanceTrumpRun } from './rules.js';

export const DEFAULT_CONFIG = {};

/** King: koz sahibi 11+ el alırsa oyun biter. */
export const KING_TARGET = 11;

export class RuleError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'RuleError';
    this.code = code;
    this.detail = detail;
  }
}

const nextSeat = (s) => (s + 1) % 4;

/** Oyun kaydına bir el ekler (el bittiğinde ya da King ile oyun kesildiğinde). */
function logHand(state, extra) {
  const h = state.hand;
  (state.handLog ??= []).push({
    handNo: state.handNo,
    declarer: state.declarer,
    contract: { ...h.contract },
    redeals: structuredClone(h.redeals ?? []),
    deal: structuredClone(h.deal ?? null),
    tricks: structuredClone(h.trickHistory),
    ...extra,
  });
}

function dealHand(state, events, redealsSoFar = []) {
  const rng = createRng(state.redeals > 0 ? `${state.seed}:hand:${state.handNo}:redeal${state.redeals}` : `${state.seed}:hand:${state.handNo}`);
  const deck = shuffle(makeDeck(), rng);
  const hands = [0, 1, 2, 3].map((i) => sortHand(deck.slice(i * 13, i * 13 + 13)));
  if (state.handNo === 1) {
    state.firstDeclarer = hands.findIndex((h) => h.includes('7D')); // karo 7 kimdeyse o başlar
  }
  state.declarer = (state.firstDeclarer + state.handNo - 1) % 4; // saat yönünde döner
  state.hand = {
    contract: null,
    hands,
    trick: { leader: null, plays: [] },
    trickNo: 0,
    takenCards: [[], [], [], []],
    trickHistory: [],
    deal: hands.map((x) => [...x]), // oyun kaydı için ilk dağıtım
    redeals: redealsSoFar,        // bu elde yapılan yeniden dağıtımlar (oyun kaydı)
    heartsBroken: false,
    trumpBroken: false,
    trumpRun: null, // koz A-K-Q imtiyaz serisi: { seat, need }
  };
  state.phase = 'CONTRACT_SELECT';
  state.turn = state.declarer;
  events.push({ type: 'HAND_DEALT', handNo: state.handNo, declarer: state.declarer });
}

/** Yeni oyun: 1. eli dağıtılmış durumu döner. */
export function createGame({ seed, config = {} } = {}) {
  if (seed === undefined || seed === null) throw new RuleError('SEED_REQUIRED');
  const state = {
    seed: String(seed),
    config: { ...DEFAULT_CONFIG, ...config },
    phase: 'LOBBY',
    handNo: 1,
    redeals: 0, // bu elde kaç kez yeniden dağıtıldı
    firstDeclarer: null,
    declarer: null,
    turn: null,
    scores: [0, 0, 0, 0],
    ledger: newLedger(),
    handResults: [],
    handLog: [], // oyun kaydı: biten (ve King ile kesilen) ellerin tam dökümü; yalnız oyun bitince görünümde yer alır
    hand: null,
  };
  const events = [{ type: 'GAME_STARTED', seed: state.seed }];
  dealHand(state, events);
  return { state, events };
}

/**
 * Komut uygular.
 * Komutlar: { type:'CHOOSE_CONTRACT', seat, contract, trump? } | { type:'PLAY_CARD', seat, card } | { type:'NEXT_HAND' }
 * Hata: RuleError (code: NOT_YOUR_TURN, WRONG_PHASE, ILLEGAL_CONTRACT, INVALID_TRUMP, CARD_NOT_IN_HAND, ILLEGAL_CARD, ...)
 */
export function applyCommand(prev, cmd) {
  const state = structuredClone(prev);
  const events = [];

  switch (cmd.type) {
    case 'CHOOSE_CONTRACT': {
      if (state.phase !== 'CONTRACT_SELECT') throw new RuleError('WRONG_PHASE');
      if (cmd.seat !== state.turn) throw new RuleError('NOT_YOUR_TURN');
      const options = selectableContracts(state.ledger, state.handNo, cmd.seat);
      if (cmd.contract === KOZ) {
        if (!options.koz) throw new RuleError('ILLEGAL_CONTRACT', { contract: cmd.contract });
        if (!SUITS.includes(cmd.trump)) throw new RuleError('INVALID_TRUMP');
      } else if (!options.penalties.includes(cmd.contract)) {
        throw new RuleError('ILLEGAL_CONTRACT', { contract: cmd.contract });
      }
      if (cmd.king !== undefined && cmd.king !== false && cmd.king !== true) throw new RuleError('ILLEGAL_CONTRACT', { contract: cmd.contract });
      if (cmd.king && cmd.contract !== KOZ) throw new RuleError('ILLEGAL_CONTRACT', { contract: cmd.contract });
      const redealSeats = cmd.contract === 'RIFKI' ? rifkiRedealSeats(state.hand.hands, cmd.seat) : [];
      if (redealSeats.length) {
        // Sözleşme kaydedilmez; el yeniden dağıtılır ve seçici yeniden seçer.
        // Tetikleyen oyuncuların (eski) elleri herkese açılır.
        const reveals = redealSeats.map((seat) => ({ seat, hand: [...state.hand.hands[seat]] }));
        state.redeals += 1;
        events.push({ type: 'REDEALT', handNo: state.handNo, reason: 'RIFKI_LONE_HEART_HONOR', declarer: cmd.seat, reveals });
        dealHand(state, events, [...state.hand.redeals, { declarer: cmd.seat, reason: 'RIFKI_LONE_HEART_HONOR', deal: state.hand.deal }]);
        break;
      }
      recordContract(state.ledger, cmd.seat, cmd.contract);
      state.hand.contract = { type: cmd.contract, trump: cmd.contract === KOZ ? cmd.trump : null };
      if (cmd.king) state.hand.contract.king = true;
      state.hand.trick = { leader: state.declarer, plays: [] };
      state.phase = 'PLAYING';
      state.turn = state.declarer;
      events.push({
        type: 'CONTRACT_CHOSEN',
        seat: cmd.seat,
        contract: cmd.contract,
        trump: state.hand.contract.trump,
        ...(cmd.king ? { king: true } : {}),
      });
      break;
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'PLAYING') throw new RuleError('WRONG_PHASE');
      if (cmd.seat !== state.turn) throw new RuleError('NOT_YOUR_TURN');
      const h = state.hand;
      if (!isValidCard(cmd.card) || !h.hands[cmd.seat].includes(cmd.card)) {
        throw new RuleError('CARD_NOT_IN_HAND');
      }
      if (!legalCards(h, cmd.seat, state.config).includes(cmd.card)) {
        throw new RuleError('ILLEGAL_CARD', { card: cmd.card });
      }
      advanceTrumpRun(h, cmd.seat, cmd.card, h.hands[cmd.seat]);
      h.hands[cmd.seat] = h.hands[cmd.seat].filter((c) => c !== cmd.card);
      if (breaksHearts(h.contract.type, h.trick.plays, cmd.card)) h.heartsBroken = true;
      h.trick.plays.push({ seat: cmd.seat, card: cmd.card });
      // Koz kırılır: bir oyuncu açılan rengi olmadığı için kozla keserse
      if (h.contract.type === KOZ && h.trick.plays.length > 1 && suitOf(h.trick.plays[0].card) !== h.contract.trump
        && suitOf(cmd.card) === h.contract.trump) h.trumpBroken = true;
      events.push({ type: 'CARD_PLAYED', seat: cmd.seat, card: cmd.card });

      if (h.trick.plays.length < 4) {
        state.turn = nextSeat(cmd.seat);
        break;
      }

      // Tur tamamlandı
      const winner = trickWinner(h.trick.plays, h.contract);
      h.trickNo += 1;
      const plays = h.trick.plays.map((p) => ({ ...p }));
      for (const p of plays) h.takenCards[winner].push(p.card);
      h.trickHistory.push({ trickNo: h.trickNo, leader: h.trick.leader, plays, winner });
      events.push({ type: 'TRICK_WON', trickNo: h.trickNo, winner, plays });

      if (h.contract.king) {
        const mine = h.takenCards[state.declarer].length / 4;
        const lost = h.trickNo - mine;
        const success = mine >= KING_TARGET;
        if (success || lost > 13 - KING_TARGET) {
          // King biter oyunu: başarılıysa yalnız seçici çıkar, başarısızsa yalnız seçici batar. Puanlar önemsizdir.
          state.phase = 'GAME_OVER';
          state.turn = null;
          state.kingEnd = { declarer: state.declarer, success, handNo: state.handNo, tricks: mine, tricksPlayed: h.trickNo };
          logHand(state, { deltas: null, scoresAfter: [...state.scores], kingEnd: true });
          const winnersSeats = [0, 1, 2, 3].filter((s) => (s === state.declarer) === success);
          events.push({ type: 'KING_ENDED', ...state.kingEnd });
          events.push({ type: 'GAME_ENDED', scores: [...state.scores], winners: winnersSeats, king: true });
          break;
        }
      }

      const earlyEnd = h.trickNo < 13 && allPenaltyTaken(h.contract.type, h.takenCards);
      if (h.trickNo < 13 && !earlyEnd) {
        h.trick = { leader: winner, plays: [] };
        state.turn = winner;
        break;
      }

      // El bitti
      const winners = h.trickHistory.map((t) => t.winner);
      const deltas = scoreHand(h.contract, h.takenCards, winners);
      for (let i = 0; i < 4; i++) state.scores[i] += deltas[i];
      logHand(state, { deltas, scoresAfter: [...state.scores], earlyEnd });
      state.handResults.push({
        handNo: state.handNo,
        declarer: state.declarer,
        contract: { ...h.contract },
        deltas,
        tricksPlayed: h.trickNo,
        earlyEnd,
      });
      events.push({
        type: 'HAND_SCORED',
        handNo: state.handNo,
        declarer: state.declarer,
        contract: { ...h.contract },
        deltas,
        scores: [...state.scores],
        tricksPlayed: h.trickNo,
        earlyEnd,
      });
      state.turn = null;
      if (state.handNo === STRUCTURE.hands) {
        state.phase = 'GAME_OVER';
        // Sıfırın üstünde puan alanlar kazanır
        const winnersSeats = state.scores.flatMap((s, i) => (s > 0 ? [i] : []));
        events.push({ type: 'GAME_ENDED', scores: [...state.scores], winners: winnersSeats });
      } else {
        state.phase = 'HAND_SCORED';
      }
      break;
    }

    case 'NEXT_HAND': {
      if (state.phase !== 'HAND_SCORED') throw new RuleError('WRONG_PHASE');
      state.handNo += 1;
      state.redeals = 0;
      dealHand(state, events);
      break;
    }

    default:
      throw new RuleError('UNKNOWN_COMMAND', { type: cmd.type });
  }

  return { state, events };
}

/**
 * Bir koltuğun görebildiği durum. Diğer oyuncuların elleri ASLA dahil edilmez.
 * Botlar da yalnızca bunu kullanır.
 */
export function viewFor(state, seat) {
  const view = {
    seat,
    phase: state.phase,
    handNo: state.handNo,
    declarer: state.declarer,
    turn: state.turn,
    scores: [...state.scores],
    ledger: structuredClone(state.ledger),
    handResults: structuredClone(state.handResults),
    config: { ...state.config },
    kingEnd: state.kingEnd ? { ...state.kingEnd } : null,
  };
  if (state.phase === 'GAME_OVER') view.gameLog = structuredClone(state.handLog ?? []); // tüm eller açılır: yalnız oyun bittiğinde
  const h = state.hand;
  if (!h) return view;

  view.myHand = [...h.hands[seat]];
  view.handSizes = h.hands.map((x) => x.length);
  view.contract = h.contract ? { ...h.contract } : null;
  view.trick = structuredClone(h.trick);
  view.trickNo = h.trickNo;
  view.trickHistory = structuredClone(h.trickHistory);
  view.heartsBroken = h.heartsBroken;
  view.trumpBroken = h.trumpBroken;
  view.tricksTaken = h.takenCards.map((c) => c.length / 4); // alınan el sayıları (herkese açık)
  view.trumpRun = h.trumpRun ? { seat: h.trumpRun.seat, need: [...h.trumpRun.need] } : null;
  // Ceza kartları önde açık durur: herkes kimin hangi ceza kartını aldığını görür
  view.penaltyTaken = h.contract ? penaltyCardsTaken(h.contract.type, h.takenCards) : [[], [], [], []];

  if (state.turn === seat) {
    if (state.phase === 'CONTRACT_SELECT') {
      view.selectable = selectableContracts(state.ledger, state.handNo, seat);
    } else if (state.phase === 'PLAYING') {
      view.legalCards = legalCards(h, seat, state.config);
    }
  }
  return view;
}

/** Sunucu/bot için kısayol: şu an sırası gelen koltuğun yapabileceği hamleler. */
export function currentOptions(state) {
  if (state.phase === 'CONTRACT_SELECT') {
    return { kind: 'CHOOSE_CONTRACT', seat: state.turn, ...selectableContracts(state.ledger, state.handNo, state.turn) };
  }
  if (state.phase === 'PLAYING') {
    return { kind: 'PLAY_CARD', seat: state.turn, cards: legalCards(state.hand, state.turn, state.config) };
  }
  return null;
}
