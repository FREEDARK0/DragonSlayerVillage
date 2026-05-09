import { DragonActionType } from '../actions/DragonAction';
import { GridPosition } from '../../utils/GridPosition';
import { DragonState } from '../../models/Dragon';
import { Grid } from '../../models/Grid';
import { HeroState } from '../../models/Hero';

export interface TurnContext {
  grid: Grid;
  hero: HeroState;
  heroPos: GridPosition;
}

export interface DragonPersonality {
  readonly type: string;
  /** 选择动作类型 */
  selectActionType(dragon: DragonState, ctx: TurnContext): DragonActionType;
  /** 选择动作目标 */
  selectTarget(dragon: DragonState, ctx: TurnContext, actionType: DragonActionType): GridPosition;
  /** 是否预告攻击 */
  shouldAnnounce(): boolean;
  /** 描述动作 */
  describe(dragon: DragonState, actionType: DragonActionType, targets: GridPosition[]): string;
}
