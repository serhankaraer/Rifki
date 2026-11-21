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
