// Bot kişilik özellikleri (1-100), normal dağılımlı üretim ve düşünme gecikmesi.
import { createRng, shuffle } from '@rifki/engine';
import { NAMES } from './names.js';

export const TRAIT_KEYS = [
  'risk',            // risk alma iştahı
  'tracking',        // oyun takibi: oynanan kartları fark etme
  'inference',       // çıkarım: kart sayma, rakibin elini/renk bitirmesini tahmin etme
  'lookahead',       // ileri hesap: kaç olası dağıtımı simüle ettiği
  'handEval',        // el değerlendirme: sözleşme seçim isabeti
  'scoreAwareness',  // skor farkındalığı: duruma göre risk ayarı
  'aggression',      // saldırganlık: puanda öndeki rakibe ceza yedirme eğilimi
  'consistency',     // tutarlılık: düşükse insani hatalar
  'thinkSpeed',      // düşünme hızı: 100 = 2 sn, 1 = 10 sn
];

// Normal dağılım parametreleri (1-100 aralığına kırpılır: aralık dışı değerler yeniden çekilir)
export const TRAIT_MEAN = 50.5;
export const TRAIT_SD = 20;

export const MIN_THINK_MS = 1000;
export const MAX_THINK_MS = 3000;

export function gauss(rng) {
  const u1 = 1 - rng(); // (0, 1]
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** 1-100 arası tamsayı; normal dağılım (uçlar nadir, ortalar sık). */
export function sampleTrait(rng) {
  for (;;) {
    const v = Math.round(TRAIT_MEAN + TRAIT_SD * gauss(rng));
    if (v >= 1 && v <= 100) return v;
  }
}

export function sampleTraits(rng) {
  return Object.fromEntries(TRAIT_KEYS.map((k) => [k, sampleTrait(rng)]));
}

/** Düşünme gecikmesi (ms): sırası geldiğinde toplam düşünme süresi: thinkSpeed 100 -> ~1 sn, 1 -> ~3 sn, ±%20 sapma, [1 sn, 3 sn] aralığında. */
export function thinkDelayMs(thinkSpeed, rng) {
  const base = MAX_THINK_MS - ((thinkSpeed - 1) / 99) * (MAX_THINK_MS - MIN_THINK_MS);
  const jitter = 1 + (rng() * 2 - 1) * 0.2;
  return Math.min(MAX_THINK_MS, Math.max(MIN_THINK_MS, Math.round(base * jitter)));
}

/**
 * Bot profilleri üretir: listeden rastgele (tekrarsız) isim + rastgele özellik değerleri.
 * takenNames: odadaki insan oyuncuların takma adları (botlar bunlarla çakışmaz).
 */
export function createBotProfiles({ count, seed, takenNames = [] }) {
  const rng = createRng(`${seed}:botprofiles`);
  const taken = new Set(takenNames.map((n) => n.toLocaleLowerCase('tr')));
  const available = NAMES.filter((n) => !taken.has(n.name.toLocaleLowerCase('tr')));
  const chosen = shuffle(available, rng).slice(0, count);
  return chosen.map((n, i) => ({
    id: `bot-${i + 1}`,
    name: n.name,
    gender: n.gender,
    traits: sampleTraits(rng),
  }));
}
