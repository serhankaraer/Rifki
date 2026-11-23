// Oyun kaydı: oyun bitince sunucunun gönderdiği `gameLog` (tüm eller, dağıtımlar, turlar) okunabilir metne çevrilir.
// Saf fonksiyonlar (DOM yok): formatGameLog, logFileName. Ekran: screens.js içindeki logScreen.
import { t } from './i18n.js';
import { SUIT_SYMBOL, parseCard } from './cards.js';

export const LOG_STORAGE_KEY = 'rifki.lastLog';
const TOTAL_HANDS = 20;

const cardText = (c) => { const { rank, suit } = parseCard(c); return `${SUIT_SYMBOL[suit]}${rank}`; };
const handText = (cards) => cards.map(cardText).join(' ');
const signed = (n) => (n > 0 ? `+${n}` : String(n));

export function contractLabel(c) {
  if (!c) return '-';
  if (c.type === 'KOZ') return `${t('contract.KOZ')} ${SUIT_SYMBOL[c.trump]}${c.king ? ` 👑 ${t('game.king')}` : ''}`;
  return t(`contract.${c.type}`);
}

/**
 * data: { names: [4], me, code, savedAt, scores, kingEnd, gameLog }
 * Dönen: düz metin (ekranda, yazdırmada, kopyalamada ve indirmede aynı metin kullanılır).
 */
export function formatGameLog(data) {
  const { names, me, gameLog = [] } = data;
  const nm = (s) => `${names[s]}${s === me ? ` ${t('log.you')}` : ''}`;
  const pad = Math.max(...names.map((n) => n.length)) + 6;
  const L = [];
  L.push(t('log.title'));
  L.push(`${t('log.room')}: ${data.code ?? '-'}   ${t('log.date')}: ${data.savedAt ? new Date(data.savedAt).toLocaleString('tr-TR') : '-'}`);
  L.push(`${t('log.players')}: ${names.map((n, i) => `${i}=${nm(i)}`).join(', ')}`);
  L.push(`${t('log.finalScores')}: ${names.map((n, i) => `${n} ${data.scores?.[i] ?? 0}`).join(' | ')}`);
  if (data.kingEnd) L.push(`👑 ${t('log.kingEnd', { name: names[data.kingEnd.declarer], result: t(data.kingEnd.success ? 'log.kingWon' : 'log.kingLost'), n: data.kingEnd.tricks, played: data.kingEnd.tricksPlayed })}`);
  L.push(t('log.legend'));

  for (const rec of gameLog) {
    L.push('');
    L.push(`══ ${t('log.hand', { n: rec.handNo, total: TOTAL_HANDS })} — ${t('log.declarer')}: ${nm(rec.declarer)} — ${contractLabel(rec.contract)} ══`);
    for (const [i, rd] of (rec.redeals ?? []).entries()) {
      L.push(`${t('log.redeal', { n: i + 1, name: names[rd.declarer] })}`);
      rd.deal.forEach((cards, s) => L.push(`    ${names[s].padEnd(pad)}${handText(cards)}`));
    }
    L.push(`${t('log.deal')}:`);
    rec.deal.forEach((cards, s) => L.push(`  ${names[s].padEnd(pad)}${handText(cards)}`));
    const hands = rec.deal.map((c) => [...c]);
    for (const [ti, tr] of rec.tricks.entries()) {
      const led = tr.plays[0] ? parseCard(tr.plays[0].card).suit : null;
      const parts = tr.plays.map((p, pi) => {
        const suit = parseCard(p.card).suit;
        const hadLed = hands[p.seat].some((c) => parseCard(c).suit === led);
        let note = '';
        if (pi > 0 && suit !== led) note = hadLed ? ` ⚠${t('log.hadSuit')}` : ` (${t('log.noSuit')})`;
        hands[p.seat].splice(hands[p.seat].indexOf(p.card), 1);
        return `${names[p.seat]} ${cardText(p.card)}${note}`;
      });
      L.push(`  ${t('log.trick', { n: ti + 1 })} [${t('log.leads')}: ${names[tr.leader]}]  ${parts.join('  →  ')}  ⇒ ${t('log.takes')}: ${names[tr.winner]}`);
    }
    if (rec.kingEnd) L.push(`  ${t('log.kingCut')}`);
    else if (rec.deltas) {
      L.push(`  ${t('log.result')}: ${names.map((n, i) => `${n} ${signed(rec.deltas[i])}`).join(' | ')}`);
      L.push(`  ${t('log.total')}: ${names.map((n, i) => `${n} ${rec.scoresAfter[i]}`).join(' | ')}`);
    }
  }
  return L.join('\n');
}

export function logFileName(data) {
  const d = data.savedAt ? new Date(data.savedAt) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `rifki-kayit-${data.code ?? 'oda'}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.txt`;
}

const penaltyTest = (type) => {
  if (type === 'KIZ') return (c) => parseCard(c).rank === 'Q';
  if (type === 'ERKEK') return (c) => ['K', 'J'].includes(parseCard(c).rank);
  if (type === 'KUPA') return (c) => parseCard(c).suit === 'H';
  if (type === 'RIFKI') return (c) => c === 'KH';
  return () => false;
};

/**
 * Bir elin ızgara verisi: satır = tur, hücre = o turda her koltuğun kartı.
 * cells[seat] = { card, order, lead, win, noSuit, hadSuit, penalty }  (noSuit: rengi yoktu; hadSuit: rengi vardı ama uymadı)
 */
export function buildHandGrid(rec) {
  const isPen = penaltyTest(rec.contract.type);
  const hands = rec.deal.map((c) => [...c]);
  return rec.tricks.map((tr, i) => {
    const led = tr.plays[0] ? parseCard(tr.plays[0].card).suit : null;
    const cells = {};
    tr.plays.forEach((p, pi) => {
      const suit = parseCard(p.card).suit;
      const hadLed = hands[p.seat].some((c) => parseCard(c).suit === led);
      hands[p.seat].splice(hands[p.seat].indexOf(p.card), 1);
      cells[p.seat] = { card: p.card, order: pi + 1, lead: pi === 0, win: p.seat === tr.winner, noSuit: pi > 0 && suit !== led && !hadLed, hadSuit: pi > 0 && suit !== led && hadLed, penalty: isPen(p.card) };
    });
    return { n: i + 1, leader: tr.leader, winner: tr.winner, cells };
  });
}

export { cardText, handText, contractLabel as contractName };
