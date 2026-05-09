export class GridPosition {
  constructor(
    public readonly row: number,
    public readonly col: number,
  ) {}

  key(): string {
    return `${this.row},${this.col}`;
  }

  equals(other: GridPosition): boolean {
    return this.row === other.row && this.col === other.col;
  }

  add(dr: number, dc: number): GridPosition {
    return new GridPosition(this.row + dr, this.col + dc);
  }

  static fromKey(key: string): GridPosition {
    const [r, c] = key.split(',').map(Number);
    return new GridPosition(r, c);
  }
}
