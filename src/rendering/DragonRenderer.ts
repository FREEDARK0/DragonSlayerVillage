import { Assets, Circle, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { DragonState } from '../models/Dragon';
import { DragonPersonalityType } from '../config/dragonTypes';
import { DRAGON_TEMPLATES } from '../config/dragonTypes';
import { edgeBreathSectors, sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';
import { getDragonBehavior } from '../effects/DragonBehaviorRegistry';
import { TooltipPanel } from '../ui/TooltipPanel';

const ATTACK_COLOR = 0xd94b4b;
const HP_COLOR = 0x22c7d7;
const DRAGON_IMAGE_SIZE = 45;
const DRAGON_IMAGE_MAX_WIDTH = DRAGON_IMAGE_SIZE * 3.4;
const DRAGON_IMAGE_MAX_HEIGHT = DRAGON_IMAGE_SIZE * 3.25;
const FALLBACK_DRAGON_ASSET_NAME = '临时龙';

type DragonAsset = {
  name: string;
  url: string;
};

type DragonAssetGlobOptions = {
  eager: true;
  query: string;
  import: 'default';
};

interface DragonVisualState {
  spawnFrame: number;
  floatPhase: number;
  hovered: boolean;
  actionScale: number;
  hitScale: number;
  departScale: number;
  departAlpha: number;
  baseX: number;
  baseY: number;
}

declare global {
  interface ImportMeta {
    glob(pattern: string, options: DragonAssetGlobOptions): Record<string, string>;
  }
}

const DRAGON_ASSET_URLS = import.meta.glob('../../assets/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const KNOWN_DRAGON_ASSET_URLS: Record<string, string> = {
  '亚龙': new URL('../../assets/亚龙.png', import.meta.url).href,
  '高傲龙': new URL('../../assets/高傲龙.png', import.meta.url).href,
  '黄金龙': new URL('../../assets/黄金龙.png', import.meta.url).href,
  '火龙': new URL('../../assets/火龙.png', import.meta.url).href,
  '临时龙': new URL('../../assets/临时龙.png', import.meta.url).href,
  '破坏龙': new URL('../../assets/破坏龙.png', import.meta.url).href,
  '贪食龙': new URL('../../assets/贪食龙.png', import.meta.url).href,
};

const DRAGON_ASSETS_BY_STEM = new Map<string, string>(
  [
    ...Object.entries(DRAGON_ASSET_URLS).map(([path, url]) => [normalizeAssetKey(assetStem(path)), url] as const),
    ...Object.entries(KNOWN_DRAGON_ASSET_URLS).map(([name, url]) => [normalizeAssetKey(name), url] as const),
  ],
);

const DRAGON_PERSONALITY_ASSET_NAMES: Partial<Record<DragonPersonalityType, readonly string[]>> = {
  [DragonPersonalityType.WYVERN]: ['亚龙'],
  [DragonPersonalityType.ARROGANT]: ['高傲龙'],
  [DragonPersonalityType.GOLD]: ['黄金龙'],
  [DragonPersonalityType.DESTRUCTIVE]: ['破坏龙'],
  [DragonPersonalityType.BRUTAL]: ['火龙'],
  [DragonPersonalityType.GLUTTONOUS]: ['贪食龙'],
};

const DRAGON_TEMPLATE_ASSET_NAMES: Record<string, readonly string[]> = {
  wyvern: ['亚龙'],
  aurus: ['黄金龙'],
  furo: ['破坏龙'],
  ignis: ['高傲龙'],
  gulo: ['贪食龙'],
  brutus: ['火龙'],
};

export class DragonRenderer {
  private container: Container;
  private dragonGraphics: Map<string, Container> = new Map();
  private renderedDragons: Map<string, { dragon: DragonState; faceRight: boolean }> = new Map();
  private dragonTextures: Map<string, Texture> = new Map();
  private failedDragonAssets: Set<string> = new Set();
  private dragonAssetNames: Map<string, string> = new Map();
  private dragonVisuals: Map<string, DragonVisualState> = new Map();
  private previewOutline: Graphics;
  private tooltip: TooltipPanel;
  private rotationDeg = 0;
  private visualTime = 0;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'DragonRenderer';
    this.container.eventMode = 'static';
    renderer.getLayer(5).addChild(this.container);

    this.previewOutline = new Graphics();
    this.previewOutline.label = 'DragonPreviewOutline';
    renderer.getLayer(3).addChild(this.previewOutline);

    this.tooltip = new TooltipPanel(renderer, 'DragonTooltip');
    this.renderer.app.ticker.add(this.updateVisuals, this);
  }

  async preloadAssets(): Promise<void> {
    this.failedDragonAssets.clear();
    const assetUrls = new Set(DRAGON_ASSETS_BY_STEM.values());
    await Promise.all([...assetUrls].map(async assetUrl => {
      try {
        const texture = await Assets.load(assetUrl) as Texture;
        this.dragonTextures.set(assetUrl, texture);
      } catch {
        this.failedDragonAssets.add(assetUrl);
      }
    }));
  }

  clear(): void {
    this.container.removeChildren();
    this.dragonGraphics.clear();
    this.renderedDragons.clear();
    this.dragonAssetNames.clear();
    this.dragonVisuals.clear();
    this.previewOutline.clear();
    this.tooltip.hide();
  }

  render(
    dragons: DragonState[],
    rotationDeg: number = 0,
    nightStart?: number,
    nightLen?: number,
    statAnims?: Map<string, { scaleX: number; scaleY: number }>,
  ): void {
    this.rotationDeg = rotationDeg;
    const nightSet = new Set<number>();
    if (nightStart !== undefined && nightLen !== undefined) {
      for (let i = 0; i < nightLen; i++) nightSet.add((nightStart + i) % 8);
    }
    const alive = dragons.filter(d => d.isAlive);
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;

    for (const [id, g] of this.dragonGraphics) {
      if (!alive.find(d => d.id === id)) {
        this.container.removeChild(g);
        this.dragonGraphics.delete(id);
        this.renderedDragons.delete(id);
        this.dragonAssetNames.delete(id);
        this.dragonVisuals.delete(id);
      }
    }

    const outerR = R * 1.25;

    for (const dragon of alive) {
      const a1 = (dragon.edgeIndex * Math.PI) / 4;
      const a2 = ((dragon.edgeIndex + 1) * Math.PI) / 4;
      const ma = (a1 + a2) / 2;
      const x = cx + Math.cos(ma) * outerR;
      const y = cy + Math.sin(ma) * outerR;
      const faceRight = x < cx;

      const inNight = nightSet.has(dragon.edgeIndex);
      if (inNight) {
        const existing = this.dragonGraphics.get(dragon.id);
        if (existing) existing.visible = false;
        this.renderedDragons.delete(dragon.id);
        this.dragonAssetNames.delete(dragon.id);
        continue;
      }

      let dContainer = this.dragonGraphics.get(dragon.id);
      if (!dContainer) {
        dContainer = new Container();
        dContainer.label = `Dragon-${dragon.id}`;
        dContainer.eventMode = 'static';
        dContainer.cursor = 'pointer';
        dContainer.hitArea = new Circle(0, 0, 92);
        this.dragonVisuals.set(dragon.id, {
          spawnFrame: 0,
          floatPhase: hashStringToPhase(dragon.id),
          hovered: false,
          actionScale: 1,
          hitScale: 1,
          departScale: 1,
          departAlpha: 1,
          baseX: x,
          baseY: y,
        });

        dContainer.on('pointerover', () => {
          const current = this.renderedDragons.get(dragon.id)?.dragon ?? dragon;
          const visual = this.dragonVisuals.get(dragon.id);
          if (visual) visual.hovered = true;
          this.drawPreviewOutline(current);
          this.showDragonTooltip(current, dContainer!.position.x, dContainer!.position.y);
        });
        dContainer.on('pointerout', () => {
          const visual = this.dragonVisuals.get(dragon.id);
          if (visual) visual.hovered = false;
          this.previewOutline.clear();
          this.hideDragonTooltip();
        });

        this.container.addChild(dContainer);
        this.dragonGraphics.set(dragon.id, dContainer);
      }

      dContainer.visible = true;
      const visual = this.dragonVisuals.get(dragon.id);
      if (visual) {
        visual.baseX = x;
        visual.baseY = y;
      }
      this.applyDragonVisualTransform(dragon.id, dContainer);
      this.renderedDragons.set(dragon.id, { dragon, faceRight });
      this.redrawDragon(dContainer, dragon, faceRight, statAnims);
    }
  }

  private updateVisuals(): void {
    const deltaFrames = Math.max(0.5, Math.min(2, this.renderer.app.ticker.deltaMS / 16.67));
    this.visualTime += this.renderer.app.ticker.deltaMS;
    for (const [id, container] of this.dragonGraphics) {
      const visual = this.dragonVisuals.get(id);
      if (!visual || !container.visible) continue;
      visual.spawnFrame = Math.min(28, visual.spawnFrame + deltaFrames);
      this.applyDragonVisualTransform(id, container);
    }
  }

  private applyDragonVisualTransform(id: string, container: Container): void {
    const visual = this.dragonVisuals.get(id);
    if (!visual) return;
    const floatOffset = Math.sin(this.visualTime * 0.0022 + visual.floatPhase) * 3.2;
    const spawnScale = spawnPopScale(visual.spawnFrame / 28);
    const hoverScale = visual.hovered ? 1.1 : 1;
    const finalScale = spawnScale * hoverScale * visual.actionScale * visual.hitScale * visual.departScale;
    container.position.set(visual.baseX, visual.baseY + floatOffset);
    container.scale.set(finalScale);
    container.alpha = visual.departAlpha;
  }

  private redrawDragon(
    container: Container,
    dragon: DragonState,
    faceRight: boolean,
    statAnims?: Map<string, { scaleX: number; scaleY: number }>,
  ): void {
    container.removeChildren();
    const size = DRAGON_IMAGE_SIZE;

    const art = new Container();
    art.label = `DragonArt-${dragon.id}`;
    art.eventMode = 'none';
    art.scale.x = faceRight ? -1 : 1;

    const asset = this.resolveDragonAsset(dragon);
    const texture = this.getDragonTexture(asset);
    const artMaxWidth = Math.min(DRAGON_IMAGE_MAX_WIDTH, this.renderer.octagonRadius * 0.84);
    const artMaxHeight = Math.min(DRAGON_IMAGE_MAX_HEIGHT, this.renderer.octagonRadius * 0.82);
    this.dragonAssetNames.set(dragon.id, asset.name);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(0, size * 0.08);
    const spriteScale = Math.min(
      artMaxWidth / Math.max(texture.width, 1),
      artMaxHeight / Math.max(texture.height, 1),
    );
    sprite.scale.set(spriteScale);
    art.addChild(sprite);

    const statGraphics = new Graphics();
    const statWidth = size * 1.85;
    const statHeight = 22;
    const statY = artMaxHeight * 0.36;
    this.drawStatBar(statGraphics, statWidth, statHeight, statY);

    const atkText = this.createStatText(`${dragon.attack}`, 15);
    atkText.position.set(-statWidth * 0.25, statY);
    const attackAnim = statAnims?.get(`dragon:${dragon.id}:attack`);
    if (attackAnim) atkText.scale.set(attackAnim.scaleX, attackAnim.scaleY);
    const hpText = this.createStatText(`${dragon.hp}`, 15);
    hpText.position.set(statWidth * 0.25, statY);
    const hpAnim = statAnims?.get(`dragon:${dragon.id}:hp`);
    if (hpAnim) hpText.scale.set(hpAnim.scaleX, hpAnim.scaleY);

    container.addChild(art);
    container.addChild(statGraphics);
    container.addChild(atkText);
    container.addChild(hpText);
  }

  private drawStatBar(g: Graphics, width: number, height: number, centerY: number): void {
    const half = width / 2;
    const y = centerY - height / 2;
    g.roundRect(-half, y, width, height, 7);
    g.fill({ color: 0x0d1b24, alpha: 0.82 });
    g.stroke({ width: 1.4, color: 0xd8f2f7, alpha: 0.48 });
    g.roundRect(-half + 3, y + 3, half - 4, height - 6, 6);
    g.fill({ color: ATTACK_COLOR, alpha: 0.9 });
    g.roundRect(1, y + 3, half - 4, height - 6, 6);
    g.fill({ color: HP_COLOR, alpha: 0.9 });
    g.rect(-0.5, y + 4, 1, height - 8);
    g.fill({ color: 0xf4fbff, alpha: 0.28 });
    g.rect(-half + 7, y + 3, width - 14, 1);
    g.fill({ color: 0xffffff, alpha: 0.16 });
  }

  private createStatText(text: string, fontSize: number): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: 'monospace',
        fontSize,
        fill: 0xffffff,
        fontWeight: 'bold',
        align: 'center',
        stroke: { color: 0x10202a, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.eventMode = 'none';
    return label;
  }

  getDragonAssetName(dragon: DragonState): string | null {
    return this.dragonAssetNames.get(dragon.id) ?? this.resolveDragonAsset(dragon).name;
  }

  getTemplateAssetNames(): Record<string, string | null> {
    const names: Record<string, string | null> = {};
    for (const template of DRAGON_TEMPLATES) {
      names[template.id] = this.resolveDragonAsset({
        id: template.id,
        templateId: template.id,
        name: template.name,
        personality: template.personality,
        hp: template.hp,
        maxHp: template.hp,
        attack: template.attack,
        breathRange: template.breathRange,
        color: template.color,
        isAlive: true,
        turnCounter: 0,
        damageDealt: 0,
        damageThreshold: 0,
        announcedTargets: null,
        hasTakenDamage: false,
        attackCount: 0,
        respawnAvailableTurn: null,
        edgeIndex: 0,
      }).name;
    }
    return names;
  }

  private resolveDragonAsset(dragon: DragonState): DragonAsset {
    const candidates = [
      dragon.name,
      dragon.templateId,
      dragon.personality,
      ...(DRAGON_TEMPLATE_ASSET_NAMES[dragon.templateId] ?? []),
      ...(DRAGON_PERSONALITY_ASSET_NAMES[dragon.personality] ?? []),
    ];
    for (const candidate of candidates) {
      const asset = this.resolveAssetByName(candidate);
      if (asset) return this.resolveFailedAssetFallback(asset);
    }
    return this.resolveFailedAssetFallback(this.requireFallbackAsset());
  }

  private resolveAssetByName(name: string): DragonAsset | null {
    const assetUrl = DRAGON_ASSETS_BY_STEM.get(normalizeAssetKey(name));
    return assetUrl ? { name, url: assetUrl } : null;
  }

  private resolveFailedAssetFallback(asset: DragonAsset): DragonAsset {
    if (!this.failedDragonAssets.has(asset.url)) return asset;
    const fallback = this.requireFallbackAsset();
    return fallback.url === asset.url ? fallback : fallback;
  }

  private requireFallbackAsset(): DragonAsset {
    return this.resolveAssetByName(FALLBACK_DRAGON_ASSET_NAME) ?? {
      name: FALLBACK_DRAGON_ASSET_NAME,
      url: KNOWN_DRAGON_ASSET_URLS[FALLBACK_DRAGON_ASSET_NAME],
    };
  }

  private getDragonTexture(asset: DragonAsset): Texture {
    const texture = this.dragonTextures.get(asset.url);
    if (texture) return texture;
    if (this.failedDragonAssets.has(asset.url)) return Texture.EMPTY;
    const fallbackTexture = Texture.from(asset.url);
    this.dragonTextures.set(asset.url, fallbackTexture);
    return fallbackTexture;
  }

  private drawPreviewOutline(dragon: DragonState): void {
    this.previewOutline.clear();
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const rotSteps = Math.round(this.rotationDeg / 45);

    const power = getDragonBehavior(dragon.personality).breathPower(dragon);
    const logicalEdge = ((dragon.edgeIndex - rotSteps) % 8 + 8) % 8;
    const sectors = edgeBreathSectors(logicalEdge, power);

    const startA = sectorStartAngle(sectors[0], this.rotationDeg);
    this.previewOutline.moveTo(cx, cy);
    this.previewOutline.lineTo(cx + Math.cos(startA) * R, cy + Math.sin(startA) * R);
    for (const s of sectors) {
      const a = sectorEndAngle(s, this.rotationDeg);
      this.previewOutline.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    this.previewOutline.lineTo(cx, cy);
    this.previewOutline.closePath();
    this.previewOutline.stroke({ width: 4, color: 0xff4444, alpha: 0.85, join: 'round' });
  }

  private showDragonTooltip(dragon: DragonState, dragonX: number, dragonY: number): void {
    const behavior = getDragonBehavior(dragon.personality);
    const effects = behavior.effectDescriptions?.(dragon) ?? ['标准吐息'];
    this.tooltip.show([
      { text: dragon.name },
      { text: `HP: ${dragon.hp}/${dragon.maxHp}` },
      { text: `攻击力: ${dragon.attack}` },
      ...effects.map(effect => ({ text: `- ${effect}` })),
    ], dragonX, dragonY);
  }

  private hideDragonTooltip(): void {
    this.tooltip.hide();
  }

  animateAttack(dragonId: string): void {
    const visual = this.dragonVisuals.get(dragonId);
    if (!visual) return;

    let frame = 0;
    const tick = () => {
      frame++;
      if (frame <= 40) {
        const t = frame / 40;
        const s = 1 + 0.4 * Math.sin(t * Math.PI / 2);
        visual.actionScale = s;
      } else if (frame <= 80) {
      } else if (frame <= 120) {
        const t = (frame - 80) / 40;
        const s = 1.4 - 0.4 * Math.sin(t * Math.PI / 2);
        visual.actionScale = s;
      } else {
        visual.actionScale = 1;
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  animateHit(dragonId: string): void {
    const dContainer = this.dragonGraphics.get(dragonId);
    const visual = this.dragonVisuals.get(dragonId);
    if (!dContainer || !dContainer.visible || !visual) return;

    const flash = new Graphics();
    flash.circle(0, 0, 82);
    flash.fill({ color: 0xffffff, alpha: 0.78 });
    flash.label = `DragonHitFlash-${dragonId}`;
    dContainer.addChild(flash);

    let frame = 0;
    const duration = 18;
    const tick = () => {
      frame++;
      const t = Math.min(frame / duration, 1);
      const s = t < 0.38
        ? 1 - 0.28 * Math.sin((t / 0.38) * Math.PI / 2)
        : 0.72 + 0.28 * Math.sin(((t - 0.38) / 0.62) * Math.PI / 2) + Math.sin(t * Math.PI * 2) * 0.06 * (1 - t);
      visual.hitScale = s;
      flash.alpha = 0.78 * (1 - t);
      if (frame >= duration) {
        visual.hitScale = 1;
        if (flash.parent) dContainer.removeChild(flash);
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  animateDepart(dragonId: string): void {
    const dContainer = this.dragonGraphics.get(dragonId);
    const visual = this.dragonVisuals.get(dragonId);
    if (!dContainer || !dContainer.visible || !visual) return;

    let frame = 0;
    const duration = 24;
    const tick = () => {
      frame++;
      const t = Math.min(frame / duration, 1);
      const s = Math.max(0, Math.pow(1 - t, 1.8));
      visual.departScale = s;
      visual.departAlpha = 1 - t;
      if (frame >= duration) {
        visual.departScale = 0;
        visual.departAlpha = 0;
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  getDragonScreenPosition(dragonId: string): { x: number; y: number } | null {
    const container = this.dragonGraphics.get(dragonId);
    if (!container || !container.visible) return null;
    return { x: container.position.x, y: container.position.y };
  }

  isTooltipVisible(): boolean {
    return this.tooltip.isVisible();
  }
}

function assetStem(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/');
  const fileName = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1);
  const extensionIndex = fileName.lastIndexOf('.');
  return extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function normalizeAssetKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function spawnPopScale(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.46) {
    const p = clamped / 0.46;
    return 0.08 + easeOutBack(p) * 1.1;
  }
  if (clamped < 0.72) {
    const p = (clamped - 0.46) / 0.26;
    return 1.18 + (0.94 - 1.18) * easeOutCubic(p);
  }
  const p = (clamped - 0.72) / 0.28;
  return 0.94 + (1 - 0.94) * easeOutCubic(p);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function hashStringToPhase(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return (hash % 6283) / 1000;
}
