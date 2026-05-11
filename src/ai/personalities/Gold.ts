import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { DragonState } from '../../models/Dragon';

export class GoldPersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.GOLD;

  selectActionType(_dragon: DragonState, _ctx: TurnContext): DragonActionType {
    return DragonActionType.BREATH;
  }

  shouldAnnounce(): boolean { return false; }

  describe(dragon: DragonState, _actionType: DragonActionType, targets: number[]): string {
    return `${dragon.name}洒下金色吐息！`;
  }
}
