import { GridPosition } from '../../utils/GridPosition';
import { Grid } from '../../models/Grid';
import { DragonAction, DragonActionType } from './DragonAction';

/**
 * 对角线吐息：攻击一条对角线
 */
export class DiagonalBreath implements DragonAction {
  readonly type = DragonActionType.DIAGONAL_BREATH;

  getAffectedPositions(anchor: GridPosition, gridSize: number): GridPosition[] {
    const positions: GridPosition[] = [];
    // Main diagonal (\) or anti-diagonal (/)
    const useAntiDiag = Math.random() < 0.5;

    for (let i = 0; i < gridSize; i++) {
      if (useAntiDiag) {
        // Anti-diagonal: row + col = constant (max is gridSize - 1 + gridSize - 1)
        // But we use anchor to determine which anti-diagonal
        const sum = anchor.row + anchor.col;
        const col = sum - i;
        if (col >= 0 && col < gridSize) {
          positions.push(new GridPosition(i, col));
        }
      } else {
        // Main diagonal: row - col = constant
        const diff = anchor.row - anchor.col;
        const col = i - diff;
        if (col >= 0 && col < gridSize) {
          positions.push(new GridPosition(i, col));
        }
      }
    }
    return positions;
  }

  getValidAnchors(grid: Grid): GridPosition[] {
    const anchors: GridPosition[] = [];
    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
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
