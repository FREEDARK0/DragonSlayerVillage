import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { DragonState } from '../../models/Dragon';

export class GluttonousPersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.GLUTTONOUS;

  selectActionType(dragon: DragonState, _ctx: TurnContext): DragonActionType {
    if (dragon.satiation < 60) return DragonActionType.BREATH;
    if (Math.random() < 0.5) return DragonActionType.SUMMON_IMP;
    return DragonActionType.BREATH;
  }

  shouldAnnounce(): boolean { return false; }

  describe(dragon: DragonState, actionType: DragonActionType, _targets: number[]): string {
    if (actionType === DragonActionType.SUMMON_IMP) return `${dragon.name}召唤小鬼！`;
    return `${dragon.name}贪婪吐息！${dragon.satiation >= 60 ? '（快吃饱了）' : ''}`;
  }
}
