import { Container, Sprite, Texture } from 'pixi.js';
import { GameRenderer, RenderLayer } from './GameRenderer';
import { SECTOR_COUNT, sectorStartAngle } from '../utils/SectorUtils';

const NIGHT_SOLID_COLOR = 0x06111f;
const NIGHT_SOLID_ALPHA = 0.66;
const NIGHT_FEATHER_RAD = 0.06;
const FULL_CIRCLE = Math.PI * 2;

export interface NightOverlaySnapshot {
  visibleSectors: number;
  textureLoaded: boolean;
  featherPx: number;
  radialFeatherPx: number;
  textureScale: number;
  textureUrl: string;
  usesTexture: boolean;
  solidColor: number;
  solidAlpha: number;
  mergedShape: boolean;
  internalBoundaryFeathers: boolean;
  screenMaskEnabled: boolean;
  radialBoardCutout: boolean;
}

export class NightOverlayRenderer {
  private container: Container;
  private sprite: Sprite | null = null;
  private texture: Texture | null = null;
  private featherPx = 0;
  private snapshot: NightOverlaySnapshot = {
    visibleSectors: 0,
    textureLoaded: false,
    featherPx: this.featherPx,
    radialFeatherPx: this.featherPx,
    textureScale: 0,
    textureUrl: '',
    usesTexture: false,
    solidColor: NIGHT_SOLID_COLOR,
    solidAlpha: NIGHT_SOLID_ALPHA,
    mergedShape: true,
    internalBoundaryFeathers: false,
    screenMaskEnabled: true,
    radialBoardCutout: false,
  };

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'NightScreenMaskOverlay';
    this.container.eventMode = 'none';
    renderer.getLayer(RenderLayer.NIGHT).addChild(this.container);
  }

  async preload(): Promise<void> {
    this.snapshot.textureLoaded = false;
  }

  render(nightStart: number, nightLength: number): void {
    this.snapshot.visibleSectors = Math.max(0, Math.min(SECTOR_COUNT, nightLength));
    this.snapshot.featherPx = this.featherPx;
    this.snapshot.radialFeatherPx = 0;
    this.snapshot.textureScale = 0;
    this.snapshot.usesTexture = false;
    this.snapshot.solidColor = NIGHT_SOLID_COLOR;
    this.snapshot.solidAlpha = NIGHT_SOLID_ALPHA;
    this.snapshot.mergedShape = true;
    this.snapshot.internalBoundaryFeathers = false;
    this.snapshot.screenMaskEnabled = true;
    this.snapshot.radialBoardCutout = false;
    this.container.removeChildren();
    this.texture?.destroy(true);
    this.texture = null;
    this.sprite = null;
    if (nightLength <= 0) return;

    const canvas = this.createNightCanvas(nightStart, nightLength);
    this.texture = Texture.from(canvas);
    this.sprite = new Sprite(this.texture);
    this.sprite.eventMode = 'none';
    this.sprite.label = 'NightScreenMaskSprite';
    this.container.addChild(this.sprite);
  }

  getSnapshot(): NightOverlaySnapshot {
    return { ...this.snapshot };
  }

  private createNightCanvas(nightStart: number, nightLength: number): HTMLCanvasElement {
    const width = Math.max(2, Math.ceil(this.renderer.screenW));
    const height = Math.max(2, Math.ceil(this.renderer.screenH));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(width, height);
    const data = image.data;
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const start = normalizeAngle(sectorStartAngle(nightStart, 0));
    const span = nightLength >= SECTOR_COUNT ? FULL_CIRCLE : nightLength * (FULL_CIRCLE / SECTOR_COUNT);
    const end = start + span;
    const color = {
      r: (NIGHT_SOLID_COLOR >> 16) & 0xff,
      g: (NIGHT_SOLID_COLOR >> 8) & 0xff,
      b: NIGHT_SOLID_COLOR & 0xff,
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const angle = normalizeAngle(Math.atan2(dy, dx));
        const angularDistance = nightLength >= SECTOR_COUNT ? 0 : distanceFromNightRange(angle, start, end);
        const feather = nightLength >= SECTOR_COUNT ? 1 : 1 - smoothstep(0, NIGHT_FEATHER_RAD, angularDistance);
        if (feather <= 0) continue;
        const alpha = Math.round(255 * NIGHT_SOLID_ALPHA * feather);
        if (alpha <= 0) continue;
        const offset = (y * width + x) * 4;
        data[offset] = color.r;
        data[offset + 1] = color.g;
        data[offset + 2] = color.b;
        data[offset + 3] = alpha;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }
}

function distanceFromNightRange(angle: number, start: number, end: number): number {
  const shifted = angle < start ? angle + FULL_CIRCLE : angle;
  if (shifted >= start && shifted <= end) return 0;
  const distanceToStart = Math.min(Math.abs(angle - start), FULL_CIRCLE - Math.abs(angle - start));
  const normalizedEnd = normalizeAngle(end);
  const distanceToEnd = Math.min(Math.abs(angle - normalizedEnd), FULL_CIRCLE - Math.abs(angle - normalizedEnd));
  return Math.min(distanceToStart, distanceToEnd);
}

function normalizeAngle(angle: number): number {
  return ((angle % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
