// Oyun kaydından (log .txt dosyasının sonundaki makine okunur JSON) oyunu yeniden oynatır ve botların kararlarını denetler.
//   node tools/replay-log.mjs <kayit.txt> [--sims 1] [--explain EL:TUR:KOLTUK]   (TUR: 0 = sözleşme seçimi, 1..13 = tur)
// 1) Motor, kayıttaki tohumla aynı dağıtımları üretiyor mu? (bütünlük)
// 2) Her bot kararında aynı sunucu akışıyla (act + düşünme gecikmesi çekimi) bot kodu aynı hamleyi yapıyor mu? (birebir yeniden üretim)
//    Evet ise kayıt bot koduyla tutarlıdır; kural dışı hamle yoktur. Hayır ise ilk sapma ve nedeni raporlanır.
// --explain: o kararda botun adaylarının puan sıralamasını ve görüş (el, yasal kartlar) bilgisini basar.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGame, applyCommand, viewFor, RuleError } from '@rifki/engine';
import { createBot } from '../src/bot.js';

export const LOG_JSON_BEGIN = '=== MAKİNE OKUNUR VERİ (JSON; silmeyin) ===';
export const LOG_JSON_END = '=== SON ===';

/** Log metninden makine okunur veriyi çıkarır. */
export function parseLogText(text) {
  const lines = text.split('\n');
  const b = lines.findIndex((l) => l.trim() === LOG_JSON_BEGIN);
  if (b < 0 || !lines[b + 1]) throw new Error('Kayıtta makine okunur JSON bloğu yok (eski sürümden bir kayıt olabilir).');
  return JSON.parse(lines[b + 1]);
}

class Stop extends Error {}
const sameCmd = (a, b) => a.type === b.type && a.card === b.card && a.contract === b.contract && (a.trump ?? null) === (b.trump ?? null);

/**
 * data: parseLogText çıktısı. Döner: { integrity: [...], players: [{seat,name,decisions,matches}], mismatches: [...], explained: [...] }
 * explain: { hand, trick, seat } | null
 */
export function replayLog(data, { simsScale = 1, explain = null } = {}) {
  if (!data.seed) throw new Error('Kayıtta oyun tohumu yok: oyun yeniden oynatılamaz.');
  const bots = data.players.map((p) => (p.kind === 'bot' && p.traits
    ? createBot({ profile: { id: p.botId, name: p.name, traits: p.traits, thinkSpeed: 50 }, seed: data.seed, simsScale }) : null));
  const stats = data.players.map((p) => ({ seat: p.seat, name: p.name, kind: p.kind, archetype: p.archetypeName, decisions: 0, matches: 0 }));
  const integrity = []; const mismatches = []; const explained = [];
  let { state } = createGame({ seed: data.seed });
  let diverged = false;

  const decide = (rec, trickNo, expected) => {
    const seat = expected.seat;
    const view = viewFor(state, seat);
    const bot = bots[seat];
    if (bot && !diverged) {
      let trace = null;
      const want = explain && explain.hand === rec.handNo && explain.trick === trickNo && explain.seat === seat;
      const cmd = bot.act(view, want ? { trace: (x) => { trace = x; } } : {});
      const single = state.phase === 'PLAYING' && view.legalCards?.length === 1;
      if (!single) bot.thinkDelayMs(); // sunucu da her (tek kartlık olmayan) bot hamlesinde bir kez çeker
      stats[seat].decisions += 1;
      if (sameCmd(cmd, expected)) stats[seat].matches += 1;
      else mismatches.push({ hand: rec.handNo, trick: trickNo, seat, name: data.players[seat].name, logged: expected.card ?? `${expected.contract}${expected.trump ?? ''}`, replayed: cmd.card ?? `${cmd.contract}${cmd.trump ?? ''}` });
      if (want) explained.push({ hand: rec.handNo, trick: trickNo, seat, logged: expected.card ?? expected.contract, myHand: view.myHand, legal: view.legalCards ?? null, trace });
      if (mismatches.length > 0) diverged = true; // rng akışı kaydı: ilk sapmadan sonrası güvenilir değil
    }
    try {
      state = applyCommand(state, expected).state;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      // kayıttaki hamleyi motor reddetti: kayıt kurallara aykırı bir hamle içeriyor (ya da bozuk)
      integrity.push(`El ${rec.handNo}, ${trickNo === 0 ? 'sözleşme seçimi' : `tur ${trickNo}`}, koltuk ${seat} (${data.players[seat].name}): motor hamleyi reddetti (${e.code}) — ${expected.card ?? expected.contract}`);
      throw new Stop();
    }
  };

  try {
  for (const rec of data.hands) {
    if (state.phase === 'HAND_SCORED') state = applyCommand(state, { type: 'NEXT_HAND' }).state;
    if (state.phase === 'GAME_OVER') { integrity.push(`El ${rec.handNo}: oyun kayıttan önce bitti`); break; }
    const firstDeal = rec.redeals?.[0]?.deal ?? rec.deal;
    if (JSON.stringify(state.hand.hands) !== JSON.stringify(firstDeal)) integrity.push(`El ${rec.handNo}: dağıtım tohumdan üretilenle uyuşmuyor`);
    for (const rd of rec.redeals ?? []) decide(rec, 0, { type: 'CHOOSE_CONTRACT', seat: rd.declarer, contract: 'RIFKI' });
    if (JSON.stringify(state.hand.hands) !== JSON.stringify(rec.deal)) integrity.push(`El ${rec.handNo}: son dağıtım uyuşmuyor`);
    decide(rec, 0, { type: 'CHOOSE_CONTRACT', seat: rec.declarer, contract: rec.contract.type, trump: rec.contract.trump ?? undefined });
    rec.tricks.forEach((tr, i) => { for (const p of tr.plays) decide(rec, i + 1, { type: 'PLAY_CARD', seat: p.seat, card: p.card }); });
  }
  } catch (e) { if (!(e instanceof Stop)) throw e; }
  return { integrity, players: stats, mismatches, explained, diverged };
}

function main() {
  const [, , file, ...rest] = process.argv;
  if (!file) { console.error('Kullanım: node tools/replay-log.mjs <kayit.txt> [--sims 1] [--explain EL:TUR:KOLTUK]'); process.exit(2); }
  const arg = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
  const simsScale = Number(arg('--sims') ?? 1);
  const ex = arg('--explain');
  const explain = ex ? (([hand, trick, seat]) => ({ hand, trick, seat }))(ex.split(':').map(Number)) : null;
  const data = parseLogText(fs.readFileSync(file, 'utf8'));
  const r = replayLog(data, { simsScale, explain });
  console.log(`Tohum: ${data.seed}  Oda: ${data.code}  El sayısı: ${data.hands.length}`);
  console.log(r.integrity.length ? `BÜTÜNLÜK SORUNU:\n  ${r.integrity.join('\n  ')}` : 'Bütünlük: dağıtımlar tohumdan üretilenle birebir aynı.');
  console.table(r.players.filter((p) => p.kind === 'bot').map((p) => ({ koltuk: p.seat, bot: p.name, arketip: p.archetype, karar: p.decisions, 'aynı hamle': p.matches })));
  if (r.mismatches.length) {
    console.log(`İlk sapma (sonrası güvenilir değil): ${JSON.stringify(r.mismatches[0])}`);
    console.log('Yorum: birebir yeniden üretim tutmadıysa kayıt farklı bir bot kodu/ayarıyla (ör. simsScale, farklı sürüm) ya da bot devri / süre aşımı hamleleriyle oynanmış olabilir.');
  } else console.log('Tüm bot kararları kayıttakiyle birebir aynı: kayıt bot koduyla tutarlı.');
  for (const e of r.explained) console.log('\nAçıklama:', JSON.stringify(e, null, 1));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
