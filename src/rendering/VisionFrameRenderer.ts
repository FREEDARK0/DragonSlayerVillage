import { Container, Graphics } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { VisionFrame } from '../models/VisionFrame';
import { GAME_CONSTANTS } from '../config/constants';

export class VisionFrameRenderer {
  private container: Container;
  private graphics: Graphics;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'VisionFrameRenderer';
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    renderer.getLayer(3).addChild(this.container);
  }

  render(frame: VisionFrame | null): void {
    this.graphics.clear();

    if (!frame) return;

    const cellSize = GAME_CONSTANTS.CELL_SIZE;
    const x = this.renderer.gridOriginX + frame.topLeft.col * cellSize;
    const y = this.renderer.gridOriginY + frame.topLeft.row * cellSize;
    const totalSize = frame.size * cellSize;

    const fillColor = 0x44aaff;
    const fillAlpha = 0.1;
    const strokeColor = 0x88ccff;
    const strokeAlpha = 0.5;

    // Main highlight
    this.graphics.roundRect(x + 1, y + 1, totalSize - 2, totalSize - 2, 6);
    this.graphics.fill({ color: fillColor, alpha: fillAlpha });
    this.graphics.stroke({ width: 2, color: strokeColor, alpha: strokeAlpha });

    // Inner glow
    this.graphics.roundRect(x + 3, y + 3, totalSize - 6, totalSize - 6, 4);
    this.graphics.stroke({ width: 0.5, color: strokeColor, alpha: strokeAlpha * 0.5 });

    // Corner brackets
    const blen = 10;
    const bw = 3;
    const corners = [
      [x, y, 1, 1], [x + totalSize, y, -1, 1],
      [x, y + totalSize, 1, -1], [x + totalSize, y + totalSize, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      // Horizontal arm
      this.graphics.roundRect(cx as number, cy as number, sx as number * blen, bw, 1);
      this.graphics.fill({ color: strokeColor, alpha: strokeAlpha });
      // Vertical arm
      this.graphics.roundRect(cx as number, cy as number, bw, sy as number * blen, 1);
      this.graphics.fill({ color: strokeColor, alpha: strokeAlpha });
    }
  }
}
