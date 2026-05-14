import { GameState } from '../core/GameState';
import { OctagonBoard } from '../core/OctagonBoard';
import { EventBus } from '../core/EventBus';

export interface EventPort {
  emit(event: string, payload?: unknown): void;
}

export interface RandomPort {
  int(min: number, max: number): number;
  pick<T>(items: T[]): T;
}

export interface EffectContext {
  state: GameState;
  board: OctagonBoard;
  events: EventPort;
  random: RandomPort;
  isNight(sector: number): boolean;
  addMessage(message: string): void;
}

export type IncomeEffectContext = Pick<EffectContext, 'board' | 'isNight'>;

export function createEffectContext(state: GameState): EffectContext {
  return {
    state,
    board: state.board,
    events: EventBus,
    random: {
      int(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      },
      pick<T>(items: T[]): T {
        return items[Math.floor(Math.random() * items.length)];
      },
    },
    isNight(sector: number) {
      for (let i = 0; i < state.nightLength; i++) {
        if ((state.nightStart + i) % 8 === sector) return true;
      }
      return false;
    },
    addMessage(message: string) {
      state.addMessage(message);
    },
  };
}
