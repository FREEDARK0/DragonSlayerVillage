import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { DragonState } from '../../models/Dragon';

export class DestructivePersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.DESTRUCTIVE;

  selectActionType(_dragon: DragonState, _ctx: TurnContext): DragonActionType {
    return DragonActionType.BREATH;
  }

  shouldAnnounce(): boolean { return false; }

  describe(dragon: DragonState, _actionType: DragonActionType, _targets: number[]): string {
    const progress = Math.round((dragon.damageDealt / dragon.damageThreshold) * 100);
    return `${dragon.name}狂暴吐息！${progress}% 目标伤害`;
  }
}
