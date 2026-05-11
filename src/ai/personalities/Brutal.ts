import { DragonPersonality, TurnContext } from './DragonPersonality';
import { DragonActionType } from '../actions/DragonAction';
import { DragonPersonalityType } from '../../config/dragonTypes';
import { DragonState } from '../../models/Dragon';

export class BrutalPersonality implements DragonPersonality {
  readonly type = DragonPersonalityType.BRUTAL;

  selectActionType(_dragon: DragonState, _ctx: TurnContext): DragonActionType {
    return DragonActionType.BREATH;
  }

  shouldAnnounce(): boolean { return false; }

  describe(dragon: DragonState, _actionType: DragonActionType, _targets: number[]): string {
    return `${dragon.name}留下弱点标记！(HP: ${dragon.combatPower}/${dragon.maxCombatPower})`;
  }
}
