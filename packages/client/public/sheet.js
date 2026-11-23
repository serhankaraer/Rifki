// Puan cetveli veri modeli (saf fonksiyon, DOM yok -> Node'da test edilir).
// Gerçek King kâğıdına benzer: sütunlar oyuncular, satırlar ceza türleri (her biri 2 kez oynanır), Koz bloğu (8 el), toplamlar.

export const SHEET_TYPES = ['RIFKI', 'EL_ALMAZ', 'KUPA', 'ERKEK', 'KIZ', 'SON_IKI'];
export const SHEET_POINTS = { RIFKI: 320, EL_ALMAZ: 50, KUPA: 30, ERKEK: 60, KIZ: 100, SON_IKI: 180 };
export const SHEET_KOZ_LINES = 8;
export const SHEET_USES = 2;
export const SHEET_CEZA_RIGHTS = 3;
export const SHEET_KOZ_RIGHTS = 2;

const line = (r) => (r ? { handNo: r.handNo, declarer: r.declarer, deltas: r.deltas, trump: r.contract.trump ?? null, earlyEnd: !!r.earlyEnd } : null);

/**
 * handResults: görünümdeki biten eller; ledger: sözleşme defteri (seçilen hak sayıları).
 * Dönen:
 *  rows:  ceza satırları [{ type, points, lines: [line|null, line|null] }]
 *  koz:   8 satır [line|null]
 *  marks: koltuk başına { ceza: kullanılan, koz: kullanılan }
 *  totals: koltuk başına { ceza, koz, total }
 */
export function buildSheet(handResults, ledger) {
  const rows = SHEET_TYPES.map((type) => {
    const plays = handResults.filter((r) => r.contract.type === type);
    return { type, points: SHEET_POINTS[type], lines: Array.from({ length: SHEET_USES }, (_, i) => line(plays[i])) };
  });
  const kozPlays = handResults.filter((r) => r.contract.type === 'KOZ');
  const koz = Array.from({ length: SHEET_KOZ_LINES }, (_, i) => line(kozPlays[i]));
  const marks = [0, 1, 2, 3].map((s) => ({ ceza: ledger?.ceza?.[s] ?? 0, koz: ledger?.koz?.[s] ?? 0 }));
  const totals = [0, 1, 2, 3].map(() => ({ ceza: 0, koz: 0, total: 0 }));
  for (const r of handResults) {
    const key = r.contract.type === 'KOZ' ? 'koz' : 'ceza';
    r.deltas.forEach((d, s) => { totals[s][key] += d; totals[s].total += d; });
  }
  return { rows, koz, marks, totals };
}

/** Oyun sonu sıralaması: puanı sıfırın üstünde olanlar kazanır. */
export function finalStandings(scores) {
  return [0, 1, 2, 3]
    .map((seat) => ({ seat, score: scores[seat], won: scores[seat] > 0 }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
}

// ---- Kesin çıkar / kesin batar ----
// Bir oyunun toplamı (zero-sum): ceza elleri toplam puanları aşağıdaki gibidir; her ceza türü 2 kez oynanır, koz eli 8 tane (en çok +650).
export const SHEET_PENALTY_HAND_TOTAL = { RIFKI: 320, KIZ: 400, ERKEK: 480, KUPA: 390, SON_IKI: 360, EL_ALMAZ: 650 };
export const SHEET_KOZ_HAND_MAX = 650;
export const SHEET_TOTAL_HANDS = 20;
export const SHEET_LAST_HANDS = 4;
/** Masadaki puan ve eşik notları yalnız son 4 elde (17–20) gösterilir. */
export const isLastHands = (handNo) => handNo > SHEET_TOTAL_HANDS - SHEET_LAST_HANDS;
const SHEET_KOZ_TRICK = 50;

/**
 * Oyun ortasında sonuç kesinleşti mi? Dönen: koltuk başına 'win' | 'lose' | null
 *  win:  kalan TÜM cezaları tek başına yese bile puanı sıfırın üstünde kalır (kesin çıkar)
 *  lose: kalan TÜM koz ellerini sonuna kadar kazansa bile puanı sıfırın üstüne çıkamaz (kesin batar)
 * Oynanmakta olan el de "kalan" sayılır (en kötü / en iyi durum varsayılır).
 * King ile biten oyunda sonuç kingEnd'den gelir.
 */
function remainingOf(handResults) {
  let remainingPenalty = 0;
  for (const type of Object.keys(SHEET_PENALTY_HAND_TOTAL)) {
    const done = handResults.filter((r) => r.contract.type === type).length;
    remainingPenalty += Math.max(0, SHEET_USES - done) * SHEET_PENALTY_HAND_TOTAL[type];
  }
  const kozDone = handResults.filter((r) => r.contract.type === 'KOZ').length;
  return { remainingPenalty, remainingKoz: Math.max(0, SHEET_KOZ_LINES - kozDone) };
}

export function certainStatus(handResults, scores, kingEnd = null) {
  if (kingEnd) return [0, 1, 2, 3].map((s) => ((s === kingEnd.declarer) === kingEnd.success ? 'win' : 'lose'));
  const { remainingPenalty, remainingKoz } = remainingOf(handResults);
  return scores.map((sc) => {
    if (sc - remainingPenalty > 0) return 'win';
    if (sc + remainingKoz * SHEET_KOZ_HAND_MAX <= 0) return 'lose';
    return null;
  });
}

/**
 * Masada oyuncu başına durum: { status: 'win'|'lose'|null, canEat?, needKoz? }
 *  - kesin olmayan oyuncu, tüm koz elleri bittiğinde: canEat = kalan cezalarda çıkmak için yiyebileceği en çok puan (puanlar 10'un katıdır)
 *  - kesin olmayan oyuncu, tüm cezalar bittiğinde: needKoz = çıkmak için kalan kozlarda alması gereken en az puan / el (her el +50)
 */
export function seatOutlook(handResults, scores, kingEnd = null) {
  const status = certainStatus(handResults, scores, kingEnd);
  const { remainingPenalty, remainingKoz } = remainingOf(handResults);
  return scores.map((sc, i) => {
    if (status[i] || kingEnd) return { status: status[i] };
    if (remainingKoz === 0) return { status: null, canEat: sc - 10 };
    if (remainingPenalty === 0) {
      const tricks = Math.floor(-sc / 50) + 1;
      return { status: null, needKoz: { points: tricks * 50, tricks } };
    }
    return { status: null };
  });
}

// ---- Oynanan el için eşikler (masada gösterilir) ----
// Ceza birimi: kart/el başına puan ve elde toplam birim sayısı (engine POINTS / PENALTY_CARD_TOTAL ile aynı).
export const SHEET_UNIT = {
  RIFKI: { pts: 320, total: 1 }, KIZ: { pts: 100, total: 4 }, ERKEK: { pts: 60, total: 8 },
  KUPA: { pts: 30, total: 13 }, SON_IKI: { pts: 180, total: 2 }, EL_ALMAZ: { pts: 50, total: 13 },
};

/**
 * Oynanmakta olan el için koltuk başına eşik notu (yalnız son 4 elde; kesin çıkan/batan oyuncularda null):
 *  - Ceza elinde: bu elin cezasının TAMAMINI yese bile batması kesinleşmiyorsa null; kesinleşiyorsa en az kaç birim yiyince
 *    kesin batar -> { lose: { type, k } }   (kalan koz ellerinin en iyi durumu sayılır: puan - k*birim + kalanKoz*650 <= 0)
 *  - Koz elinde: kesin çıkmak için bu elde en az kaç koz (el) alması gerekir -> { needKoz: k }
 *    (kalan tüm cezaların en kötü durumu sayılır: puan + 50*k - kalanCeza > 0; 13'ü aşıyorsa null)
 */
export function seatHandNotes(handResults, scores, contract, kingEnd = null, handNo = 0) {
  const none = scores.map(() => null);
  if (!contract || kingEnd || !isLastHands(handNo)) return none;
  const status = certainStatus(handResults, scores, null);
  const { remainingPenalty, remainingKoz } = remainingOf(handResults);
  return scores.map((sc, i) => {
    if (status[i]) return null;
    if (contract.type === 'KOZ') {
      const k = Math.floor((remainingPenalty - sc) / SHEET_KOZ_TRICK) + 1;
      return k >= 1 && k <= 13 ? { needKoz: k } : null;
    }
    const u = SHEET_UNIT[contract.type];
    if (!u) return null;
    const k = Math.max(1, Math.ceil((sc + remainingKoz * SHEET_KOZ_HAND_MAX) / u.pts));
    return k <= u.total ? { lose: { type: contract.type, k } } : null;
  });
}

/**
 * Son 4 elde, kalan ceza ve koz haklarına göre her oyuncunun durumu — 7 sınıf:
 *   'win' kesin çıkar | 'win2' çıkmaya çok yakın | 'win1' çıkmaya yakın | 'mid' ortada | 'lose1' batmaya yakın | 'lose2' batmaya çok yakın | 'lose' kesin batar
 * Kesin sonuçlar certainStatus'tan gelir. Diğerleri için tahmin: kalan koz puanı (hak * 650) ile kalan ceza puanı
 * oyuncular arasında eşit paylaşılırsa son puan:
 *   tahmin = puan + (kalanKoz*650 - kalanCeza) / 4;  ölçek = (kalanKoz*650 + kalanCeza) / 4;  oran = tahmin / ölçek
 *   oran > 0.5 'win2', > 0.15 'win1', >= -0.15 'mid', > -0.5 'lose1', aksi 'lose2'
 * Dönen (koltuk başına): { level, estimate } ya da null (son 4 el değil / King bitti).
 */
export const TREND_LEVELS = ['win', 'win2', 'win1', 'mid', 'lose1', 'lose2', 'lose'];
export function seatTrend(handResults, scores, kingEnd = null, handNo = 0) {
  if (kingEnd || !isLastHands(handNo)) return scores.map(() => null);
  const status = certainStatus(handResults, scores, null);
  const { remainingPenalty, remainingKoz } = remainingOf(handResults);
  const kozPts = remainingKoz * SHEET_KOZ_HAND_MAX;
  const scale = Math.max(1, (kozPts + remainingPenalty) / 4);
  return scores.map((sc, i) => {
    const estimate = Math.round(sc + (kozPts - remainingPenalty) / 4);
    if (status[i]) return { level: status[i], estimate };
    const ratio = estimate / scale;
    const level = ratio > 0.5 ? 'win2' : ratio > 0.15 ? 'win1' : ratio >= -0.15 ? 'mid' : ratio > -0.5 ? 'lose1' : 'lose2';
    return { level, estimate };
  });
}
