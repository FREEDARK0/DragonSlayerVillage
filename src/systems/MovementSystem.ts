import { Grid } from '../models/Grid';
import { Direction, directionToDelta, ALL_DIRECTIONS } from '../utils/Direction';
import { GridPosition } from '../utils/GridPosition';
import { BlockType } from '../config/blockTypes';
import { pick } from '../utils/random';

export interface MoveResult {
  moved: boolean;
  from: GridPosition;
  to: GridPosition;
  newDirection?: Direction;
}

export class MovementSystem {
  /** 移动所有小鬼 */
  moveAllCharacters(grid: Grid, _heroPos: GridPosition): { heroMoved: null; impMoves: MoveResult[] } {
    const impMoves: MoveResult[] = [];
    const impCells = grid.findAll(c => c.block?.type === BlockType.IMP);
    const occupiedTargets = new Set<string>();

    for (const cell of impCells) {
      const block = cell.block!;
      if (!block.direction) continue;

      const delta = directionToDelta(block.direction);
      const targetPos = cell.position.add(delta.dr, delta.dc);

      if (!grid.isInBounds(targetPos) || occupiedTargets.has(targetPos.key())) {
        const valid = ALL_DIRECTIONS.filter(d => {
          const dd = directionToDelta(d);
          const t = cell.position.add(dd.dr, dd.dc);
          if (!grid.isInBounds(t) || occupiedTargets.has(t.key())) return false;
          const tc = grid.getCell(t);
          return tc && (tc.block === null || tc.block.type === BlockType.EMPTY);
        });
        if (valid.length > 0) {
          block.direction = pick(valid);
        }
        continue;
      }

      const targetCell = grid.getCell(targetPos);
      if (!targetCell || (targetCell.block !== null && targetCell.block.type !== BlockType.EMPTY)) continue;

      const movedBlock = { ...block };
      grid.removeBlock(cell.position);
      grid.setBlock(targetPos, movedBlock);
      occupiedTargets.add(targetPos.key());
      impMoves.push({ moved: true, from: cell.position, to: targetPos });
    }

    return { heroMoved: null, impMoves };
  }

  changeDirection(grid: Grid, pos: GridPosition, newDir: Direction): boolean {
    const block = grid.getBlock(pos);
    if (!block || block.type !== BlockType.IMP) return false;
    block.direction = newDir;
    return true;
  }
}
