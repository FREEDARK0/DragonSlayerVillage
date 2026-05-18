import { GameState } from '../core/GameState';
import { OctagonBoard } from '../core/OctagonBoard';
import { EventBus } from '../core/EventBus';
import { BlockData, createBlock, createDragonFire, createPowerStone, createVoodooDoll } from '../models/Block';
import { BlockType } from '../config/blockTypes';
import type { CombatSimulationPolicy } from '../systems/CombatSimulationTypes';
import { isBoardSectorNight, isWorldSectorNight } from '../utils/SectorUtils';

export interface EventPort {
  emit(event: string, payload?: unknown): void;
}

export interface RandomPort {
  int(min: number, max: number): number;
  pick<T>(items: T[]): T;
}

export interface BlockFactoryPort {
  createBlock(type: BlockType, hp?: number, attack?: number): BlockData;
  createPowerStone(hp?: number): BlockData;
  createDragonFire(hp?: number): BlockData;
  createVoodooDoll(target: { id: string; color: number }): BlockData;
}

export interface CombatStats {
  missileDamage: number;
}

export interface EffectContext {
  state: GameState;
  board: OctagonBoard;
  events: EventPort;
  random: RandomPort;
  blockFactory: BlockFactoryPort;
  combatStats: CombatStats;
  simulationPolicy?: CombatSimulationPolicy;
  isNight(sector: number): boolean;
  isWorldNight(edgeIndex: number): boolean;
  addMessage(message: string): void;
  applyVillageHpDelta(delta: number): void;
  applyVillageGoldDelta(delta: number): void;
}

export type IncomeEffectContext = Pick<EffectContext, 'board' | 'isNight'>;

export interface EffectContextOptions {
  events?: EventPort;
  random?: RandomPort;
  blockFactory?: BlockFactoryPort;
  combatStats?: CombatStats;
  simulationPolicy?: CombatSimulationPolicy;
}

export function createEffectContext(state: GameState, options: EffectContextOptions = {}): EffectContext {
  const random = options.random ?? {
    int(min: number, max: number) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    pick<T>(items: T[]): T {
      return items[Math.floor(Math.random() * items.length)];
    },
  };
  return {
    state,
    board: state.board,
    events: options.events ?? EventBus,
    random,
    combatStats: options.combatStats ?? { missileDamage: 5 },
    blockFactory: options.blockFactory ?? {
      createBlock,
      createPowerStone(hp?: number) {
        return createPowerStone(hp ?? random.int(1, 20));
      },
      createDragonFire,
      createVoodooDoll,
    },
    simulationPolicy: options.simulationPolicy,
    isNight(sector: number) {
      return isBoardSectorNight(sector, state.rotationAngle, state.nightStart, state.nightLength);
    },
    isWorldNight(edgeIndex: number) {
      return isWorldSectorNight(edgeIndex, state.nightStart, state.nightLength);
    },
    addMessage(message: string) {
      state.addMessage(message);
    },
    applyVillageHpDelta(delta: number) {
      state.applyVillageHpDelta(delta);
    },
    applyVillageGoldDelta(delta: number) {
      state.applyVillageGoldDelta(delta, options.random);
    },
  };
}
