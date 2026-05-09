import { GridPosition } from '../utils/GridPosition';
import { BlockData } from './Block';
import { BlockType } from '../config/blockTypes';

export interface Cell {
  position: GridPosition;
  block: BlockData | null;
}

export class Grid {
  readonly size: number;
  private cells: Map<string, Cell>;

  constructor(size: number) {
    this.size = size;
    this.cells = new Map();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const pos = new GridPosition(r, c);
        this.cells.set(pos.key(), { position: pos, block: null });
      }
    }
  }

  getCell(pos: GridPosition): Cell | null {
    const cell = this.cells.get(pos.key());
    if (!cell) return null;
    return cell;
  }

  setBlock(pos: GridPosition, block: BlockData | null): void {
    const cell = this.cells.get(pos.key());
    if (cell) {
      cell.block = block;
    }
  }

  removeBlock(pos: GridPosition): void {
    const cell = this.cells.get(pos.key());
    if (cell) {
      cell.block = null;
    }
  }

  getBlock(pos: GridPosition): BlockData | null {
    const cell = this.cells.get(pos.key());
    return cell?.block ?? null;
  }

  isInBounds(pos: GridPosition): boolean {
    return pos.row >= 0 && pos.row < this.size && pos.col >= 0 && pos.col < this.size;
  }

  isEmpty(pos: GridPosition): boolean {
    const block = this.getBlock(pos);
    return block === null || block.type === BlockType.EMPTY;
  }

  findAll(predicate: (cell: Cell) => boolean): Cell[] {
    const result: Cell[] = [];
    this.cells.forEach(cell => {
      if (predicate(cell)) result.push(cell);
    });
    return result;
  }

  findBlock(type: BlockType): Cell | null {
    for (const cell of this.cells.values()) {
      if (cell.block?.type === type) return cell;
    }
    return null;
  }

  forEach(fn: (cell: Cell) => void): void {
    this.cells.forEach(fn);
  }

  allCells(): Cell[] {
    return Array.from(this.cells.values());
  }

  getEmptyPositions(): GridPosition[] {
    return this.findAll(c => c.block === null || c.block.type === BlockType.EMPTY)
      .map(c => c.position);
  }

  clone(): Grid {
    const newGrid = new Grid(this.size);
    this.cells.forEach((cell, key) => {
      const newCell = newGrid.cells.get(key)!;
      newCell.block = cell.block ? { ...cell.block } : null;
    });
    return newGrid;
  }
}
