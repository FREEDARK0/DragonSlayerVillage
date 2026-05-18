import { BlockType, ShopItem } from '../config/blockTypes';
import { TurnState } from '../core/GameState';
import { BotAction, BotContext, BotPolicy, EvaluationFunction } from './BotPolicy';

export class RandomMonkeyBot implements BotPolicy {
  readonly id = 'random_monkey';

  decide(ctx: BotContext): BotAction[] {
    if (ctx.state.turnState === TurnState.RELIC_SELECTION) {
      const choice = ctx.random.pick(ctx.state.relics.pendingChoices);
      return choice ? [{ type: 'choose_relic', relicId: choice.id }] : [{ type: 'end_turn' }];
    }

    const actions: BotAction[] = [];
    const rotations = ctx.random.int(0, 2);
    for (let i = 0; i < rotations; i++) actions.push({ type: 'rotate', delta: ctx.random.pick([-45, 45]) });

    const affordable = affordableItems(ctx);
    if (affordable.length > 0) {
      const picked = ctx.random.pick(affordable);
      actions.push({ type: 'buy', ...picked, sector: randomTargetSector(ctx), targetIntent: 'block' });
    }
    actions.push({ type: 'end_turn' });
    return actions;
  }
}

export class GreedyEconomyBot implements BotPolicy {
  readonly id = 'greedy_economy';

  decide(ctx: BotContext): BotAction[] {
    if (ctx.state.turnState === TurnState.RELIC_SELECTION) {
      const choice = ctx.state.relics.pendingChoices[0];
      return choice ? [{ type: 'choose_relic', relicId: choice.id }] : [{ type: 'end_turn' }];
    }

    const preferred = affordableItems(ctx).find(candidate => {
      const item = itemAt(ctx, candidate.section, candidate.index);
      return item?.kind === 'block' && (item.blockType === BlockType.MINE || item.blockType === BlockType.TAVERN);
    });
    const fallbackWall = ctx.state.board.villageHp <= 18
      ? affordableItems(ctx).find(candidate => {
        const item = itemAt(ctx, candidate.section, candidate.index);
        return item?.kind === 'block' && item.blockType === BlockType.WOOD_WALL;
      })
      : undefined;
    const picked = preferred ?? fallbackWall;
    return picked
      ? [{ type: 'buy', ...picked, sector: economySector(ctx), targetIntent: 'block' }, { type: 'end_turn' }]
      : [{ type: 'end_turn' }];
  }
}

export class TurtleBot implements BotPolicy {
  readonly id = 'turtle';

  decide(ctx: BotContext): BotAction[] {
    if (ctx.state.turnState === TurnState.RELIC_SELECTION) {
      const choice = ctx.state.relics.pendingChoices[0];
      return choice ? [{ type: 'choose_relic', relicId: choice.id }] : [{ type: 'end_turn' }];
    }

    const defensive = affordableItems(ctx).find(candidate => {
      const item = itemAt(ctx, candidate.section, candidate.index);
      return item?.kind === 'block' && (item.blockType === BlockType.WOOD_WALL || item.blockType === BlockType.SENSING_WALL);
    });
    const targetSector = highestAttackDragonSector(ctx) ?? ctx.state.board.getEmptySectors()[0] ?? 0;
    return defensive
      ? [{ type: 'buy', ...defensive, sector: targetSector, targetIntent: 'block' }, { type: 'end_turn' }]
      : [{ type: 'end_turn' }];
  }
}

export class SearchBot implements BotPolicy {
  readonly id = 'search';

  constructor(private evaluator: EvaluationFunction) {}

  decide(ctx: BotContext): BotAction[] {
    const affordable = affordableItems(ctx);
    if (affordable.length === 0) return [{ type: 'end_turn' }];
    // First-pass scaffolding: keep evaluator injectable without committing to a scoring formula yet.
    this.evaluator.evaluate(ctx);
    const picked = affordable[0];
    return [{ type: 'buy', ...picked, sector: ctx.state.board.getEmptySectors()[0] ?? 0, targetIntent: 'block' }, { type: 'end_turn' }];
  }
}

function affordableItems(ctx: BotContext): { section: 'base' | 'random' | 'temporary'; index: number }[] {
  const result: { section: 'base' | 'random' | 'temporary'; index: number }[] = [];
  ctx.shop.state.base.forEach((item, index) => {
    if (ctx.shop.effectiveCost(item) <= ctx.state.board.villageGold) result.push({ section: 'base', index });
  });
  ctx.shop.state.random.forEach((slot, index) => {
    if (slot.item && ctx.shop.effectiveCost(slot.item) <= ctx.state.board.villageGold) result.push({ section: 'random', index });
  });
  ctx.shop.state.temporary.forEach((item, index) => {
    if (ctx.shop.effectiveCost(item) <= ctx.state.board.villageGold) result.push({ section: 'temporary', index });
  });
  return result;
}

function itemAt(ctx: BotContext, section: 'base' | 'random' | 'temporary', index: number): ShopItem | null {
  if (section === 'base') return ctx.shop.state.base[index] ?? null;
  if (section === 'random') return ctx.shop.state.random[index]?.item ?? null;
  return ctx.shop.state.temporary[index] ?? null;
}

function randomTargetSector(ctx: BotContext): number {
  return ctx.random.pick([0, 1, 2, 3, 4, 5, 6, 7]);
}

function economySector(ctx: BotContext): number {
  const nightEmpty = ctx.state.board.getEmptySectors().find(sector => ctx.state.isNight(sector));
  return nightEmpty ?? ctx.state.board.getEmptySectors()[0] ?? 0;
}

function highestAttackDragonSector(ctx: BotContext): number | null {
  const dragon = [...ctx.state.aliveDragons].sort((a, b) => b.attack - a.attack)[0];
  if (!dragon) return null;
  return ((dragon.edgeIndex - Math.round(ctx.state.rotationAngle / 45)) % 8 + 8) % 8;
}
