import { GridPosition } from '../utils/GridPosition';
import { Grid } from '../models/Grid';
import { DragonActionType, DragonAction } from './actions/DragonAction';
import { DragonState } from '../models/Dragon';
import { TurnContext } from './personalities/DragonPersonality';
import { BlockType } from '../config/blockTypes';
import { LineBreath } from './actions/LineBreath';
import { DiagonalBreath } from './actions/DiagonalBreath';
import { AreaBreath } from './actions/AreaBreath';
import { SummonImp } from './actions/SummonImp';

function getAction(actionType: DragonActionType): DragonAction {
  switch (actionType) {
    case DragonActionType.LINE_BREATH: return new LineBreath();
    case DragonActionType.DIAGONAL_BREATH: return new DiagonalBreath();
    case DragonActionType.AREA_BREATH: return new AreaBreath();
    case DragonActionType.SUMMON_IMP: return new SummonImp();
  }
}

export class AIScorer {
  /**
   * 对每个可能的锚点位置评分，选择得分最高的
   */
  static selectBestTarget(
    ctx: TurnContext,
    actionType: DragonActionType,
    dragon: DragonState,
    personality: string,
  ): GridPosition {
    const action = getAction(actionType);
    const anchors = action.getValidAnchors(ctx.grid);

    if (anchors.length === 0) return new GridPosition(0, 0);

    let bestAnchor = anchors[0];
    let bestScore = -Infinity;

    for (const anchor of anchors) {
      const positions = action.getAffectedPositions(anchor, ctx.grid.size);
      const score = AIScorer.scoreTargets(positions, ctx, dragon, personality);
      if (score > bestScore) {
        bestScore = score;
        bestAnchor = anchor;
      }
    }

    return bestAnchor;
  }

  private static scoreTargets(
    positions: GridPosition[],
    ctx: TurnContext,
    dragon: DragonState,
    personality: string,
  ): number {
    let score = 0;

    for (const pos of positions) {
      if (!ctx.grid.isInBounds(pos)) continue;

      const block = ctx.grid.getBlock(pos);

      if (!block) {
        score += 1; // Empty cells have low value
        continue;
      }

      // Shielded targets get reduced score
      const weight = block.shielded ? 0.3 : 1.0;

      // Check if this position is where the player currently is
      if (pos.row === ctx.heroPos.row && pos.col === ctx.heroPos.col) {
        score += 25 * weight;
      }

      switch (block.type) {
        case BlockType.VILLAGE:
          score += 8 * weight;
          break;
        case BlockType.FOOD:
          score += 5 * weight;
          // Gluttonous dragon prioritizes food
          if (personality === 'gluttonous') score += 15 * weight;
          break;
        case BlockType.SWORD:
          score += 6 * weight;
          break;
        case BlockType.IMP:
          score += 2 * weight;
          break;
        case BlockType.WALL:
          score += 3 * weight;
          break;
      }
    }

    // Destructive dragons get bonus for targeting player position
    if (personality === 'destructive') {
      const hasHero = positions.some(p => p.row === ctx.heroPos.row && p.col === ctx.heroPos.col);
      if (hasHero) score += 20;
    }

    return score;
  }
}
