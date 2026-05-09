import { GridPosition } from '../../utils/GridPosition';
import { Grid } from '../../models/Grid';
import { DragonAction, DragonActionType } from './DragonAction';

/**
 * 直线吐息：攻击一整行或一整列
 */
export class LineBreath implements DragonAction {
  readonly type = DragonActionType.LINE_BREATH;

  getAffectedPositions(anchor: GridPosition, gridSize: number): GridPosition[] {
    const positions: GridPosition[] = [];
    // Randomly choose row or column
    if (Math.random() < 0.5) {
      // Row sweep
      for (let c = 0; c < gridSize; c++) {
        positions.push(new GridPosition(anchor.row, c));
      }
    } else {
      // Column sweep
      for (let r = 0; r < gridSize; r++) {
        positions.push(new GridPosition(r, anchor.col));
      }
    }
    return positions;
  }

  getValidAnchors(grid: Grid): GridPosition[] {
    const anchors: GridPosition[] = [];
    // Any edge position can be an anchor
    for (let i = 0; i < grid.size; i++) {
      anchors.push(new GridPosition(i, 0));
      anchors.push(new GridPosition(0, i));
    }
    return anchors;
  }

  calculateDamage(baseDamage: number, shielded: boolean): number {
    if (shielded) return Math.max(1, Math.floor(baseDamage * 0.5));
    return baseDamage;
  }
}
