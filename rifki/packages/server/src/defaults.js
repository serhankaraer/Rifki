// Üretim bağımlılıkları: gerçek zamanlayıcı ve kriptografik rastgelelik.
import { randomBytes, randomInt } from 'node:crypto';

export const realScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

export const realRandom = {
  hex: (bytes) => randomBytes(bytes).toString('hex'),
  int: (n) => randomInt(n),
};
