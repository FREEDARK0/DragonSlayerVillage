import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { DragonState } from '../../models/Dragon';

export class ArrogantPersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.ARROGANT;

  selectActionType(_dragon: DragonState, _ctx: TurnContext): DragonActionType {
    return DragonActionType.BREATH;
  }

  shouldAnnounce(): boolean { return true; }

  describe(dragon: DragonState, _actionType: DragonActionType, targets: number[]): string {
    return `${dragon.name}高傲吐息！覆盖 ${targets.length} 个扇形`;
  }
}
