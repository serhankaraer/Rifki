// Bot oyuncu: yalnızca viewFor çıktısını görür, motor komutu döndürür.
import { createRng } from '@rifki/engine';
import { createMemory } from './belief.js';
import { decideCard, decideContract } from './decide.js';
import { thinkDelayMs } from './traits.js';

/**
 * profile: createBotProfiles çıktısı ({ id, name, traits }). simsScale: simülasyon sayısı çarpanı (testlerde < 1).
 */
export function createBot({ profile, seed, simsScale = 1 }) {
  const rng = createRng(`${seed}:bot:${profile.id}`);
  const memory = createMemory();
  return {
    profile,
    /** Sırası gelmişse komut döner (CHOOSE_CONTRACT | PLAY_CARD), değilse null. Gecikme sunucu tarafında uygulanır. */
    act(view) {
      if (view.turn !== view.seat) return null;
      if (view.phase === 'CONTRACT_SELECT') {
        const c = decideContract(view, profile, memory, rng, { simsScale });
        return { type: 'CHOOSE_CONTRACT', seat: view.seat, contract: c.contract, trump: c.trump ?? undefined };
      }
      if (view.phase === 'PLAYING') {
        return { type: 'PLAY_CARD', seat: view.seat, card: decideCard(view, profile, memory, rng, { simsScale }) };
      }
      return null;
    },
    /** Bu hamle için yapay düşünme süresi (ms). */
    thinkDelayMs() {
      return thinkDelayMs(profile.traits.thinkSpeed, rng);
    },
  };
}
