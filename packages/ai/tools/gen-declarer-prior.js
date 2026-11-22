// İlan eden oyuncunun seçimi, elini ele verir (ör. "Kız almaz seçti, demek ki az kızı var").
// Bu araç, rastgele ellerde botun kendi değerlendiricisiyle sözleşme seçtiğinde ilan edenin elinin ortalama bileşimini
// çıkarır ve src/declarer-prior.json dosyasına kart sınıfı başına olabilirlik oranları yazar.
// Kullanım: node tools/gen-declarer-prior.js [el_sayısı] [simülasyon]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDeck, shuffle, createRng, SUITS, PENALTY_TYPES, KOZ, suitOf, rankSymbol } from '@rifki/engine';
import { rollout } from '../src/sim.js';
import { cardClass } from '../src/belief.js';

const N = Number(process.argv[2] ?? 4000);
const SIMS = Number(process.argv[3] ?? 24);
const rng = createRng('declarer-prior-v1');
const deck = makeDeck();

function value(mine, contract) {
  let sum = 0;
  for (let s = 0; s < SIMS; s++) {
    const rest = shuffle(deck.filter((c) => !mine.includes(c)), rng);
    const d = rollout(contract, [mine.slice(), rest.slice(0, 13), rest.slice(13, 26), rest.slice(26, 39)], [], 0, 1, false, false);
    sum += d[0] - (d[0] + d[1] + d[2] + d[3]) / 4;
  }
  return sum / SIMS;
}

const types = [KOZ, ...PENALTY_TYPES];
const count = Object.fromEntries(types.map((t) => [t, 0]));
const acc = Object.fromEntries(types.map((t) => [t, new Array(12).fill(0)]));
for (let i = 0; i < N; i++) {
  const mine = shuffle(deck, rng).slice(0, 13);
  let best = null;
  for (const s of SUITS) {
    const v = value(mine, { type: KOZ, trump: s });
    if (!best || v > best.v) best = { v, type: KOZ, trump: s };
  }
  for (const t of PENALTY_TYPES) {
    const v = value(mine, { type: t, trump: null });
    if (v > best.v) best = { v, type: t, trump: null };
  }
  const special = best.type === KOZ ? best.trump : 'H';
  count[best.type]++;
  for (const c of mine) acc[best.type][cardClass(c, special)]++;
  if ((i + 1) % 500 === 0) console.log(`${i + 1}/${N}`, JSON.stringify(count));
}
// Rastgele elde sınıf başına beklenen kart sayısı: grup büyüklüğü (özel renkte 1 renk, diğerinde 3 renk) * 13/52
const GROUP = [1, 1, 1, 1, 3, 6];
const out = {};
for (const t of types) {
  out[t] = acc[t].map((a, k) => {
    const expected = (GROUP[k % 6] * (k < 6 ? 1 : 3)) / 4;
    return count[t] > 0 ? Math.round((a / count[t] / expected) * 100) / 100 : 1;
  });
}
fs.writeFileSync(fileURLToPath(new URL('../src/declarer-prior.json', import.meta.url)), JSON.stringify({ classes: 'özel renk A,K,Q,J,10-8,7-2 | diğer renkler A,K,Q,J,10-8,7-2', counts: count, ratios: out }, null, 1));
console.log(JSON.stringify({ count, out }, null, 1));
