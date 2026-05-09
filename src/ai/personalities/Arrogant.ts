import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { GridPosition } from '../../utils/GridPosition';
import { DragonState } from '../../models/Dragon';
import { AIScorer } from '../AIScorer';

export class ArrogantPersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.ARROGANT;

  selectActionType(dragon: DragonState, ctx: TurnContext): DragonActionType {
    // Prefers flashy attacks: AreaBreath > LineBreath > SummonImp
    if (dragon.turnCounter % 3 === 0) return DragonActionType.AREA_BREATH;
    if (dragon.turnCounter % 3 === 1) return DragonActionType.LINE_BREATH;
    return DragonActionType.DIAGONAL_BREATH;
  }

  selectTarget(dragon: DragonState, ctx: TurnContext, actionType: DragonActionType): GridPosition {
    return AIScorer.selectBestTarget(ctx, actionType, dragon, 'arrogant');
  }

  shouldAnnounce(): boolean { return true; }

  describe(dragon: DragonState, actionType: DragonActionType, targets: GridPosition[]): string {
    const actionName = actionType === DragonActionType.AREA_BREATH ? '区域吐息' :
      actionType === DragonActionType.LINE_BREATH ? '直线吐息' :
      actionType === DragonActionType.DIAGONAL_BREATH ? '对角线吐息' : '召唤小鬼';
    return `${dragon.name}高傲地预告：${actionName}！`;
  }
}
