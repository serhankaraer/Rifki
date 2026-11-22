// Bot başarı deneyleri. Kullanım:
//   node tools/experiments.js <deney> [tohum_sayısı] [çıktı.json]
// Her tohum 4 kez oynanır (denenen oyuncu 4 koltuğu da dener). Oyun toplamı sıfır olduğundan,
// denenen oyuncunun ortalama puanı = diğer 3 oyuncuya göre üstünlüğüdür (0 = eşit).
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { runGameFull, traitsAll } from './arena.js';
import { TRAIT_KEYS } from '../src/traits.js';
import { TUNING, TUNING_DEFAULTS } from '../src/decide.js';

const SELF = fileURLToPath(import.meta.url);
const GAMEPLAY_TRAITS = TRAIT_KEYS.filter((k) => k !== 'thinkSpeed');
const bot = (traits) => ({ kind: 'bot', traits });
const avgBot = bot(traitsAll(50));

/** Deney tanımları: { name, tester, others, simsScale?, floor? } listesi */
export const EXPERIMENTS = {
  // Bot kodu mu, özellikler mi? Tüm özellikleri aynı seviyeye çekip ortalama botlara karşı oynat.
  baseline: () => [
    { name: 'rastgele oyuncu', tester: { kind: 'random' }, others: avgBot },
    { name: 'tüm özellikler 1', tester: bot(traitsAll(1)), others: avgBot },
    { name: 'tüm özellikler 25', tester: bot(traitsAll(25)), others: avgBot },
    { name: 'tüm özellikler 50 (kontrol)', tester: bot(traitsAll(50)), others: avgBot },
    { name: 'tüm özellikler 75', tester: bot(traitsAll(75)), others: avgBot },
    { name: 'tüm özellikler 100', tester: bot(traitsAll(100)), others: avgBot },
  ],
  // Yeni alt sınır denemeleri: en az 4 simülasyon (saf sezgisel mod kaldırıldı)
  lookahead1: () => [
    { name: 'lookahead=1 (en az 4 simülasyon)', tester: bot(traitsAll(50, { lookahead: 1 })), others: avgBot },
    { name: 'lookahead=15', tester: bot(traitsAll(50, { lookahead: 15 })), others: avgBot },
    { name: 'lookahead=30', tester: bot(traitsAll(50, { lookahead: 30 })), others: avgBot },
  ],
  // Güncel ayarla (TRAIT_FLOOR) özet: oyuncu gücü sıralaması
  final: () => [
    { name: 'rastgele oyuncu', tester: { kind: 'random' }, others: avgBot },
    { name: 'tüm özellikler 1', tester: bot(traitsAll(1)), others: avgBot },
    { name: 'tüm özellikler 50 (kontrol)', tester: bot(traitsAll(50)), others: avgBot },
    { name: 'tüm özellikler 100', tester: bot(traitsAll(100)), others: avgBot },
  ],
  // Bilgi tavanı: rakiplerin gerçek ellerini bilen bot ne kadar kazanır? (çıkarımın alabileceği azami değer)
  oracle: () => [
    { name: 'normal (50)', tester: bot(traitsAll(50)), others: avgBot },
    { name: 'hileli: gerçek elleri biliyor (50)', tester: { ...bot(traitsAll(50)), oracle: true }, others: avgBot },
    { name: 'çıkarım=1 takip=1', tester: bot(traitsAll(50, { inference: 1, tracking: 1 })), others: avgBot, floor: 1 },
    { name: 'çıkarım=100 takip=100', tester: bot(traitsAll(50, { inference: 100, tracking: 100 })), others: avgBot, floor: 1 },
  ],
  // Tarz ölçümü: risk / saldırganlık / skor farkındalığı uçları (diğer özellikler 50, taban 1: ham değer)
  style: () => ['risk', 'aggression', 'scoreAwareness'].flatMap((k) => [
    { name: `${k}=1`, tester: bot(traitsAll(50, { [k]: 1 })), others: avgBot, floor: 1, detail: true },
    { name: `${k}=100`, tester: bot(traitsAll(50, { [k]: 100 })), others: avgBot, floor: 1, detail: true },
  ]),
  // El değerlendirme ve çıkarım: uçlar (diğer özellikler 50, ham değer)
  skill2: () => ['handEval', 'inference'].flatMap((k) => [
    { name: `${k}=1`, tester: bot(traitsAll(50, { [k]: 1 })), others: avgBot, floor: 1 },
    { name: `${k}=100`, tester: bot(traitsAll(50, { [k]: 100 })), others: avgBot, floor: 1 },
  ]),
  // Çıkarım uçları (diğer özellikler 50, ham değer)
  infer: () => [
    { name: 'inference=1', tester: bot(traitsAll(50, { inference: 1 })), others: avgBot, floor: 1 },
    { name: 'inference=100', tester: bot(traitsAll(50, { inference: 100 })), others: avgBot, floor: 1 },
  ],
  // Tarz katsayısı denemeleri (TUNING geçersiz kılmaları)
  tune: () => [
    { name: 'risk=1  kart.35/söz1.0', tester: bot(traitsAll(50, { risk: 1 })), others: avgBot, floor: 1, detail: true, tuning: { riskCard: 0.35, riskContract: 1.0 } },
    { name: 'risk=100 kart.35/söz1.0', tester: bot(traitsAll(50, { risk: 100 })), others: avgBot, floor: 1, detail: true, tuning: { riskCard: 0.35, riskContract: 1.0 } },
    { name: 'risk=1  kart.6/söz.5', tester: bot(traitsAll(50, { risk: 1 })), others: avgBot, floor: 1, detail: true, tuning: { riskCard: 0.6, riskContract: 0.5 } },
    { name: 'risk=100 kart.6/söz.5', tester: bot(traitsAll(50, { risk: 100 })), others: avgBot, floor: 1, detail: true, tuning: { riskCard: 0.6, riskContract: 0.5 } },
    { name: 'aggr=100 katsayı 0', tester: bot(traitsAll(50, { aggression: 100 })), others: avgBot, floor: 1, detail: true, tuning: { aggression: 0 } },
    { name: 'aggr=100 katsayı 3', tester: bot(traitsAll(50, { aggression: 100 })), others: avgBot, floor: 1, detail: true, tuning: { aggression: 3 } },
    { name: 'skor=1  kayma 100', tester: bot(traitsAll(50, { scoreAwareness: 1 })), others: avgBot, floor: 1, detail: true, tuning: { saShift: 100 } },
    { name: 'skor=100 kayma 100', tester: bot(traitsAll(50, { scoreAwareness: 100 })), others: avgBot, floor: 1, detail: true, tuning: { saShift: 100 } },
  ],
  // Tarz katsayıları, ikinci tur
  tune2: () => [
    { name: 'skor=1  kayma 0', tester: bot(traitsAll(50, { scoreAwareness: 1 })), others: avgBot, floor: 1, detail: true, tuning: { saShift: 0, riskCard: 0.6, riskContract: 0.5 } },
    { name: 'skor=100 kayma 0', tester: bot(traitsAll(50, { scoreAwareness: 100 })), others: avgBot, floor: 1, detail: true, tuning: { saShift: 0, riskCard: 0.6, riskContract: 0.5 } },
    { name: 'aggr=1  katsayı 2.5', tester: bot(traitsAll(50, { aggression: 1 })), others: avgBot, floor: 1, detail: true, tuning: { aggression: 2.5, saShift: 0, riskCard: 0.6, riskContract: 0.5 } },
    { name: 'aggr=100 katsayı 2.5', tester: bot(traitsAll(50, { aggression: 100 })), others: avgBot, floor: 1, detail: true, tuning: { aggression: 2.5, saShift: 0, riskCard: 0.6, riskContract: 0.5 } },
  ],
  // Skor farkındalığı (yeni tasarım)
  tune3: () => [
    { name: 'skor=1  kayma 60', tester: bot(traitsAll(50, { scoreAwareness: 1 })), others: avgBot, floor: 1, detail: true },
    { name: 'skor=100 kayma 60', tester: bot(traitsAll(50, { scoreAwareness: 100 })), others: avgBot, floor: 1, detail: true },
    { name: 'skor=1  kayma 120', tester: bot(traitsAll(50, { scoreAwareness: 1 })), others: avgBot, floor: 1, detail: true, tuning: { saShift: 120 } },
    { name: 'skor=100 kayma 120', tester: bot(traitsAll(50, { scoreAwareness: 100 })), others: avgBot, floor: 1, detail: true, tuning: { saShift: 120 } },
  ],
  // Değiştirilen beş özelliğin son hali: biri 1 ya da 100, diğerleri 50 (ham değerler)
  ablation2: () => ['handEval', 'inference', 'risk', 'aggression', 'scoreAwareness'].flatMap((k) => [
    { name: `${k}=1`, tester: bot(traitsAll(50, { [k]: 1 })), others: avgBot, floor: 1, detail: true },
    { name: `${k}=100`, tester: bot(traitsAll(50, { [k]: 100 })), others: avgBot, floor: 1, detail: true },
  ]),
  // Alt sınır (taban) taraması: görünen 1 değeri davranışta f gibi çalışır. Herkes aynı tabanla oynar.
  floor: () => [1, 20, 30, 40].flatMap((f) => [
    { name: `taban ${f}: tüm özellikler 1`, tester: bot(traitsAll(1)), others: avgBot, floor: f },
    { name: `taban ${f}: yalnız tutarlılık=1`, tester: bot(traitsAll(50, { consistency: 1 })), others: avgBot, floor: f },
    { name: `taban ${f}: yalnız ileri hesap=1`, tester: bot(traitsAll(50, { lookahead: 1 })), others: avgBot, floor: f },
  ]),
  // Tek özellik etkisi: biri 1 ya da 100, diğerleri 50
  ablation: () => GAMEPLAY_TRAITS.flatMap((k) => [
    { name: `${k}=1`, tester: bot(traitsAll(50, { [k]: 1 })), others: avgBot },
    { name: `${k}=100`, tester: bot(traitsAll(50, { [k]: 100 })), others: avgBot },
  ]),
};

function jobsFor(conds, seeds) {
  const jobs = [];
  conds.forEach((c, ci) => {
    for (let s = 0; s < seeds; s++) for (let rot = 0; rot < 4; rot++) jobs.push({ ci, seed: `exp-${s}`, rot });
  });
  return jobs;
}

export function summarize(conds, results) {
  return conds.map((c, ci) => {
    const xs = results.filter((r) => r.ci === ci).map((r) => r.score);
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
    return { name: c.name, n, mean: Math.round(mean), se: Math.round(sd / Math.sqrt(n)) };
  });
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const round = (v, d = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/**
 * Tarz ölçümleri (denenen oyuncunun davranışı; güç değil):
 *  risk: kendi ilan ettiği ellerde sonucun standart sapması (oynaklık) ve koz / yüksek riskli ceza (RIFKI, SON_IKI, EL_ALMAZ) seçme payı
 *  agg: puanda önde giden rakibin eldeki farkı (lider - diğer iki rakibin ortalaması; negatif = lideri daha çok yedirmiş)
 *  skor: kalan oynaklığa göre geride (z < -1) ve önde (z > 1) iken el sonucunun standart sapması (10. elden sonra)
 */
export function styleTable(conds, results) {
  return conds.map((c, ci) => {
    const recs = results.filter((r) => r.ci === ci && r.hands);
    const declared = []; const rel = []; const aggr = []; const trail = []; const lead = [];
    const kozHands = []; let risky = 0; let decl = 0;
    for (const r of recs) {
      const cum = [0, 0, 0, 0];
      for (const [handNo, declarer, type, d] of r.hands) {
        const me = r.rot;
        const avg = (d[0] + d[1] + d[2] + d[3]) / 4;
        const rl = d[me] - avg;
        rel.push(rl);
        if (declarer === me) {
          declared.push(rl); decl++;
          if (type === 'KOZ') kozHands.push(handNo);
          if (type === 'RIFKI' || type === 'SON_IKI' || type === 'EL_ALMAZ') risky++;
        }
        const others = [0, 1, 2, 3].filter((s) => s !== me);
        const z = cum[me] / (140 * Math.sqrt(Math.max(20 - handNo, 0.25))); // kalan oynaklığa göre durum
        if (handNo >= 10) (z < -1 ? trail : z > 1 ? lead : []).push(rl);
        const leader = others.reduce((a, b) => (cum[b] > cum[a] ? b : a));
        const rest = others.filter((s) => s !== leader);
        if (handNo >= 5 && cum[leader] - Math.max(...rest.map((s) => cum[s])) >= 100) aggr.push(d[leader] - mean(rest.map((s) => d[s])));
        for (let s = 0; s < 4; s++) cum[s] += d[s];
      }
    }
    return {
      name: c.name,
      'kendi ilan sd': round(sd(declared)),
      'koz ort. el': round(mean(kozHands), 1),
      'riskli ceza %': round((100 * risky) / decl, 1),
      'lider farkı': round(mean(aggr), 1),
      'geride sd': round(sd(trail)),
      'önde sd': round(sd(lead)),
      'kazanma %': round((100 * recs.filter((r) => r.score > 0).length) / Math.max(1, recs.length), 1),
      'geride n': trail.length,
      'önde n': lead.length,
    };
  });
}

async function main() {
  const [, , expName, seedsArg = '50', outPath] = process.argv;
  const conds = EXPERIMENTS[expName]();
  const seeds = Number(seedsArg);
  const jobs = jobsFor(conds, seeds);
  const workers = Number(process.env.WORKERS ?? 2);
  const results = [];
  let next = 0; let done = 0;
  const t0 = Date.now();
  await new Promise((resolve) => {
    for (let w = 0; w < workers; w++) {
      const child = fork(SELF, ['worker'], { execArgv: [] });
      const feed = () => {
        if (next >= jobs.length) { child.send({ stop: true }); return; }
        const job = jobs[next++];
        child.send({ job, cond: conds[job.ci] });
      };
      child.on('message', (m) => {
        results.push(m);
        done++;
        if (done % 20 === 0) console.log(`${done}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)} sn)`);
        if (done === jobs.length) { child.send({ stop: true }); resolve(); return; }
        feed();
      });
      feed();
    }
  });
  const table = summarize(conds, results);
  console.table(table);
  if (conds.some((c) => c.detail)) console.table(styleTable(conds, results));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify({ expName, seeds, table, results }, null, 1));
  process.exit(0);
}

if (process.argv[2] === 'worker') {
  process.on('message', (m) => {
    if (m.stop) process.exit(0);
    const { job, cond } = m;
    Object.assign(TUNING, TUNING_DEFAULTS, cond.tuning ?? {});
    const seats = [0, 1, 2, 3].map((i) => (i === job.rot ? cond.tester : cond.others));
    const { scores, handResults } = runGameFull({ seed: job.seed, seats, simsScale: cond.simsScale ?? 1, floor: cond.floor });
    const msg = { ci: job.ci, seed: job.seed, rot: job.rot, score: scores[job.rot] };
    if (cond.detail) msg.hands = handResults.map((r) => [r.handNo, r.declarer, r.contract.type, r.deltas]);
    process.send(msg);
  });
} else if (process.argv[1] === SELF) {
  main();
}
