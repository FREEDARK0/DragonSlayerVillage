import { DragonActionType } from '../actions/DragonAction';
import { DragonState } from '../../models/Dragon';
import { OctagonBoard } from '../../core/OctagonBoard';

export interface TurnContext {
  board: OctagonBoard;
}

export interface DragonPersonality {
  readonly type: string;
  selectActionType(dragon: DragonState, ctx: TurnContext): DragonActionType;
  shouldAnnounce(): boolean;
  describe(dragon: DragonState, actionType: DragonActionType, targets: number[]): string;
}
