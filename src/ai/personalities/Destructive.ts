import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { GridPosition } from '../../utils/GridPosition';
import { DragonState } from '../../models/Dragon';
import { AIScorer } from '../AIScorer';

export class DestructivePersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.DESTRUCTIVE;

  selectActionType(dragon: DragonState, _ctx: TurnContext): DragonActionType {
    // Focuses on maximum damage: AreaBreath > LineBreath
    if (dragon.turnCounter % 2 === 0) return DragonActionType.AREA_BREATH;
    if (dragon.turnCounter % 3 === 0) return DragonActionType.SUMMON_IMP;
    return DragonActionType.LINE_BREATH;
  }

  selectTarget(dragon: DragonState, ctx: TurnContext, actionType: DragonActionType): GridPosition {
    return AIScorer.selectBestTarget(ctx, actionType, dragon, 'destructive');
  }

  shouldAnnounce(): boolean { return false; }

  describe(dragon: DragonState, actionType: DragonActionType, targets: GridPosition[]): string {
    const actionName = actionType === DragonActionType.AREA_BREATH ? '区域吐息' :
      actionType === DragonActionType.LINE_BREATH ? '直线吐息' :
      actionType === DragonActionType.DIAGONAL_BREATH ? '对角线吐息' : '召唤小鬼';
    const progress = Math.round((dragon.damageDealt / dragon.damageThreshold) * 100);
    return `${dragon.name}狂暴地${actionName}！已造成 ${progress}% 目标伤害`;
  }
}
