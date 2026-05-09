import { GridPosition } from '../../utils/GridPosition';
import { Grid } from '../../models/Grid';

export enum DragonActionType {
  LINE_BREATH = 'line_breath',
  DIAGONAL_BREATH = 'diagonal_breath',
  AREA_BREATH = 'area_breath',
  SUMMON_IMP = 'summon_imp',
}

export interface DragonAction {
  readonly type: DragonActionType;
  /** 返回给定锚点会影响的所有网格位置 */
  getAffectedPositions(anchor: GridPosition, gridSize: number): GridPosition[];
  /** 返回该动作可能的所有有效锚点 */
  getValidAnchors(grid: Grid): GridPosition[];
  /** 计算对目标方块造成的伤害 */
  calculateDamage(baseDamage: number, shielded: boolean): number;
}
