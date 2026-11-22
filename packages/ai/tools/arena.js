// Bot arena: botları başsız (headless) olarak oynatıp başarılarını ölçer. Kullanım: bkz. experiments.js
import { createGame, applyCommand, viewFor, createRng, STRUCTURE } from '@rifki/engine';
import { createBot } from '../src/bot.js';
import { TRAIT_KEYS, TRAIT_FLOOR } from '../src/traits.js';

export const traitsAll = (v, over = {}) => ({ ...Object.fromEntries(TRAIT_KEYS.map((k) => [k, v])), ...over });

/** Oyuncu tanımı: { kind: 'bot', traits } | { kind: 'random' } */
function makePlayer(spec, seed, seat, opts) {
  if (spec.kind === 'random') {
    const rng = createRng(`${seed}:random:${seat}`);
    return {
      act(view) {
        if (view.turn !== view.seat) return null;
        if (view.phase === 'CONTRACT_SELECT') {
          const opts2 = view.selectable.penalties.map((c) => ({ contract: c }));
          if (view.selectable.koz) for (const s of ['C', 'D', 'H', 'S']) opts2.push({ contract: 'KOZ', trump: s });
          const o = opts2[Math.floor(rng() * opts2.length)];
          return { type: 'CHOOSE_CONTRACT', seat: view.seat, contract: o.contract, trump: o.trump };
        }
        return { type: 'PLAY_CARD', seat: view.seat, card: view.legalCards[Math.floor(rng() * view.legalCards.length)] };
      },
    };
  }
  const b = createBot({ profile: { id: `s${seat}`, name: `s${seat}`, traits: spec.traits }, seed: `${seed}:${seat}`, simsScale: opts.simsScale ?? 1, floor: opts.floor ?? TRAIT_FLOOR });
  if (!spec.oracle) return b;
  // Hileli ölçüm botu: rakiplerin gerçek ellerini bilir (bilginin değer tavanını ölçmek için)
  return { act: (view, state) => b.act(view, { sampleWorld: (v) => state.hand.hands.map((h) => h.slice()) }) };
}

/** Tam bir oyun (20 el) oynatır; koltuk başına son puanları döner. */
export function runGame(opts) {
  return runGameFull(opts).scores;
}

/** Tam bir oyun; { scores, handResults } döner (handResults: motorun el sonuç listesi). */
export function runGameFull({ seed, seats, simsScale = 1, floor = TRAIT_FLOOR }) {
  const players = seats.map((s, i) => makePlayer(s, seed, i, { simsScale, floor }));
  let { state } = createGame({ seed });
  let guard = 0;
  while (state.phase !== 'GAME_OVER') {
    if (++guard > 5000) throw new Error('arena: takıldı');
    if (state.phase === 'HAND_SCORED') { state = applyCommand(state, { type: 'NEXT_HAND' }).state; continue; }
    const seat = state.turn;
    const cmd = players[seat].act(viewFor(state, seat), state);
    state = applyCommand(state, cmd).state;
  }
  return { scores: state.scores.slice(), handResults: state.handResults };
}

export const GAMES_PER_GAME = STRUCTURE.hands;
