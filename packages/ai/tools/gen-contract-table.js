// Sözleşme değer tablosu üretici. Kullanım: node tools/gen-contract-table.js [el_sayısı] [simülasyon]
// Rastgele eller için her sözleşmenin (en iyi koz rengi + 6 ceza türü) ilan edene beklenen "alana göre avantajını" hesaplar.
// Çıktı: src/contract-table.json — satır: [kozEnİyi, RIFKI, KIZ, ERKEK, KUPA, SON_IKI, EL_ALMAZ].
// Bot, sözleşme seçerken kalan hakların gelecekteki değerini (fırsat maliyeti) bu tablodan hesaplar.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDeck, shuffle, createRng, SUITS, PENALTY_TYPES, KOZ } from '@rifki/engine';
import { rollout } from '../src/sim.js';

const N = Number(process.argv[2] ?? 1200);
const SIMS = Number(process.argv[3] ?? 40);
const rng = createRng('contract-table-v1');
const deck = makeDeck();

function optionValue(hands, me, contract) {
  let sum = 0;
  for (let s = 0; s < SIMS; s++) {
    // Rakip elleri her simülasyonda yeniden karıştırılır
    const rest = shuffle(deck.filter((c) => !hands[me].includes(c)), rng);
    const hs = [hands[me].slice(), rest.slice(0, 13), rest.slice(13, 26), rest.slice(26, 39)];
    const d = rollout(contract, hs, [], me, 1, false, false);
    sum += d[me] - (d[0] + d[1] + d[2] + d[3]) / 4;
  }
  return sum / SIMS;
}

const rows = [];
for (let i = 0; i < N; i++) {
  const mine = shuffle(deck, rng).slice(0, 13);
  const hands = [mine, [], [], []];
  const koz = Math.max(...SUITS.map((s) => optionValue(hands, 0, { type: KOZ, trump: s })));
  const row = [koz, ...PENALTY_TYPES.map((t) => optionValue(hands, 0, { type: t, trump: null }))];
  rows.push(row.map((v) => Math.round(v * 10) / 10));
  if ((i + 1) % 100 === 0) console.log(`${i + 1}/${N}`);
}
const out = fileURLToPath(new URL('../src/contract-table.json', import.meta.url));
fs.writeFileSync(out, JSON.stringify({ order: ['KOZ', ...PENALTY_TYPES], sims: SIMS, rows }));
const mean = (j) => rows.reduce((a, r) => a + r[j], 0) / rows.length;
console.log('ortalamalar:', ['KOZ', ...PENALTY_TYPES].map((n, j) => `${n}=${mean(j).toFixed(0)}`).join(' '));
