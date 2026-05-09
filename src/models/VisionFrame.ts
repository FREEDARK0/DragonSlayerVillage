import { GridPosition } from '../utils/GridPosition';

export class VisionFrame {
  topLeft: GridPosition;
  readonly size: number;

  constructor(topLeft: GridPosition, size: number) {
    this.topLeft = topLeft;
    this.size = size;
  }

  getCoveredPositions(): GridPosition[] {
    const positions: GridPosition[] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        positions.push(this.topLeft.add(r, c));
      }
    }
    return positions;
  }

  contains(pos: GridPosition): boolean {
    return (
      pos.row >= this.topLeft.row &&
      pos.row < this.topLeft.row + this.size &&
      pos.col >= this.topLeft.col &&
      pos.col < this.topLeft.col + this.size
    );
  }

  clampToGrid(gridSize: number): void {
    this.topLeft = new GridPosition(
      Math.max(0, Math.min(this.topLeft.row, gridSize - this.size)),
      Math.max(0, Math.min(this.topLeft.col, gridSize - this.size)),
    );
  }
}
