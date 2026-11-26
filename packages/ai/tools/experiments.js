// Bot başarı deneyleri. Kullanım:
//   node tools/experiments.js <deney> [tohum_sayısı] [çıktı.json]
// Her tohum 4 kez oynanır (denenen oyuncu 4 koltuğu da dener). Oyun toplamı sıfır olduğundan,
// denenen oyuncunun ortalama puanı = diğer 3 oyuncuya göre üstünlüğüdür (0 = eşit).
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { runGameFull, traitsAll } from './arena.js';
import { TRAIT_KEYS, ARCHETYPES } from '../src/traits.js';
import { TUNING, TUNING_DEFAULTS } from '../src/decide.js';

const SELF = fileURLToPath(import.meta.url);
const bot = (traits) => ({ kind: 'bot', traits });
const avgBot = bot(traitsAll(50));

/** Deney tanımları: { name, tester, others, simsScale?, tuning?, detail? } listesi */
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
  // Tek özellik etkisi: biri 1 ya da 100, diğerleri 50 (etki parametresinin varsayılanları buradan türetilir). Tarz göstergeleri de basılır.
  traits: () => TRAIT_KEYS.flatMap((k) => [
    { name: `${k}=1`, tester: bot(traitsAll(50, { [k]: 1 })), others: avgBot, detail: true },
    { name: `${k}=100`, tester: bot(traitsAll(50, { [k]: 100 })), others: avgBot, detail: true },
  ]),
  // Koz iştahı ayarı: KOZ seçeneğine eklenen değer (kozBias) ve ortaya çıkan koz payı / güç
  kozbias: () => [50, 100, 200].flatMap((kb) => [
    { name: `koz=1 bias ${kb}`, tester: bot(traitsAll(50, { kozAppetite: 1 })), others: avgBot, detail: true, tuning: { kozBias: kb } },
    { name: `koz=100 bias ${kb}`, tester: bot(traitsAll(50, { kozAppetite: 100 })), others: avgBot, detail: true, tuning: { kozBias: kb } },
  ]),
  // Tutarlılık ayarı: hata olasılığının üst sınırı (errorMax); hedef: etkisi diğer özelliklerle (≈ ±100) aynı büyüklükte
  consistency: () => [0.3, 0.15, 0.1].flatMap((em) => [
    { name: `tutarlılık=1 hata ${em}`, tester: bot(traitsAll(50, { consistency: 1 })), others: avgBot, tuning: { errorMax: em } },
    { name: `tutarlılık=100 hata ${em}`, tester: bot(traitsAll(50, { consistency: 100 })), others: avgBot, tuning: { errorMax: em } },
  ]),
  // Ceza kaçınma ayarı: kendi ceza puanının ağırlık yayılımı (lossSpread)
  ceza: () => [0.25, 0.5, 1].flatMap((ls) => [
    { name: `ceza=1 yayılım ${ls}`, tester: bot(traitsAll(50, { penaltyAvoid: 1 })), others: avgBot, detail: true, tuning: { lossSpread: ls } },
    { name: `ceza=100 yayılım ${ls}`, tester: bot(traitsAll(50, { penaltyAvoid: 100 })), others: avgBot, detail: true, tuning: { lossSpread: ls } },
  ]),
  // 21 arketip: aralık orta noktalarıyla üretilen bot, üç "hepsi 50" bota karşı (doküman seviyesi ve hesaplanan seviye ile birlikte)
  archetypes: () => ARCHETYPES.map((a) => ({
    name: `${String(a.no).padStart(2)} ${a.name} [doküman ${a.docLevel}]`,
    tester: bot(Object.fromEntries(TRAIT_KEYS.map((k) => [k, Math.round((a.ranges[k][0] + a.ranges[k][1]) / 2)]))),
    others: avgBot,
    detail: true,
  })),
  // Bilgi tavanı: rakiplerin gerçek ellerini bilen bot ne kadar kazanır?
  oracle: () => [
    { name: 'normal (50)', tester: bot(traitsAll(50)), others: avgBot },
    { name: 'hileli: gerçek elleri biliyor (50)', tester: { ...bot(traitsAll(50)), oracle: true }, others: avgBot },
  ],
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
      'koz %': round((100 * kozHands.length) / Math.max(1, decl), 1),
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
    const { scores, handResults } = runGameFull({ seed: job.seed, seats, simsScale: cond.simsScale ?? 1 });
    const msg = { ci: job.ci, seed: job.seed, rot: job.rot, score: scores[job.rot] };
    if (cond.detail) msg.hands = handResults.map((r) => [r.handNo, r.declarer, r.contract.type, r.deltas]);
    process.send(msg);
  });
} else if (process.argv[1] === SELF) {
  main();
}
