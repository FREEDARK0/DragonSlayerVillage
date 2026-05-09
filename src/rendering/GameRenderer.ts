import { Application, Container, Graphics } from 'pixi.js';
import { GAME_CONSTANTS } from '../config/constants';

export enum RenderLayer {
  BACKGROUND = 0,
  GRID = 1,
  BLOCKS = 2,
  VISION_FRAME = 3,
  DRAGONS = 4,
  UI = 5,
  OVERLAY = 6,
}

export class GameRenderer {
  app!: Application;
  private layers: Map<RenderLayer, Container> = new Map();
  private _gridOriginX = 0;
  private _gridOriginY = 0;

  get gridOriginX(): number { return this._gridOriginX; }
  get gridOriginY(): number { return this._gridOriginY; }
  get cellSize(): number { return GAME_CONSTANTS.CELL_SIZE; }
  get gridSize(): number { return GAME_CONSTANTS.GRID_SIZE; }

  async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      width: GAME_CONSTANTS.SCREEN_WIDTH,
      height: GAME_CONSTANTS.SCREEN_HEIGHT,
      background: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });

    document.body.appendChild(this.app.canvas);

    // Handle WebGL context loss
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost, will restore...');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored, re-rendering...');
      this.redrawBackground();
    });

    for (const layer of Object.values(RenderLayer).filter(v => typeof v === 'number')) {
      const container = new Container();
      container.label = `Layer-${RenderLayer[layer as RenderLayer]}`;
      this.app.stage.addChild(container);
      this.layers.set(layer as RenderLayer, container);
    }

    this.drawBackground();

    this.calculateGridOrigin();
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private redrawBackground(): void {
    const bg = this.getLayer(RenderLayer.BACKGROUND);
    bg.removeChildren();
    this.drawBackground();
  }

  private drawBackground(): void {
    const bg = this.getLayer(RenderLayer.BACKGROUND);
    const g = new Graphics();
    const w = GAME_CONSTANTS.SCREEN_WIDTH;
    const h = GAME_CONSTANTS.SCREEN_HEIGHT;

    // Subtle radial gradient (simulated with concentric circles)
    for (let i = 8; i >= 1; i--) {
      const alpha = 0.03 * (9 - i);
      const r = Math.max(w, h) * (i / 8);
      g.circle(w / 2, h / 2, r);
      g.fill({ color: 0x334488, alpha });
    }

    // Decorative corner flourishes
    const flourishSize = 60;
    const corners = [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]];
    for (const [fx, fy] of corners) {
      g.circle(fx as number, fy as number, flourishSize);
      g.fill({ color: 0x223355, alpha: 0.3 });
      g.circle(fx as number, fy as number, flourishSize * 0.6);
      g.fill({ color: 0x1a1a2e, alpha: 0.5 });
    }

    bg.addChild(g);
  }

  private calculateGridOrigin(): void {
    const totalSize = this.gridSize * this.cellSize;
    this._gridOriginX = Math.floor((GAME_CONSTANTS.SCREEN_WIDTH - totalSize) / 2);
    this._gridOriginY = Math.floor((GAME_CONSTANTS.SCREEN_HEIGHT - totalSize) / 2) + 40;
  }

  private onResize(): void {
    this.calculateGridOrigin();
  }

  getLayer(layer: RenderLayer): Container {
    return this.layers.get(layer)!;
  }

  clearLayer(layer: RenderLayer): void {
    const container = this.layers.get(layer);
    if (container) {
      container.removeChildren();
    }
  }

  pixelToGrid(pixelX: number, pixelY: number): { row: number; col: number } | null {
    const col = Math.floor((pixelX - this._gridOriginX) / this.cellSize);
    const row = Math.floor((pixelY - this._gridOriginY) / this.cellSize);
    if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
      return { row, col };
    }
    return null;
  }

  gridToPixel(row: number, col: number): { x: number; y: number } {
    return {
      x: this._gridOriginX + col * this.cellSize,
      y: this._gridOriginY + row * this.cellSize,
    };
  }
}
