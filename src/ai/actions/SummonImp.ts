import { GridPosition } from '../../utils/GridPosition';
import { Grid } from '../../models/Grid';
import { DragonAction, DragonActionType } from './DragonAction';

/**
 * 召唤小鬼：在目标空格生成一个小鬼
 */
export class SummonImp implements DragonAction {
  readonly type = DragonActionType.SUMMON_IMP;

  getAffectedPositions(anchor: GridPosition, _gridSize: number): GridPosition[] {
    return [anchor];
  }

  getValidAnchors(grid: Grid): GridPosition[] {
    // Can only summon on empty cells
    return grid.getEmptyPositions();
  }

  calculateDamage(_baseDamage: number, _shielded: boolean): number {
    // Summon does no direct damage
    return 0;
  }
}
