import { DragonState } from '../models/Dragon';
import { Grid } from '../models/Grid';
import { HeroState } from '../models/Hero';
import { GridPosition } from '../utils/GridPosition';
import { DragonPersonalityType } from '../config/dragonTypes';
import { DragonPersonality, TurnContext } from './personalities/DragonPersonality';
import { ArrogantPersonality } from './personalities/Arrogant';
import { GluttonousPersonality } from './personalities/Gluttonous';
import { DestructivePersonality } from './personalities/Destructive';
import { DragonActionType, DragonAction } from './actions/DragonAction';
import { LineBreath } from './actions/LineBreath';
import { DiagonalBreath } from './actions/DiagonalBreath';
import { AreaBreath } from './actions/AreaBreath';
import { SummonImp } from './actions/SummonImp';
import { createImpBlock } from '../models/Block';
import { heroTakeDamage } from '../models/Hero';
import { BlockType } from '../config/blockTypes';
import { EventBus } from '../core/EventBus';

export interface DragonDecision {
  dragon: DragonState;
  actionType: DragonActionType;
  targetPositions: GridPosition[];
  announcedPositions: GridPosition[] | null;
  description: string;
}

export class DragonAI {
  private personalities: Map<string, DragonPersonality> = new Map();
  private actions: Map<DragonActionType, DragonAction> = new Map();

  constructor() {
    this.personalities.set(DragonPersonalityType.ARROGANT, new ArrogantPersonality());
    this.personalities.set(DragonPersonalityType.GLUTTONOUS, new GluttonousPersonality());
    this.personalities.set(DragonPersonalityType.DESTRUCTIVE, new DestructivePersonality());

    this.actions.set(DragonActionType.LINE_BREATH, new LineBreath());
    this.actions.set(DragonActionType.DIAGONAL_BREATH, new DiagonalBreath());
    this.actions.set(DragonActionType.AREA_BREATH, new AreaBreath());
    this.actions.set(DragonActionType.SUMMON_IMP, new SummonImp());
  }

  /**
   * 为所有存活龙计算决策并执行
   */
  executeTurn(
    dragons: DragonState[],
    grid: Grid,
    hero: HeroState,
    heroPos: GridPosition,
  ): DragonDecision[] {
    const ctx: TurnContext = { grid, hero, heroPos };
    const decisions: DragonDecision[] = [];

    for (const dragon of dragons) {
      if (!dragon.isAlive) continue;

      const personality = this.personalities.get(dragon.personality);
      if (!personality) continue;

      // Select action type
      const actionType = personality.selectActionType(dragon, ctx);

      // Select target
      const anchor = personality.selectTarget(dragon, ctx, actionType);

      // Get affected positions
      const action = this.actions.get(actionType);
      if (!action) continue;

      const targetPositions = action.getAffectedPositions(anchor, grid.size);

      const decision: DragonDecision = {
        dragon,
        actionType,
        targetPositions,
        announcedPositions: personality.shouldAnnounce() ? targetPositions : null,
        description: personality.describe(dragon, actionType, targetPositions),
      };

      decisions.push(decision);
      this.executeDecision(decision, grid, hero, heroPos);
    }

    return decisions;
  }

  private executeDecision(
    decision: DragonDecision,
    grid: Grid,
    hero: HeroState,
    heroPos: GridPosition,
  ): void {
    const action = this.actions.get(decision.actionType);
    if (!action) return;

    switch (decision.actionType) {
      case DragonActionType.SUMMON_IMP: {
        // Summon imp on the anchor position (one empty cell)
        const anchor = decision.targetPositions[0];
        if (anchor && grid.isInBounds(anchor) && grid.isEmpty(anchor)) {
          const imp = createImpBlock();
          grid.setBlock(anchor, imp);
          EventBus.emit('impSummoned', { position: anchor });
        }
        break;
      }

      case DragonActionType.LINE_BREATH:
      case DragonActionType.DIAGONAL_BREATH:
      case DragonActionType.AREA_BREATH: {
        // Deal damage to all blocks in affected positions
        for (const pos of decision.targetPositions) {
          if (!grid.isInBounds(pos)) continue;

          const block = grid.getBlock(pos);
          if (!block || block.type === BlockType.EMPTY) continue;

          const damage = action.calculateDamage(decision.dragon.attackDamage, block.shielded);

          if (pos.row === heroPos.row && pos.col === heroPos.col) {
            heroTakeDamage(hero, damage);
            decision.dragon.damageDealt += damage;
            EventBus.emit('heroDamaged', { damage, remainingPower: hero.power });
          } else {
            block.value -= damage;
            decision.dragon.damageDealt += damage;
            if (block.value <= 0) {
              grid.removeBlock(pos);
              EventBus.emit('blockDestroyed', { position: pos, blockType: block.type });
            }
          }

          // Gluttonous dragon gains satiation from eating food
          if (block.type === BlockType.FOOD) {
            decision.dragon.satiation += 20;
          }
        }

        // Gluttonous gets some satiation per attack
        if (decision.dragon.personality === DragonPersonalityType.GLUTTONOUS) {
          decision.dragon.satiation = Math.min(100, decision.dragon.satiation + 5);
        }

        EventBus.emit('dragonAttacked', {
          dragonId: decision.dragon.id,
          positions: decision.targetPositions,
          actionType: decision.actionType,
        });
        break;
      }
    }
  }
}
