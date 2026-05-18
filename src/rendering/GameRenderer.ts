import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { PostProcessConfig, PostProcessSnapshot, ScreenPostProcess, WarmTintSnapshot } from './ScreenPostProcess';
import { CloudscapeRenderer, CloudscapeSnapshot } from './CloudscapeRenderer';
import { pixelToSector, sectorCenterOffset } from '../utils/SectorUtils';

export interface IslandShadowSnapshot {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  layerBelowNight: boolean;
  hasGlow: boolean;
}

export type LayoutProfile = 'desktop' | 'tablet' | 'mobilePortrait' | 'mobileLandscape';

interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export enum RenderLayer {
  BACKGROUND = 0,
  ISLAND_SHADOW = 1,
  NIGHT = 2,
  BOARD = 3,
  BLOCKS = 4,
  VISION_ARC = 5,
  DRAGONS = 6,
  CLOUD_SHADOW = 7,
  CLOUD_OVERLAY = 8,
  UI = 9,
  OVERLAY = 10,
  TUTORIAL_DIM = 11,
  TUTORIAL_UI = 12,
  DEBUG_UI = 13,
}

export class GameRenderer {
  private static readonly BASE_SCREEN_W = 1280;
  private static readonly BASE_SCREEN_H = 720;
  app!: Application;
  private postProcess!: ScreenPostProcess;
  private cloudscapeRenderer!: CloudscapeRenderer;
  private sceneContainer = new Container();
  private layers: Map<RenderLayer, Container> = new Map();
  private islandShadowSnapshot: IslandShadowSnapshot | null = null;
  private resizeFrame: number | null = null;
  private readonly requestResize = () => this.scheduleResize();

  screenW = 0;
  screenH = 0;
  viewportW = 0;
  viewportH = 0;
  displayScale = 1;
  renderResolution = 1;
  layoutProfile: LayoutProfile = 'desktop';
  safeArea: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  octagonCenterX = 0;
  octagonCenterY = 0;
  octagonRadius = 0;
  onResized: (() => void) | null = null;

  async init(): Promise<void> {
    this.updateScreenMetrics();

    this.app = new Application();
    await this.app.init({
      width: this.screenW,
      height: this.screenH,
      background: 0x88c8ee,
      antialias: true,
      resolution: this.renderResolution,
      autoDensity: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });

    document.body.appendChild(this.app.canvas);
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.transformOrigin = 'top left';
    canvas.style.imageRendering = 'auto';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    this.updateCanvasDisplaySize();
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });

    this.sceneContainer.label = 'PostProcessedScene';
    this.sceneContainer.eventMode = 'passive';
    this.app.stage.addChild(this.sceneContainer);
    for (const layer of Object.values(RenderLayer).filter(v => typeof v === 'number')) {
      const container = new Container();
      container.label = `Layer-${RenderLayer[layer as RenderLayer]}`;
      if ((layer as RenderLayer) !== RenderLayer.UI && (layer as RenderLayer) !== RenderLayer.OVERLAY && (layer as RenderLayer) !== RenderLayer.TUTORIAL_DIM && (layer as RenderLayer) !== RenderLayer.TUTORIAL_UI && (layer as RenderLayer) !== RenderLayer.DEBUG_UI && (layer as RenderLayer) !== RenderLayer.DRAGONS) {
        container.eventMode = 'none';
      }
      if ((layer as RenderLayer) <= RenderLayer.CLOUD_OVERLAY) {
        this.sceneContainer.addChild(container);
      } else {
        this.app.stage.addChild(container);
      }
      this.layers.set(layer as RenderLayer, container);
    }

    this.postProcess = new ScreenPostProcess(this);
    await this.postProcess.loadConfig();
    this.cloudscapeRenderer = new CloudscapeRenderer(this);
    this.drawBackground();
    this.drawIslandShadow();
    this.app.ticker.add(this.animateCloudscape, this);
    window.addEventListener('resize', this.requestResize);
    document.addEventListener('fullscreenchange', this.requestResize);
    window.visualViewport?.addEventListener('resize', this.requestResize);
    window.visualViewport?.addEventListener('scroll', this.requestResize);
  }

  private scheduleResize(): void {
    if (this.resizeFrame !== null) return;
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.resizeToViewport();
      this.onResized?.();
    });
  }

  private updateScreenMetrics(): void {
    const viewport = window.visualViewport;
    this.safeArea = readSafeAreaInsets();
    const rawViewportW = Math.max(
      1,
      Math.round(Math.max(
        viewport?.width ?? 0,
        window.innerWidth || 0,
        document.documentElement.clientWidth || 0,
      )),
    );
    const rawViewportH = Math.max(
      1,
      Math.round(Math.max(
        viewport?.height ?? 0,
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0,
      )),
    );
    this.viewportW = Math.max(1, Math.round(rawViewportW - this.safeArea.left - this.safeArea.right));
    this.viewportH = Math.max(1, Math.round(rawViewportH - this.safeArea.top - this.safeArea.bottom));
    this.layoutProfile = this.resolveLayoutProfile(this.viewportW, this.viewportH);
    const baseW = this.layoutProfile === 'mobilePortrait'
      ? 720
      : this.layoutProfile === 'mobileLandscape'
        ? 960
        : GameRenderer.BASE_SCREEN_W;
    const baseH = this.layoutProfile === 'mobilePortrait'
      ? 1080
      : this.layoutProfile === 'mobileLandscape'
        ? 640
        : GameRenderer.BASE_SCREEN_H;
    this.displayScale = Math.min(
      this.viewportW / baseW,
      this.viewportH / baseH,
    );
    if (this.layoutProfile === 'desktop') this.displayScale = Math.max(1, this.displayScale);
    this.displayScale = Math.max(0.32, this.displayScale);
    this.renderResolution = Math.max(
      1,
      Math.min(3, (window.devicePixelRatio || 1) * this.displayScale),
    );
    this.screenW = Math.max(baseW, Math.round(this.viewportW / Math.max(0.001, this.displayScale)));
    this.screenH = Math.max(baseH, Math.round(this.viewportH / Math.max(0.001, this.displayScale)));
    this.octagonRadius = this.layoutProfile === 'mobilePortrait'
      ? Math.min(this.screenW * 0.39, this.screenH * 0.21)
      : this.layoutProfile === 'mobileLandscape'
        ? Math.min(this.screenW, this.screenH) * 0.25
        : Math.min(this.screenW, this.screenH) * 0.28;
    this.octagonCenterX = this.screenW / 2;
    this.octagonCenterY = this.layoutProfile === 'mobilePortrait'
      ? this.screenH * 0.46
      : this.layoutProfile === 'mobileLandscape'
        ? this.screenH / 2 + 40
        : this.screenH / 2 + 60;
  }

  private resizeToViewport(): void {
    const previousW = this.screenW;
    const previousH = this.screenH;
    const previousResolution = this.renderResolution;
    this.updateScreenMetrics();
    if (this.screenW === previousW && this.screenH === previousH && this.renderResolution === previousResolution) {
      this.updateCanvasDisplaySize();
      return;
    }
    this.app.renderer.resize(this.screenW, this.screenH, this.renderResolution);
    this.updateCanvasDisplaySize();
    this.postProcess.resize();
    this.cloudscapeRenderer.resize();
    this.layers.get(RenderLayer.BACKGROUND)?.removeChildren();
    this.layers.get(RenderLayer.ISLAND_SHADOW)?.removeChildren();
    this.drawBackground();
    this.drawIslandShadow();
  }

  private updateCanvasDisplaySize(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.left = `${this.safeArea.left}px`;
    canvas.style.top = `${this.safeArea.top}px`;
    canvas.style.width = `${this.viewportW}px`;
    canvas.style.height = `${this.viewportH}px`;
  }

  clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || this.viewportW || this.screenW;
    const height = rect.height || this.viewportH || this.screenH;
    return {
      x: ((clientX - rect.left) / width) * this.screenW,
      y: ((clientY - rect.top) / height) * this.screenH,
    };
  }

  worldToClient(x: number, y: number): { x: number; y: number } {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || this.viewportW || this.screenW;
    const height = rect.height || this.viewportH || this.screenH;
    return {
      x: rect.left + (x / this.screenW) * width,
      y: rect.top + (y / this.screenH) * height,
    };
  }

  private resolveLayoutProfile(width: number, height: number): LayoutProfile {
    if (width <= 700 && height > width) return 'mobilePortrait';
    if (height <= 520 || (width <= 920 && width > height)) return 'mobileLandscape';
    if (width <= 1024 || height <= 760) return 'tablet';
    return 'desktop';
  }

  private drawBackground(): void {
    const bg = this.getLayer(RenderLayer.BACKGROUND);
    bg.removeChildren();
    bg.addChild(this.createSkyGradient());
  }

  private drawIslandShadow(): void {
    const layer = this.getLayer(RenderLayer.ISLAND_SHADOW);
    layer.removeChildren();
    const color = 0x02070d;
    const alpha = 0.2;
    const radius = this.octagonRadius * 1.035;
    const shadow = new Graphics();
    shadow.label = 'IslandDarkCircleShadow';
    shadow.eventMode = 'none';
    shadow.circle(this.octagonCenterX, this.octagonCenterY, radius);
    shadow.fill({ color, alpha });
    layer.addChild(shadow);
    this.islandShadowSnapshot = {
      x: this.octagonCenterX,
      y: this.octagonCenterY,
      radius,
      color,
      alpha,
      layerBelowNight: RenderLayer.ISLAND_SHADOW < RenderLayer.NIGHT,
      hasGlow: false,
    };
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

  private animateCloudscape(): void {
    this.cloudscapeRenderer.update(this.app.ticker.deltaMS);
  }

  getLayer(layer: RenderLayer): Container {
    return this.layers.get(layer)!;
  }

  getPostProcessTarget(): Container {
    return this.sceneContainer;
  }

  getWarmTintSnapshot(): WarmTintSnapshot {
    return this.postProcess.getSnapshot().warmTint;
  }

  getPostProcessSnapshot(): PostProcessSnapshot {
    return this.postProcess.getSnapshot();
  }

  getPostProcessConfig(): PostProcessConfig {
    return this.postProcess.getConfig();
  }

  getDefaultPostProcessConfig(): PostProcessConfig {
    return this.postProcess.getDefaultConfig();
  }

  setPostProcessConfig(config: Partial<PostProcessConfig>): PostProcessConfig {
    return this.postProcess.setConfig(config);
  }

  setCloudscapeVisible(visible: boolean): void {
    this.cloudscapeRenderer.setVisible(visible);
  }

  getCloudscapeSnapshot(): CloudscapeSnapshot {
    return this.cloudscapeRenderer.getSnapshot();
  }

  getIslandShadowSnapshot(): IslandShadowSnapshot {
    if (!this.islandShadowSnapshot) this.drawIslandShadow();
    return this.islandShadowSnapshot!;
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

function readSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = window.getComputedStyle(document.body);
  return {
    top: parseCssPx(style.paddingTop),
    right: parseCssPx(style.paddingRight),
    bottom: parseCssPx(style.paddingBottom),
    left: parseCssPx(style.paddingLeft),
  };
}

function parseCssPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
