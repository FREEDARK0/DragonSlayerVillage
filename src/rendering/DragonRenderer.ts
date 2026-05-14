import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { DragonState } from '../models/Dragon';
import { DragonPersonalityType } from '../config/dragonTypes';
import { edgeBreathSectors, sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';
import { getDragonBehavior } from '../effects/DragonBehaviorRegistry';
import { TooltipPanel } from '../ui/TooltipPanel';

export class DragonRenderer {
  private container: Container;
  private dragonGraphics: Map<string, Container> = new Map();
  private previewOutline: Graphics;
  private tooltip: TooltipPanel;
  private rotationDeg = 0;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'DragonRenderer';
    this.container.eventMode = 'static';
    renderer.getLayer(5).addChild(this.container);

    this.previewOutline = new Graphics();
    this.previewOutline.label = 'DragonPreviewOutline';
    renderer.getLayer(3).addChild(this.previewOutline);

    this.tooltip = new TooltipPanel(renderer, 'DragonTooltip');
  }

  clear(): void {
    this.container.removeChildren();
    this.dragonGraphics.clear();
    this.previewOutline.clear();
    this.tooltip.hide();
  }

  render(dragons: DragonState[], rotationDeg: number = 0, nightStart?: number, nightLen?: number): void {
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
      }
    }

    const outerR = R * 1.25;

    for (const dragon of alive) {
      const a1 = (dragon.edgeIndex * Math.PI) / 4;
      const a2 = ((dragon.edgeIndex + 1) * Math.PI) / 4;
      const ma = (a1 + a2) / 2;
      const x = cx + Math.cos(ma) * outerR;
      const y = cy + Math.sin(ma) * outerR;

      const inNight = nightSet.has(dragon.edgeIndex);
      if (inNight) {
        const existing = this.dragonGraphics.get(dragon.id);
        if (existing) existing.visible = false;
        continue;
      }

      let dContainer = this.dragonGraphics.get(dragon.id);
      if (!dContainer) {
        dContainer = new Container();
        dContainer.label = `Dragon-${dragon.id}`;
        dContainer.eventMode = 'static';
        dContainer.cursor = 'pointer';

        dContainer.on('pointerover', () => {
          dContainer!.scale.set(1.1);
          this.drawPreviewOutline(dragon);
          this.showDragonTooltip(dragon, x, y);
        });
        dContainer.on('pointerout', () => {
          dContainer!.scale.set(1.0);
          this.previewOutline.clear();
          this.hideDragonTooltip();
        });

        this.container.addChild(dContainer);
        this.dragonGraphics.set(dragon.id, dContainer);
      }

      dContainer.visible = true;
      dContainer.alpha = 1;
      dContainer.position.set(x, y);
      this.redrawDragon(dContainer, dragon);
    }
  }

  private redrawDragon(container: Container, dragon: DragonState): void {
    container.removeChildren();
    const g = new Graphics();
    const size = 45;

    switch (dragon.personality) {
      case DragonPersonalityType.ARROGANT:
        this.drawArrogantDragon(g, size, dragon.color);
        break;
      case DragonPersonalityType.GLUTTONOUS:
        this.drawGluttonousDragon(g, size, dragon.color);
        break;
      case DragonPersonalityType.DESTRUCTIVE:
        this.drawDestructiveDragon(g, size, dragon.color);
        break;
      case DragonPersonalityType.GOLD:
        this.drawGoldDragon(g, size, dragon.color);
        break;
      case DragonPersonalityType.WYVERN:
        this.drawWyvernDragon(g, size, dragon.color);
        break;
      case DragonPersonalityType.BRUTAL:
        this.drawBrutalDragon(g, size, dragon.color);
        break;
      default:
        this.drawArrogantDragon(g, size, dragon.color);
        break;
    }

    const atkText = new Text({
      text: `攻${dragon.attack}`,
      style: {
        fontFamily: 'monospace',
        fontSize: 16,
        fill: 0xff4444,
        fontWeight: 'bold',
        align: 'center',
        stroke: { color: 0x000000, width: 3 },
      },
    });
    atkText.anchor.set(0.5, 1);
    atkText.position.set(0, size + 6);

    const hpRatio = dragon.maxHp > 0 ? dragon.hp / dragon.maxHp : 0;
    const barWidth = size * 1.5;
    const barHeight = 6;
    g.roundRect(-barWidth / 2, size + 8, barWidth, barHeight, 2);
    g.fill(0x333333);
    g.roundRect(-barWidth / 2, size + 8, barWidth * hpRatio, barHeight, 2);
    g.fill(hpRatio > 0.3 ? 0x44cc44 : 0xcc4444);

    const nameText = new Text({
      text: `${dragon.name} ${dragon.hp}/${dragon.maxHp}`,
      style: {
        fontFamily: 'monospace',
        fontSize: 11,
        fill: 0xffffff,
        align: 'center',
      },
    });
    nameText.anchor.set(0.5, 0);
    nameText.position.set(0, size + 16);

    container.addChild(g);
    container.addChild(atkText);
    container.addChild(nameText);
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

  private drawGoldDragon(g: Graphics, size: number, color: number): void {
    g.ellipse(0, size * 0.1, size * 0.35, size * 0.7);
    g.fill(color);
    g.stroke({ width: 1.5, color: 0xffdd44 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      g.circle(Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.5, size * 0.12);
      g.fill(0xffdd44);
    }
    g.circle(0, -size * 0.2, size * 0.1);
    g.fill(0xffffff);
  }

  private drawBrutalDragon(g: Graphics, size: number, color: number): void {
    g.ellipse(0, -size * 0.05, size * 0.5, size * 0.65);
    g.fill(color);
    g.stroke({ width: 2, color: 0xff0000 });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4;
      g.poly([Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.6, Math.cos(a) * size * 0.7, Math.sin(a) * size * 0.95, Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.55]);
      g.fill(0x880000);
    }
    g.circle(-size * 0.15, -size * 0.25, size * 0.13);
    g.fill(0xff4400);
    g.circle(size * 0.15, -size * 0.25, size * 0.13);
    g.fill(0xff4400);
  }

  private drawWyvernDragon(g: Graphics, size: number, color: number): void {
    g.ellipse(0, size * 0.05, size * 0.3, size * 0.65);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.35) });
    g.poly([-size * 0.25, -size * 0.1, -size * 1.05, -size * 0.75, -size * 0.75, size * 0.25]);
    g.fill(darkenColor(color, 0.25));
    g.poly([size * 0.25, -size * 0.1, size * 1.05, -size * 0.75, size * 0.75, size * 0.25]);
    g.fill(darkenColor(color, 0.25));
    g.poly([0, -size * 0.75, size * 0.22, -size * 0.25, -size * 0.22, -size * 0.25]);
    g.fill(lightenColor(color, 0.15));
    g.circle(-size * 0.08, -size * 0.42, size * 0.08);
    g.fill(0xffffff);
    g.circle(size * 0.08, -size * 0.42, size * 0.08);
    g.fill(0xffffff);
  }

  animateAttack(dragonId: string): void {
    const dContainer = this.dragonGraphics.get(dragonId);
    if (!dContainer) return;

    let frame = 0;
    const tick = () => {
      frame++;
      if (frame <= 40) {
        const t = frame / 40;
        const s = 1 + 0.4 * Math.sin(t * Math.PI / 2);
        dContainer.scale.set(s);
      } else if (frame <= 80) {
      } else if (frame <= 120) {
        const t = (frame - 80) / 40;
        const s = 1.4 - 0.4 * Math.sin(t * Math.PI / 2);
        dContainer.scale.set(s);
      } else {
        dContainer.scale.set(1);
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  animateHit(dragonId: string): void {
    const dContainer = this.dragonGraphics.get(dragonId);
    if (!dContainer || !dContainer.visible) return;

    const flash = new Graphics();
    flash.circle(0, 0, 58);
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
      dContainer.scale.set(s);
      flash.alpha = 0.78 * (1 - t);
      if (frame >= duration) {
        dContainer.scale.set(1);
        if (flash.parent) dContainer.removeChild(flash);
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  animateDepart(dragonId: string): void {
    const dContainer = this.dragonGraphics.get(dragonId);
    if (!dContainer || !dContainer.visible) return;

    let frame = 0;
    const duration = 24;
    const tick = () => {
      frame++;
      const t = Math.min(frame / duration, 1);
      const s = Math.max(0, Math.pow(1 - t, 1.8));
      dContainer.scale.set(s);
      dContainer.alpha = 1 - t;
      if (frame >= duration) {
        dContainer.scale.set(0);
        dContainer.alpha = 0;
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

  private drawArrogantDragon(g: Graphics, size: number, color: number): void {
    g.poly([0, -size, size * 0.5, -size * 0.3, size * 0.7, size * 0.5, size * 0.2, size * 0.8, -size * 0.2, size * 0.8, -size * 0.7, size * 0.5, -size * 0.5, -size * 0.3]);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.3) });
    g.poly([-size * 0.5, -size * 0.3, -size, -size * 0.4, -size * 0.7, size * 0.1]);
    g.fill(darkenColor(color, 0.3));
    g.poly([size * 0.5, -size * 0.3, size, -size * 0.4, size * 0.7, size * 0.1]);
    g.fill(darkenColor(color, 0.3));
    g.circle(size * 0.2, -size * 0.3, size * 0.12);
    g.fill(0xffff00);
  }

  private drawGluttonousDragon(g: Graphics, size: number, color: number): void {
    g.ellipse(0, size * 0.1, size * 0.8, size * 0.7);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.3) });
    g.ellipse(0, size * 0.3, size * 0.5, size * 0.4);
    g.fill(lightenColor(color, 0.2));
    g.poly([-size * 0.6, -size * 0.2, -size * 0.9, -size, -size * 0.3, -size * 0.5]);
    g.fill(darkenColor(color, 0.2));
    g.poly([size * 0.6, -size * 0.2, size * 0.9, -size, size * 0.3, -size * 0.5]);
    g.fill(darkenColor(color, 0.2));
    g.ellipse(0, -size * 0.3, size * 0.2, size * 0.15);
    g.fill(0x882222);
    g.circle(-size * 0.2, -size * 0.4, size * 0.1);
    g.fill(0xffffff);
    g.circle(size * 0.2, -size * 0.4, size * 0.1);
    g.fill(0xffffff);
  }

  private drawDestructiveDragon(g: Graphics, size: number, color: number): void {
    g.poly([0, -size, size * 0.6, -size * 0.4, size * 0.8, size * 0.2, size * 0.4, size * 0.8, -size * 0.4, size * 0.8, -size * 0.8, size * 0.2, -size * 0.6, -size * 0.4]);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.3) });
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (Math.PI * (i / 4));
      const sx = Math.cos(angle) * size * 0.7;
      const sy = Math.sin(angle) * size * 0.7;
      const tipX = Math.cos(angle) * size * 1.1;
      const tipY = Math.sin(angle) * size * 1.1;
      g.poly([sx - 3, sy, tipX, tipY, sx + 3, sy]);
      g.fill(darkenColor(color, 0.4));
    }
    g.poly([-size * 0.5, -size * 0.2, -size * 1.1, -size * 0.8, -size * 0.6, size * 0.3]);
    g.fill(darkenColor(color, 0.3));
    g.poly([size * 0.5, -size * 0.2, size * 1.1, -size * 0.8, size * 0.6, size * 0.3]);
    g.fill(darkenColor(color, 0.3));
    g.circle(-size * 0.2, -size * 0.3, size * 0.15);
    g.fill(0xff4444);
    g.circle(size * 0.2, -size * 0.3, size * 0.15);
    g.fill(0xff4444);
  }
}

function lightenColor(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * (1 + factor)));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * (1 + factor)));
  const b = Math.min(255, Math.floor((color & 0xff) * (1 + factor)));
  return (r << 16) | (g << 8) | b;
}

function darkenColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * (1 - factor));
  const g = Math.floor(((color >> 8) & 0xff) * (1 - factor));
  const b = Math.floor((color & 0xff) * (1 - factor));
  return (r << 16) | (g << 8) | b;
}
