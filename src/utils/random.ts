import type { RandomPort } from '../effects/EffectContext';

export type RandomSource = Pick<RandomPort, 'int' | 'pick'> & {
  float?(): number;
};

export const defaultRandomSource: RandomSource = {
  int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  },
  float() {
    return Math.random();
  },
};

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function chance(probability: number): boolean {
  return Math.random() < probability;
}

export function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function randomFloat(random: RandomSource = defaultRandomSource): number {
  return random.float?.() ?? random.int(0, 0x7fffffff) / 0x7fffffff;
}

export function randomChance(probability: number, random: RandomSource = defaultRandomSource): boolean {
  return randomFloat(random) < probability;
}

export function randomShuffle<T>(arr: T[], random: RandomSource = defaultRandomSource): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random.int(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function randomWeightedPick<T>(items: T[], weights: number[], random: RandomSource = defaultRandomSource): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let r = randomFloat(random) * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function createSeededRandom(seed: number | string): RandomSource & RandomPort {
  let state = normalizeSeed(seed);
  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(items: T[]): T {
      return items[Math.floor(next() * items.length)];
    },
    float() {
      return next();
    },
  };
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
