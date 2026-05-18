import { GameState } from '../core/GameState';
import { ShopSystem, ShopSectionKey, ShopTargetIntent } from '../systems/ShopSystem';
import { RandomSource } from '../utils/random';

export type BotAction =
  | { type: 'rotate'; delta: number }
  | { type: 'buy'; section: ShopSectionKey; index: number; sector: number | null; targetIntent?: ShopTargetIntent }
  | { type: 'refresh' }
  | { type: 'lock'; index: number }
  | { type: 'choose_relic'; relicId: string }
  | { type: 'end_turn' };

export interface BotContext {
  state: GameState;
  shop: ShopSystem;
  random: RandomSource;
}

export interface BotPolicy {
  readonly id: string;
  decide(context: BotContext): BotAction[];
}

export interface EvaluationFunction {
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly params?: Record<string, unknown>;
  evaluate(context: BotContext): number;
}
