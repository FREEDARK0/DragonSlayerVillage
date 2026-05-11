import { Application, Container, Graphics } from 'pixi.js';
import { pixelToSector, sectorCenterOffset } from '../utils/SectorUtils';

export enum RenderLayer {
  BACKGROUND = 0,
  BOARD = 1,
  BLOCKS = 2,
  VISION_ARC = 3,
  DRAGONS = 4,
  UI = 5,
  OVERLAY = 6,
}

export class GameRenderer {
  app!: Application;
  private layers: Map<RenderLayer, Container> = new Map();

  screenW = 0;
  screenH = 0;
  octagonCenterX = 0;
  octagonCenterY = 0;
  octagonRadius = 0;

  async init(): Promise<void> {
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;
    this.octagonRadius = Math.min(this.screenW, this.screenH) * 0.28;
    this.octagonCenterX = this.screenW / 2;
    this.octagonCenterY = this.screenH / 2 + 60;

    this.app = new Application();
    await this.app.init({
      width: this.screenW,
      height: this.screenH,
      background: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });

    document.body.appendChild(this.app.canvas);
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });

    for (const layer of Object.values(RenderLayer).filter(v => typeof v === 'number')) {
      const container = new Container();
      container.label = `Layer-${RenderLayer[layer as RenderLayer]}`;
      this.app.stage.addChild(container);
      this.layers.set(layer as RenderLayer, container);
    }

    this.drawBackground();
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onResize(): void {
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;
    this.octagonRadius = Math.min(this.screenW, this.screenH) * 0.28;
    this.octagonCenterX = this.screenW / 2;
    this.octagonCenterY = this.screenH / 2 + 60;
    this.app.renderer.resize(this.screenW, this.screenH);
    this.layers.get(RenderLayer.BACKGROUND)?.removeChildren();
    this.drawBackground();
  }

  private drawBackground(): void {
    const bg = this.getLayer(RenderLayer.BACKGROUND);
    const g = new Graphics();
    for (let i = 8; i >= 1; i--) {
      g.circle(this.screenW / 2, this.screenH / 2, Math.max(this.screenW, this.screenH) * (i / 8));
      g.fill({ color: 0x334488, alpha: 0.03 * (9 - i) });
    }
    bg.addChild(g);
  }

  getLayer(layer: RenderLayer): Container {
    return this.layers.get(layer)!;
  }

  pixelToSectorIndex(px: number, py: number): number | null {
    const dx = px - this.octagonCenterX;
    const dy = py - this.octagonCenterY;
    if (Math.sqrt(dx * dx + dy * dy) < 15) return null;
    return pixelToSector(dx, dy);
  }

  sectorToPixel(index: number): { x: number; y: number } {
    const offset = sectorCenterOffset(index, this.octagonRadius);
    return {
      x: this.octagonCenterX + offset.x,
      y: this.octagonCenterY + offset.y,
    };
  }
}
