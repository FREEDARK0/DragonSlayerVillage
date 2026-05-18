import { EventPort } from '../effects/EffectContext';
import { GameState } from '../core/GameState';
import { OctagonBoard } from '../core/OctagonBoard';
import { BlockData } from '../models/Block';

export interface SellContext {
  state: GameState;
  board: OctagonBoard;
  sector: number;
  block: BlockData;
  baseReward: number;
  reward: number;
  messages: string[];
  events: EventPort;
}

export interface SellEffectContributor {
  id: string;
  modifySellReward?(ctx: SellContext): number | void;
  onBeforeSell?(ctx: SellContext): void;
  onAfterSell?(ctx: SellContext): void;
}

const contributors = new Map<string, SellEffectContributor>();

export function registerSellEffectContributor(contributor: SellEffectContributor): void {
  contributors.set(contributor.id, contributor);
}

export function unregisterSellEffectContributor(id: string): void {
  contributors.delete(id);
}

export function getSellEffectContributors(): SellEffectContributor[] {
  return [...contributors.values()];
}

export function resolveSellReward(ctx: SellContext): void {
  for (const contributor of getSellEffectContributors()) {
    const nextReward = contributor.modifySellReward?.(ctx);
    if (typeof nextReward === 'number' && Number.isFinite(nextReward)) {
      ctx.reward = Math.max(0, Math.floor(nextReward));
    }
  }
}

export function runBeforeSell(ctx: SellContext): void {
  for (const contributor of getSellEffectContributors()) {
    contributor.onBeforeSell?.(ctx);
  }
}

export function runAfterSell(ctx: SellContext): void {
  for (const contributor of getSellEffectContributors()) {
    contributor.onAfterSell?.(ctx);
  }
}
