import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
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
  private clouds: Array<{
    container: Container;
    baseX: number;
    baseY: number;
    driftX: number;
    driftY: number;
    speed: number;
    phase: number;
    alpha: number;
  }> = [];
  private cloudTime = 0;

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
    this.app.ticker.add(this.animateClouds, this);
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
    bg.removeChildren();
    this.clouds = [];
    bg.addChild(this.createSkyGradient());

    const cloudLayer = new Container();
    cloudLayer.label = 'CloudRing';
    bg.addChild(cloudLayer);
    this.createCloudRing(cloudLayer);
  }

  private createSkyGradient(): Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.floor(this.screenW));
    canvas.height = Math.max(2, Math.floor(this.screenH));
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#85c9f1');
    gradient.addColorStop(0.42, '#a9dcf5');
    gradient.addColorStop(0.72, '#d2edf8');
    gradient.addColorStop(1, '#eef8fb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);
    sprite.label = 'SkyGradient';
    sprite.width = this.screenW;
    sprite.height = this.screenH;
    return sprite;
  }

  private createCloudRing(layer: Container): void {
    const placements = [
      { angle: -2.72, scale: 0.9, alpha: 0.36, phase: 0.1 },
      { angle: -2.18, scale: 0.72, alpha: 0.3, phase: 1.8 },
      { angle: -0.93, scale: 0.62, alpha: 0.24, phase: 4.3 },
      { angle: -0.2, scale: 0.84, alpha: 0.33, phase: 2.7 },
      { angle: 0.55, scale: 0.72, alpha: 0.27, phase: 5.6 },
      { angle: 1.06, scale: 0.66, alpha: 0.22, phase: 3.4 },
      { angle: 2.23, scale: 0.78, alpha: 0.29, phase: 6.2 },
      { angle: 2.82, scale: 0.64, alpha: 0.25, phase: 1.1 },
    ];

    for (const [index, cloud] of placements.entries()) {
      const radius = this.octagonRadius * (1.55 + (index % 3) * 0.08);
      const baseX = this.octagonCenterX + Math.cos(cloud.angle) * radius;
      const baseY = this.octagonCenterY + Math.sin(cloud.angle) * radius;
      const container = this.createCloud(baseX, baseY, cloud.scale, cloud.alpha);
      container.label = `Cloud-${index}`;
      layer.addChild(container);
      this.clouds.push({
        container,
        baseX,
        baseY,
        driftX: this.octagonRadius * (0.025 + (index % 2) * 0.01),
        driftY: this.octagonRadius * (0.012 + (index % 3) * 0.004),
        speed: 0.00042 + index * 0.000035,
        phase: cloud.phase,
        alpha: cloud.alpha,
      });
    }
  }

  private createCloud(x: number, y: number, scale: number, alpha: number): Container {
    const cloud = new Container();
    cloud.position.set(x, y);
    cloud.scale.set(scale);
    cloud.alpha = alpha;
    cloud.eventMode = 'none';

    const shadow = new Graphics();
    shadow.ellipse(8, 8, 98, 26);
    shadow.fill({ color: 0x6aa8c1, alpha: 0.18 });
    cloud.addChild(shadow);

    const body = new Graphics();
    body.ellipse(-62, 8, 58, 19);
    body.fill({ color: 0xffffff, alpha: 0.76 });
    body.ellipse(-18, -4, 72, 29);
    body.fill({ color: 0xffffff, alpha: 0.82 });
    body.ellipse(44, 4, 64, 23);
    body.fill({ color: 0xffffff, alpha: 0.74 });
    body.ellipse(7, 14, 106, 22);
    body.fill({ color: 0xf4fbff, alpha: 0.56 });
    body.ellipse(-10, -9, 38, 15);
    body.fill({ color: 0xffffff, alpha: 0.42 });
    cloud.addChild(body);

    return cloud;
  }

  private animateClouds(): void {
    this.cloudTime += this.app.ticker.deltaMS;
    for (const cloud of this.clouds) {
      const t = this.cloudTime * cloud.speed + cloud.phase;
      cloud.container.position.set(
        cloud.baseX + Math.sin(t) * cloud.driftX + Math.sin(t * 0.37) * cloud.driftX * 0.35,
        cloud.baseY + Math.cos(t * 0.72) * cloud.driftY,
      );
      cloud.container.alpha = cloud.alpha + Math.sin(t * 0.9) * 0.035;
    }
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
