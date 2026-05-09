import { GridPosition } from '../../utils/GridPosition';
import { Grid } from '../../models/Grid';
import { DragonAction, DragonActionType } from './DragonAction';

/**
 * 区域吐息：攻击 2x2 区域
 */
export class AreaBreath implements DragonAction {
  readonly type = DragonActionType.AREA_BREATH;

  getAffectedPositions(anchor: GridPosition, gridSize: number): GridPosition[] {
    const positions: GridPosition[] = [];
    // Anchor is the top-left of the 2x2 area
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const pos = anchor.add(r, c);
        if (pos.row < gridSize && pos.col < gridSize) {
          positions.push(pos);
        }
      }
    }
    return positions;
  }

  getValidAnchors(grid: Grid): GridPosition[] {
    const anchors: GridPosition[] = [];
    // Any position that allows a 2x2 area within bounds
    for (let r = 0; r <= grid.size - 2; r++) {
      for (let c = 0; c <= grid.size - 2; c++) {
        anchors.push(new GridPosition(r, c));
      }
    }
    return anchors;
  }

  calculateDamage(baseDamage: number, shielded: boolean): number {
    if (shielded) return Math.max(1, Math.floor(baseDamage * 0.5));
    return baseDamage;
  }
}
