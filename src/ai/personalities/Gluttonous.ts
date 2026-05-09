import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { GridPosition } from '../../utils/GridPosition';
import { DragonState } from '../../models/Dragon';
import { AIScorer } from '../AIScorer';
import { BlockType } from '../../config/blockTypes';

export class GluttonousPersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.GLUTTONOUS;

  selectActionType(dragon: DragonState, _ctx: TurnContext): DragonActionType {
    // Prefers line breath to sweep food rows
    if (dragon.satiation < 60) {
      return Math.random() < 0.6 ? DragonActionType.LINE_BREATH : DragonActionType.AREA_BREATH;
    }
    // Getting full, might summon imps to harass
    if (Math.random() < 0.5) return DragonActionType.SUMMON_IMP;
    return DragonActionType.DIAGONAL_BREATH;
  }

  selectTarget(dragon: DragonState, ctx: TurnContext, actionType: DragonActionType): GridPosition {
    return AIScorer.selectBestTarget(ctx, actionType, dragon, 'gluttonous');
  }

  shouldAnnounce(): boolean { return false; }

  describe(dragon: DragonState, actionType: DragonActionType, targets: GridPosition[]): string {
    const actionName = actionType === DragonActionType.AREA_BREATH ? '区域吐息' :
      actionType === DragonActionType.LINE_BREATH ? '直线吐息' :
      actionType === DragonActionType.DIAGONAL_BREATH ? '对角线吐息' : '召唤小鬼';
    const satiationText = dragon.satiation >= 60 ? '（快吃饱了）' : '';
    return `${dragon.name}贪婪地${actionName}！${satiationText}`;
  }
}
