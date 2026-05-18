import { RandomPort } from '../effects/EffectContext';

type RandomEntry =
  | { kind: 'int'; value: number }
  | { kind: 'pick'; index: number };

export class CombatRandomPlan {
  private entries: RandomEntry[] = [];

  createRecorder(): RandomPort {
    let cursor = 0;
    return {
      int: (min, max) => {
        const existing = this.entries[cursor++];
        if (existing?.kind === 'int') return clamp(existing.value, min, max);
        const value = randomInt(min, max);
        this.entries[cursor - 1] = { kind: 'int', value };
        return value;
      },
      pick: <T>(items: T[]): T => {
        const existing = this.entries[cursor++];
        if (existing?.kind === 'pick') return items[clamp(existing.index, 0, items.length - 1)];
        const index = randomInt(0, items.length - 1);
        this.entries[cursor - 1] = { kind: 'pick', index };
        return items[index];
      },
    };
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
