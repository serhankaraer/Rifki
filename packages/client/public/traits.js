// Bot özellikleri: ekran sırası ve kategori hesabı (saf fonksiyonlar). Değerleri ve arketipleri sunucu gönderir.

/** Doküman sırası (docs/bot-arketipleri.md). */
export const TRAIT_ORDER = ['handEval', 'kozAppetite', 'penaltyAvoid', 'memory', 'lookahead', 'aggression', 'scoreAwareness', 'consistency'];

/** 1 (çok zayıf, 1-20) … 5 (çok güçlü, 81-100): hem tek özellik hem genel puan için. */
export function traitLevel(value) {
  const v = Math.round(value);
  return v <= 20 ? 1 : v <= 40 ? 2 : v <= 60 ? 3 : v <= 80 ? 4 : 5;
}

/** Toplu bot seçimi: 1 = çok zayıf–orta, 2 = zayıf–güçlü, 3 = orta–çok güçlü (üç ardışık seviye). */
export const BANDS = [1, 2, 3];
export const bandLevels = (band) => [band, band + 2];
