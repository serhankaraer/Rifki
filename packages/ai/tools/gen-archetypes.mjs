// docs/bot-arketipleri.md -> packages/ai/src/archetypes.js
// Kullanım: node tools/gen-archetypes.mjs   (doküman değişirse yeniden üretin)
import fs from 'node:fs';

const SRC = new URL('../../../docs/bot-arketipleri.md', import.meta.url);
const OUT = new URL('../src/archetypes.js', import.meta.url);
// Dokümandaki özellik adı -> koddaki anahtar (doküman sırası)
const KEYS = [
  ['El Değerlendirme', 'handEval'], ['Koz İştahı', 'kozAppetite'], ['Ceza Kaçınma', 'penaltyAvoid'], ['Kart Hafızası & Çıkarım', 'memory'],
  ['İleri Hesap', 'lookahead'], ['Baskı & Provokasyon', 'aggression'], ['Skor Farkındalığı', 'scoreAwareness'], ['Tutarlılık', 'consistency'],
];
const SLUG = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const slug = (s) => s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => SLUG[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const md = fs.readFileSync(SRC, 'utf8');
const blocks = md.split(/\n#### \d+\. /).slice(1);
const list = blocks.map((b, i) => {
  const name = b.split('\n')[0].trim();
  const lv = b.match(/Genel Seviye:\*\* \*\*(.+?)\*\* \*\(Hedef Ort: `(\d+) – (\d+)`/);
  const summary = b.match(/Kimlik Özeti:\*\* (.+)/)[1].trim();
  const ranges = {};
  for (const [label, key] of KEYS) {
    const m = b.match(new RegExp(`\\*\\*${label.replace('&', '\\&')}:\\*\\* \`(\\d+) – (\\d+)\``));
    if (!m) throw new Error(`${name}: ${label} bulunamadı`);
    ranges[key] = [Number(m[1]), Number(m[2])];
  }
  return { no: i + 1, id: slug(name), name, docLevel: lv[1], target: [Number(lv[2]), Number(lv[3])], summary, ranges };
});
if (list.length !== 21) throw new Error(`21 arketip beklenirdi, ${list.length} bulundu`);

const body = list.map((a) => `  {
    no: ${a.no}, id: '${a.id}', name: ${JSON.stringify(a.name)}, docLevel: ${JSON.stringify(a.docLevel)}, target: [${a.target.join(', ')}],
    summary: ${JSON.stringify(a.summary)},
    ranges: { ${KEYS.map(([, k]) => `${k}: [${a.ranges[k].join(', ')}]`).join(', ')} },
  },`).join('\n');

fs.writeFileSync(OUT, `// OTOMATİK ÜRETİLDİ: docs/bot-arketipleri.md -> node tools/gen-archetypes.mjs (elle düzenlemeyin)
// 21 bot arketipi. ranges: özellik başına [min, max]; target: dokümandaki hedef genel ortalama (düz ortalama) aralığı;
// docLevel: dokümandaki genel seviye (bilgi amaçlı; oyundaki seviye özellik etki parametresinden hesaplanır: traits.js).
export const ARCHETYPES = [
${body}
];
`);
console.log(`${list.length} arketip yazıldı`);
