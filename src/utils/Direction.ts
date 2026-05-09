export enum Direction {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
}

export const ALL_DIRECTIONS: Direction[] = [
  Direction.UP,
  Direction.DOWN,
  Direction.LEFT,
  Direction.RIGHT,
];

export function directionToDelta(dir: Direction): { dr: number; dc: number } {
  switch (dir) {
    case Direction.UP: return { dr: -1, dc: 0 };
    case Direction.DOWN: return { dr: 1, dc: 0 };
    case Direction.LEFT: return { dr: 0, dc: -1 };
    case Direction.RIGHT: return { dr: 0, dc: 1 };
  }
}

export function randomDirection(): Direction {
  return ALL_DIRECTIONS[Math.floor(Math.random() * ALL_DIRECTIONS.length)];
}
