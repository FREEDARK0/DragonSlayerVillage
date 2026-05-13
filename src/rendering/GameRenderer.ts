import { Application, Container, Graphics } from 'pixi.js';
import { pixelToSector, sectorCenterOffset } from '../utils/SectorUtils';

export enum RenderLayer {
  BACKGROUND = 0,
  NIGHT = 1,
  BOARD = 2,
  BLOCKS = 3,
  VISION_ARC = 4,
  DRAGONS = 5,
  UI = 6,
  OVERLAY = 7,
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
      background: 0x88c8ee,
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
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const y = this.screenH * t;
      const h = this.screenH / bands + 2;
      const r = Math.floor(0x8e * (1 - t) + 0xd9 * t);
      const green = Math.floor(0xc8 * (1 - t) + 0xee * t);
      const b = Math.floor(0xef * (1 - t) + 0xff * t);
      g.rect(0, y, this.screenW, h);
      g.fill((r << 16) | (green << 8) | b);
    }
    for (let i = 0; i < 6; i++) {
      const x = (this.screenW * (i + 0.7)) / 6;
      const y = 90 + (i % 3) * 45;
      g.ellipse(x, y, 80, 22);
      g.fill({ color: 0xffffff, alpha: 0.22 });
      g.ellipse(x + 45, y + 6, 64, 18);
      g.fill({ color: 0xffffff, alpha: 0.16 });
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
