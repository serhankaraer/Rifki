// Karar ayrışması: aynı konumda iki özellik değeri farklı kart seçiyor mu? (tarzın davranışa yansıması)
import { createGame, applyCommand, viewFor, createRng } from '@rifki/engine';
import { createBot } from '../src/bot.js';
import { decideCard, TUNING, TUNING_DEFAULTS } from '../src/decide.js';
import { createMemory } from '../src/belief.js';
import { traitsAll } from './arena.js';

const cases = {
  'risk 1 vs 100 (skor 0)': (v) => ({ ...v, scores: [0, 0, 0, 0] }),
  'skor farkındalığı 1 vs 100, rahat önde (+600, el 18)': (v) => ({ ...v, handNo: 18, scores: v.scores.map((_, i) => (i === v.seat ? 600 : -200)) }),
  'skor farkındalığı 1 vs 100, umutsuz geride (−600, el 18)': (v) => ({ ...v, handNo: 18, scores: v.scores.map((_, i) => (i === v.seat ? -600 : 200)) }),
};
const traitPair = { 'risk 1 vs 100 (skor 0)': 'risk' };
const stats = Object.fromEntries(Object.keys(cases).map((k) => [k, { total: 0, diff: 0 }]));
for (let g = 0; g < 4; g++) {
  let { state } = createGame({ seed: `div-${g}` });
  const bots = [0, 1, 2, 3].map((i) => createBot({ profile: { id: `b${i}`, name: 'x', traits: traitsAll(50) }, seed: `div-${g}:${i}`, simsScale: 0.5, floor: 1 }));
  while (state.phase !== 'GAME_OVER') {
    if (state.phase === 'HAND_SCORED') { state = applyCommand(state, { type: 'NEXT_HAND' }).state; continue; }
    const seat = state.turn;
    const view = viewFor(state, seat);
    if (state.phase === 'PLAYING' && view.legalCards.length > 1 && state.handNo >= 6) {
      for (const [name, mk] of Object.entries(cases)) {
        const key = traitPair[name] ?? 'scoreAwareness';
        const fake = mk(view);
        const picks = [1, 100].map((val) => decideCard(fake, { traits: traitsAll(50, { [key]: val, consistency: 100 }) }, createMemory(), createRng(`dv-${stats[name].total}`), { simsScale: 1 }));
        stats[name].total++;
        if (picks[0] !== picks[1]) stats[name].diff++;
      }
    }
    state = applyCommand(state, bots[seat].act(view)).state;
  }
}
for (const [k, s] of Object.entries(stats)) console.log(k.padEnd(62), `${(100 * s.diff / s.total).toFixed(1)}% farklı kart  (n=${s.total})`);
