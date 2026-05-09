import { Container, Graphics } from 'pixi.js';
import { Grid } from '../models/Grid';
import { GameRenderer } from './GameRenderer';
import { BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { GAME_CONSTANTS } from '../config/constants';
import { GridPosition } from '../utils/GridPosition';

export class GridRenderer {
  private container: Container;
  private bgGraphics: Graphics;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'GridRenderer';
    this.bgGraphics = new Graphics();
    this.container.addChild(this.bgGraphics);
    renderer.getLayer(1).addChild(this.container);
  }

  render(grid: Grid, heroPos?: { row: number; col: number }): void {
    this.container.removeChildren();
    this.bgGraphics = new Graphics();
    this.container.addChild(this.bgGraphics);

    const cellSize = GAME_CONSTANTS.CELL_SIZE;
    const gap = GAME_CONSTANTS.CELL_GAP;
    const gridTotal = grid.size * cellSize;
    const ox = this.renderer.gridOriginX;
    const oy = this.renderer.gridOriginY;

    // Full grid background with subtle gradient effect
    this.bgGraphics.roundRect(ox - 6, oy - 6, gridTotal + 12, gridTotal + 12, 10);
    this.bgGraphics.fill({ color: 0x12122a, alpha: 0.8 });

    // Grid border
    this.bgGraphics.roundRect(ox - 4, oy - 4, gridTotal + 8, gridTotal + 8, 8);
    this.bgGraphics.stroke({ width: 2, color: 0x334466 });

    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
        const x = ox + c * cellSize;
        const y = oy + r * cellSize;
        const cell = grid.getCell(new GridPosition(r, c));
        const block = cell?.block ?? null;

        const g = new Graphics();

        // Cell tile base
        let bgColor = 0x1a1a32;
        let borderColor = 0x2a2a44;

        if (block) {
          const def = BLOCK_TYPE_TABLE[block.type];
          // Light tint based on block type
          const r16 = (def.color >> 16) & 0xff;
          const g8 = (def.color >> 8) & 0xff;
          const b8 = def.color & 0xff;
          bgColor = ((Math.floor(r16 * 0.25)) << 16) | ((Math.floor(g8 * 0.25)) << 8) | Math.floor(b8 * 0.25);
          borderColor = ((Math.floor(r16 * 0.5)) << 16) | ((Math.floor(g8 * 0.5)) << 8) | Math.floor(b8 * 0.5);
        }

        // Cell with rounded corners
        g.roundRect(x + gap, y + gap, cellSize - gap * 2, cellSize - gap * 2, 8);
        g.fill(bgColor);
        g.stroke({ width: 1, color: borderColor });

        // Inner subtle highlight at top-left
        g.roundRect(x + gap + 2, y + gap + 2, cellSize - gap * 2 - 4, cellSize - gap * 2 - 4, 6);
        g.stroke({ width: 0.5, color: 0xffffff, alpha: 0.05 });

        g.label = `Cell[${r},${c}]`;
        this.container.addChild(g);
      }
    }

    // Player position highlight
    if (heroPos) {
      const px = ox + heroPos.col * cellSize + cellSize / 2;
      const py = oy + heroPos.row * cellSize + cellSize / 2;
      const r = cellSize * 0.2;
      const marker = new Graphics();
      // Outer glow
      marker.circle(px, py, r + 4);
      marker.fill({ color: 0xffffff, alpha: 0.08 });
      // Dot
      marker.circle(px, py, r);
      marker.fill(0xffffff);
      marker.stroke({ width: 1.5, color: 0x4488cc });
      marker.label = 'PlayerMarker';
      this.container.addChild(marker);
    }

    // Grid coordinate labels
    // ...skip for now to keep it clean
  }
}
