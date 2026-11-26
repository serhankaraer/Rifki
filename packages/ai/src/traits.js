// Bot kişilik özellikleri (1-100), arketipten dinamik üretim, genel seviye ve düşünme gecikmesi.
// Kaynak doküman: docs/bot-arketipleri.md (21 arketip, özellik başına min-max aralığı).
import { createRng, shuffle } from '@rifki/engine';
import { NAMES } from './names.js';
import { ARCHETYPES } from './archetypes.js';

/** Sekiz karakter özelliği (doküman sırası). Düşünme hızı özellik değildir: profilde ayrı, gizli bir ayardır. */
export const TRAIT_KEYS = [
  'handEval',        // El değerlendirme: sözleşme seçim isabeti
  'kozAppetite',     // Koz iştahı: koz ihalesine eğilim (sözleşme seçimi) + koz ellerinde risk/baskı
  'penaltyAvoid',    // Ceza kaçınma: ceza ellerinde kendi yiyeceği cezaya verilen ağırlık (düşükse umursamaz, yüksekse duvar)
  'memory',          // Kart hafızası & çıkarım: oynanan kartları fark etme, renk bitirmeyi çıkarma, kart sayma
  'lookahead',       // İleri hesap: kaç olası dağıtımı simüle ettiği
  'aggression',      // Baskı & provokasyon: puanda öndeki rakibe ceza yedirme eğilimi
  'scoreAwareness',  // Skor farkındalığı: duruma göre risk ayarı
  'consistency',     // Tutarlılık: düşükse insani hatalar (en iyi yerine 2./3. hamle)
];

export const MIN_THINK_MS = 1000;
export const MAX_THINK_MS = 3000;

// ---- Kategoriler (doküman bölüm 1): 1-20 çok zayıf, 21-40 zayıf, 41-60 orta, 61-80 güçlü, 81-100 çok güçlü ----
export const LEVEL_KEYS = ['veryWeak', 'weak', 'medium', 'strong', 'veryStrong'];
/** 1 (çok zayıf) … 5 (çok güçlü) */
export function levelOfScore(score) {
  const s = Math.round(score);
  return s <= 20 ? 1 : s <= 40 ? 2 : s <= 60 ? 3 : s <= 80 ? 4 : 5;
}

/**
 * Karar mekanizmasının gördüğü değerler: sekiz özellik doğrudan (alt sınır yok: 1 ise 1, 100 ise 100).
 * Hafıza, takip ve çıkarımı birlikte sürer; risk iştahı koz iştahı ve baskıdan türetilir.
 */
export function effectiveTraits(traits) {
  return {
    handEval: traits.handEval,
    lookahead: traits.lookahead,
    consistency: traits.consistency,
    scoreAwareness: traits.scoreAwareness,
    aggression: traits.aggression,
    koz: traits.kozAppetite,
    ceza: traits.penaltyAvoid,
    tracking: traits.memory,
    inference: traits.memory,
    risk: (traits.kozAppetite + traits.aggression) / 2,
  };
}

// ---- Özellik etki parametresi ----
/**
 * Her özelliğin oyun gücüne (dolayısıyla arketip seviyesine) etkisi: 0-100. Genel puan, özellik değerlerinin bu ağırlıklarla
 * ağırlıklı ortalamasıdır; seviye (çok zayıf … çok güçlü) bundan çıkar. Hepsi aynı değerdeyse düz ortalamadır (dokümandaki hesap).
 * Etki ayarı yalnız seviye etiketini ve toplu seçimdeki arketip havuzunu değiştirir; botun oyun davranışını değiştirmez.
 *
 * Varsayılanlar ölçümlere en iyi uyan ağırlıklardır (README "Doğrulama": 21 arketip "hepsi 50" botlara karşı, ağırlıklı puan ile ölçülen güç
 * sırası arasında Spearman ≈ 0,82–0,91; eşit ağırlıkla 0,56–0,72). Koz iştahı, baskı ve skor farkındalığı yüksekken puan kaybettirir ya da etkisizdir,
 * etiketi yükseltmesinler diye 0. Etkiler birbirine tam eşit değildir (README "Denge durumu").
 * Sunucuda RIFKI_TRAIT_IMPACT ortam değişkeniyle (JSON) ya da setTraitImpact ile değiştirilir.
 */
export const TRAIT_IMPACT_DEFAULTS = {
  handEval: 28,
  kozAppetite: 0,
  penaltyAvoid: 35,
  memory: 30,
  lookahead: 75,
  aggression: 0,
  scoreAwareness: 0,
  consistency: 100,
};
export const TRAIT_IMPACT = { ...TRAIT_IMPACT_DEFAULTS };

/** Kısmi bir nesneyle etkileri günceller ({ lookahead: 80 }); { } ya da null varsayılanlara döner. Geçersiz giriş hata fırlatır. */
export function setTraitImpact(partial = null) {
  const next = { ...TRAIT_IMPACT_DEFAULTS };
  for (const [k, v] of Object.entries(partial ?? {})) {
    if (!TRAIT_KEYS.includes(k)) throw new Error(`Bilinmeyen özellik: ${k}`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) throw new Error(`Etki 0-100 olmalı: ${k}=${v}`);
    next[k] = v;
  }
  if (TRAIT_KEYS.every((k) => next[k] === 0)) throw new Error('En az bir özelliğin etkisi 0\'dan büyük olmalı');
  Object.assign(TRAIT_IMPACT, next);
  return { ...TRAIT_IMPACT };
}

/** Ağırlıklı genel puan (1-100). */
export function traitScore(traits, impact = TRAIT_IMPACT) {
  let sum = 0; let w = 0;
  for (const k of TRAIT_KEYS) { sum += impact[k] * traits[k]; w += impact[k]; }
  return sum / w;
}

/** Düz ortalama (dokümandaki "genel ortalama"). */
export const traitMean = (traits) => TRAIT_KEYS.reduce((s, k) => s + traits[k], 0) / TRAIT_KEYS.length;

// ---- Arketipler ----
export { ARCHETYPES };
export const getArchetype = (id) => ARCHETYPES.find((a) => a.id === id) ?? null;
const rangeMid = ([lo, hi]) => (lo + hi) / 2;

/** Arketipin ortalama (aralık orta noktaları) özelliklerinin ağırlıklı puanı. */
export function archetypeScore(arch, impact = TRAIT_IMPACT) {
  return traitScore(Object.fromEntries(TRAIT_KEYS.map((k) => [k, rangeMid(arch.ranges[k])])), impact);
}

/** Arketipin seviyesi 1-5: etki parametresine göre. Aynı arketipten üretilen her bot bu seviyeyi taşır. */
export const archetypeLevel = (arch, impact = TRAIT_IMPACT) => levelOfScore(archetypeScore(arch, impact));

/** Toplu seçim: band 1 = çok zayıf–orta, 2 = zayıf–güçlü, 3 = orta–çok güçlü (üç ardışık seviye). */
export const BANDS = [1, 2, 3];
export const bandLevels = (band) => [band, band + 2];

// Kimliği tanımlayan (çekirdek) özellikler dar aralıklıdır (±4…±7), yan özellikler geniş (±8…); doküman bölüm 2
const isCore = ([lo, hi]) => hi - lo <= 14;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const meanOf = (obj) => TRAIT_KEYS.reduce((s, k) => s + obj[k], 0) / TRAIT_KEYS.length;

// Ortalama sınırı (doküman bölüm 2, madde 3): çıkan düz ortalama hedef aralığın dışındaysa seçilen özellikler orantılı ölçeklenir
function scaleInto(values, keys, [tlo, thi]) {
  const m0 = meanOf(values);
  const up = m0 < tlo;
  const apply = (k) => {
    const out = { ...values };
    for (const key of keys) out[key] = clamp(Math.round(values[key] * k), 1, 100);
    return out;
  };
  let lo = 0.2; let hi = 3;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const m = meanOf(apply(mid));
    if (up ? m < tlo : m > thi) { if (up) lo = mid; else hi = mid; } else if (up) hi = mid; else lo = mid;
  }
  return apply(up ? hi : lo);
}

/** Arketip aralıklarından rastgele (tamsayı, her özellik kendi aralığında) bir bot karakteri üretir. */
export function sampleArchetypeTraits(arch, rng) {
  let v = {};
  for (const k of TRAIT_KEYS) {
    const [lo, hi] = arch.ranges[k];
    v[k] = lo + Math.floor(rng() * (hi - lo + 1));
  }
  const [tlo, thi] = arch.target;
  const inTarget = (x) => { const m = meanOf(x); return m >= tlo && m <= thi; };
  if (inTarget(v)) return v;
  const secondary = TRAIT_KEYS.filter((k) => !isCore(arch.ranges[k]));
  if (secondary.length > 0) v = scaleInto(v, secondary, arch.target);
  if (!inTarget(v)) v = scaleInto(v, TRAIT_KEYS, arch.target); // yan özellikler yetmezse hepsi
  return v;
}

/** Normal dağılımlı sayı (ölçüm araçları için). */
export function gauss(rng) {
  const u1 = 1 - rng(); // (0, 1]
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Düşünme gecikmesi (ms): thinkSpeed 100 -> ~1 sn, 1 -> ~3 sn, ±%20 sapma, [1 sn, 3 sn] aralığında. Oyun gücüne etkisi yoktur. */
export function thinkDelayMs(thinkSpeed, rng) {
  const base = MAX_THINK_MS - ((thinkSpeed - 1) / 99) * (MAX_THINK_MS - MIN_THINK_MS);
  const jitter = 1 + (rng() * 2 - 1) * 0.2;
  return Math.min(MAX_THINK_MS, Math.max(MIN_THINK_MS, Math.round(base * jitter)));
}

function pickArchetype(rng, { levels = [1, 5], exclude = new Set() } = {}) {
  const inBand = ARCHETYPES.filter((a) => { const l = archetypeLevel(a); return l >= levels[0] && l <= levels[1]; });
  const base = inBand.length > 0 ? inBand : ARCHETYPES; // (etki ayarı bandı boşaltırsa tümü)
  const fresh = base.filter((a) => !exclude.has(a.id)); // aynı odada aynı arketipten tekrar etme (mümkünse)
  const pool = fresh.length > 0 ? fresh : base;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Bot profilleri üretir: rastgele (tekrarsız) isim + arketip + o arketipin aralıklarından özellikler.
 * band: null (tüm arketipler) | 1 | 2 | 3 (bandLevels). takenNames: odadaki insan takma adları. excludeArchetypes: odada zaten olanlar.
 * Profil: { id, name, gender, archetype (id), traits (8), thinkSpeed (1-100, gizli) }
 */
export function createBotProfiles({ count, seed, takenNames = [], band = null, excludeArchetypes = [] }) {
  const rng = createRng(`${seed}:botprofiles`);
  const taken = new Set(takenNames.map((n) => n.toLocaleLowerCase('tr')));
  const available = NAMES.filter((n) => !taken.has(n.name.toLocaleLowerCase('tr')));
  const chosen = shuffle(available, rng).slice(0, count);
  const used = new Set(excludeArchetypes);
  return chosen.map((n, i) => {
    const arch = pickArchetype(rng, { levels: band ? bandLevels(band) : [1, 5], exclude: used });
    used.add(arch.id);
    return {
      id: `bot-${i + 1}`,
      name: n.name,
      gender: n.gender,
      archetype: arch.id,
      traits: sampleArchetypeTraits(arch, rng),
      thinkSpeed: 1 + Math.floor(rng() * 100),
    };
  });
}

/** Ekranda/loglarda gösterilecek özet: arketip, seviye (arketipten), genel puan (botun kendi özelliklerinden), düz ortalama. */
export function profileInfo(profile) {
  const arch = getArchetype(profile.archetype);
  return {
    archetype: arch ? { id: arch.id, name: arch.name, summary: arch.summary } : null,
    level: arch ? archetypeLevel(arch) : levelOfScore(traitScore(profile.traits)),
    overall: Math.round(traitScore(profile.traits) * 10) / 10,
    mean: Math.round(traitMean(profile.traits) * 10) / 10,
  };
}

/** Bota göre seviye 1-5 (arketipten). */
export const botStrength = (profile) => profileInfo(profile).level;
