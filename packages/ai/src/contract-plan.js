// Sözleşme planlaması (fırsat maliyeti): her oyuncunun 2 koz + 3 ceza hakkı vardır; her ceza türü oyunda 2 kez kullanılır.
// Eldeki hakkı bu ele harcamak, ileride daha uygun bir ele saklamaktan iyi mi? Gelecekteki hakların beklenen değeri
// rastgele ellerden üretilmiş bir tablodan (tools/gen-contract-table.js) dinamik programlamayla hesaplanır.
import fs from 'node:fs';
import { PENALTY_TYPES } from '@rifki/engine';

const TABLE = JSON.parse(fs.readFileSync(new URL('./contract-table.json', import.meta.url), 'utf8'));
const ROWS = TABLE.rows; // [kozEnİyi, ...PENALTY_TYPES]
const memo = new Map();

/** Kalan koz/ceza hakları ve seçilebilir ceza türleri (PENALTY_TYPES indeksleri) için gelecekteki beklenen toplam avantaj. */
export function futureValue(kozLeft, cezaLeft, types) {
  if (kozLeft <= 0 && cezaLeft <= 0) return 0;
  const key = `${kozLeft}|${cezaLeft}|${types.join(',')}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const vK = kozLeft > 0 ? futureValue(kozLeft - 1, cezaLeft, types) : 0;
  const vC = cezaLeft > 0 ? futureValue(kozLeft, cezaLeft - 1, types) : 0;
  let sum = 0;
  for (const r of ROWS) {
    let best = -Infinity;
    if (kozLeft > 0) best = r[0] + vK;
    if (cezaLeft > 0) for (const j of types) best = Math.max(best, r[1 + j] + vC);
    sum += best === -Infinity ? 0 : best;
  }
  const v = sum / ROWS.length;
  memo.set(key, v);
  return v;
}

/**
 * Bir seçenek seçildikten sonra kalan hakların gelecek değeri. view.ledger: { koz, ceza, typeUses }.
 * option: { contract, trump } (contract: 'KOZ' ya da ceza türü).
 */
export function continuationValue(view, option) {
  const me = view.seat;
  let kozLeft = 2 - view.ledger.koz[me];
  let cezaLeft = 3 - view.ledger.ceza[me];
  const uses = { ...view.ledger.typeUses };
  if (option.contract === 'KOZ') kozLeft -= 1;
  else { cezaLeft -= 1; uses[option.contract] += 1; }
  const types = [];
  PENALTY_TYPES.forEach((t, j) => { if (uses[t] < 2) types.push(j); });
  return futureValue(kozLeft, cezaLeft, types);
}
