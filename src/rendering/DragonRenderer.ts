import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { DragonState } from '../models/Dragon';
import { DragonPersonalityType } from '../config/dragonTypes';
import { SECTOR_COUNT, edgeBreathSectors, sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';
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
    renderer.getLayer(5).addChild(this.container); // DRAGONS

    this.previewOutline = new Graphics();
    this.previewOutline.label = 'DragonPreviewOutline';
    renderer.getLayer(3).addChild(this.previewOutline);

    this.tooltip = new TooltipPanel(renderer, 'DragonTooltip');
  }

  /** 清除所有龙 */
  clear(): void {
    this.container.removeChildren();
    this.dragonGraphics.clear();
    this.previewOutline.clear();
    this.tooltip.hide();
  }

  /** 渲染所有龙立绘在上半圆弧上 */
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

    // Remove dead dragons
    for (const [id, g] of this.dragonGraphics) {
      if (!alive.find(d => d.id === id)) {
        this.container.removeChild(g);
        this.dragonGraphics.delete(id);
      }
    }

    // Position dragons at octagon vertices (slightly outside)
    const outerR = R * 1.25;

    for (const dragon of alive) {
      // All dragons on edges (midpoint between two vertices)
      const a1 = (dragon.edgeIndex * Math.PI) / 4;
      const a2 = ((dragon.edgeIndex + 1) * Math.PI) / 4;
      const ma = (a1 + a2) / 2;
      const x = cx + Math.cos(ma) * outerR;
      const y = cy + Math.sin(ma) * outerR;

      const inNight = nightSet.has(dragon.edgeIndex);
      if (inNight) {
        const existing = this.dragonGraphics.get(dragon.id);
        if (existing) existing.visible = false;
        continue; // skip rendering, dragon is hidden
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

      dContainer.position.set(x, y);
      this.redrawDragon(dContainer, dragon);
    }
  }

  private redrawDragon(container: Container, dragon: DragonState): void {
    container.removeChildren();
    const g = new Graphics();
    const size = 45;

    // Draw different dragon shapes based on personality
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

    // Attack damage above HP bar
    const atkText = new Text({
      text: `⚔${Math.round(dragon.combatPower * dragon.attackMultiplier)}`,
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

    // HP bar below dragon
    const hpRatio = dragon.combatPower / dragon.maxCombatPower;
    const barWidth = size * 1.5;
    const barHeight = 6;
    g.roundRect(-barWidth / 2, size + 8, barWidth, barHeight, 2);
    g.fill(0x333333);
    g.roundRect(-barWidth / 2, size + 8, barWidth * hpRatio, barHeight, 2);
    g.fill(hpRatio > 0.3 ? 0x44cc44 : 0xcc4444);

    // Name text
    const nameText = new Text({
      text: dragon.name,
      style: {
        fontFamily: 'monospace',
        fontSize: 12,
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

  /** 鼠标悬停时绘制龙将要攻击的区域轮廓 */
  private drawPreviewOutline(dragon: DragonState): void {
    this.previewOutline.clear();
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const rotSteps = Math.round(this.rotationDeg / 45);

    const power = getDragonBehavior(dragon.personality).breathPower(dragon);
    const logicalEdge = ((dragon.edgeIndex - rotSteps) % 8 + 8) % 8;
    const sectors = edgeBreathSectors(logicalEdge, power);

    // Sort for outline drawing
    const sorted = [...sectors].sort((a, b) => a - b);
    const startA = sectorStartAngle(sorted[0], this.rotationDeg);
    const endA = sectorEndAngle(sorted[sorted.length - 1], this.rotationDeg);

    this.previewOutline.moveTo(cx, cy);
    this.previewOutline.lineTo(cx + Math.cos(startA) * R, cy + Math.sin(startA) * R);
    for (const s of sorted) {
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
    const attack = Math.round(dragon.combatPower * dragon.attackMultiplier);
    this.tooltip.show([
      { text: dragon.name },
      { text: `战力: ${dragon.combatPower}/${dragon.maxCombatPower}` },
      { text: `攻击倍率: x${dragon.attackMultiplier.toFixed(2)}  伤害: ${attack}` },
      ...effects.map(effect => ({ text: `- ${effect}` })),
    ], dragonX, dragonY);
  }

  private hideDragonTooltip(): void {
    this.tooltip.hide();
  }

  private drawGoldDragon(g: Graphics, size: number, color: number): void {
    // Sleek serpentine body with treasure aura
    g.ellipse(0, size * 0.1, size * 0.35, size * 0.7);
    g.fill(color);
    g.stroke({ width: 1.5, color: 0xffdd44 });
    // Coins around
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      g.circle(Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.5, size * 0.12);
      g.fill(0xffdd44);
    }
    // Eye
    g.circle(0, -size * 0.2, size * 0.1);
    g.fill(0xffffff);
  }

  private drawBrutalDragon(g: Graphics, size: number, color: number): void {
    // Heavy muscular body
    g.ellipse(0, -size * 0.05, size * 0.5, size * 0.65);
    g.fill(color);
    g.stroke({ width: 2, color: 0xff0000 });
    // Spikes
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4;
      g.poly([Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.6, Math.cos(a) * size * 0.7, Math.sin(a) * size * 0.95, Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.55]);
      g.fill(0x880000);
    }
    // Glowing eyes
    g.circle(-size * 0.15, -size * 0.25, size * 0.13);
    g.fill(0xff4400);
    g.circle(size * 0.15, -size * 0.25, size * 0.13);
    g.fill(0xff4400);
  }

  private drawWyvernDragon(g: Graphics, size: number, color: number): void {
    // Lean body with oversized wings.
    g.ellipse(0, size * 0.05, size * 0.3, size * 0.65);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.35) });

    g.poly([
      -size * 0.25, -size * 0.1,
      -size * 1.05, -size * 0.75,
      -size * 0.75, size * 0.25,
    ]);
    g.fill(darkenColor(color, 0.25));
    g.poly([
      size * 0.25, -size * 0.1,
      size * 1.05, -size * 0.75,
      size * 0.75, size * 0.25,
    ]);
    g.fill(darkenColor(color, 0.25));

    g.poly([
      0, -size * 0.75,
      size * 0.22, -size * 0.25,
      -size * 0.22, -size * 0.25,
    ]);
    g.fill(lightenColor(color, 0.15));

    g.circle(-size * 0.08, -size * 0.42, size * 0.08);
    g.fill(0xffffff);
    g.circle(size * 0.08, -size * 0.42, size * 0.08);
    g.fill(0xffffff);
  }

  /** 龙攻击动画：缓慢放大→停顿→缓慢缩小 */
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

  getDragonScreenPosition(dragonId: string): { x: number; y: number } | null {
    const container = this.dragonGraphics.get(dragonId);
    if (!container || !container.visible) return null;
    return { x: container.position.x, y: container.position.y };
  }

  isTooltipVisible(): boolean {
    return this.tooltip.isVisible();
  }

  private drawHighlight(container: Container, dragon: DragonState): void {
    container.removeChildren();
    const g = new Graphics();
    const size = 45;
    // Glow effect
    g.circle(0, 0, size + 8);
    g.fill({ color: 0xffff88, alpha: 0.2 });
    const innerG = new Graphics();
    this.redrawDragon(container, dragon);
  }

  private drawArrogantDragon(g: Graphics, size: number, color: number): void {
    // Tall, angular dragon with wings spread
    // Body
    g.poly([
      0, -size,
      size * 0.5, -size * 0.3,
      size * 0.7, size * 0.5,
      size * 0.2, size * 0.8,
      -size * 0.2, size * 0.8,
      -size * 0.7, size * 0.5,
      -size * 0.5, -size * 0.3,
    ]);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.3) });

    // Wings
    g.poly([
      -size * 0.5, -size * 0.3,
      -size, -size * 0.4,
      -size * 0.7, size * 0.1,
    ]);
    g.fill(darkenColor(color, 0.3));
    g.poly([
      size * 0.5, -size * 0.3,
      size, -size * 0.4,
      size * 0.7, size * 0.1,
    ]);
    g.fill(darkenColor(color, 0.3));

    // Eye
    g.circle(size * 0.2, -size * 0.3, size * 0.12);
    g.fill(0xffff00);
  }

  private drawGluttonousDragon(g: Graphics, size: number, color: number): void {
    // Round, stout dragon
    g.ellipse(0, size * 0.1, size * 0.8, size * 0.7);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.3) });

    // Belly
    g.ellipse(0, size * 0.3, size * 0.5, size * 0.4);
    g.fill(lightenColor(color, 0.2));

    // Small wings
    g.poly([
      -size * 0.6, -size * 0.2,
      -size * 0.9, -size,
      -size * 0.3, -size * 0.5,
    ]);
    g.fill(darkenColor(color, 0.2));
    g.poly([
      size * 0.6, -size * 0.2,
      size * 0.9, -size,
      size * 0.3, -size * 0.5,
    ]);
    g.fill(darkenColor(color, 0.2));

    // Open mouth
    g.ellipse(0, -size * 0.3, size * 0.2, size * 0.15);
    g.fill(0x882222);

    // Eyes
    g.circle(-size * 0.2, -size * 0.4, size * 0.1);
    g.fill(0xffffff);
    g.circle(size * 0.2, -size * 0.4, size * 0.1);
    g.fill(0xffffff);
  }

  private drawDestructiveDragon(g: Graphics, size: number, color: number): void {
    // Spiky, aggressive dragon
    // Body
    g.poly([
      0, -size,
      size * 0.6, -size * 0.4,
      size * 0.8, size * 0.2,
      size * 0.4, size * 0.8,
      -size * 0.4, size * 0.8,
      -size * 0.8, size * 0.2,
      -size * 0.6, -size * 0.4,
    ]);
    g.fill(color);
    g.stroke({ width: 1.5, color: lightenColor(color, 0.3) });

    // Spikes along back
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (Math.PI * (i / 4));
      const sx = Math.cos(angle) * size * 0.7;
      const sy = Math.sin(angle) * size * 0.7;
      const tipX = Math.cos(angle) * size * 1.1;
      const tipY = Math.sin(angle) * size * 1.1;
      g.poly([
        sx - 3, sy,
        tipX, tipY,
        sx + 3, sy,
      ]);
      g.fill(darkenColor(color, 0.4));
    }

    // Large wings
    g.poly([
      -size * 0.5, -size * 0.2,
      -size * 1.1, -size * 0.8,
      -size * 0.6, size * 0.3,
    ]);
    g.fill(darkenColor(color, 0.3));
    g.poly([
      size * 0.5, -size * 0.2,
      size * 1.1, -size * 0.8,
      size * 0.6, size * 0.3,
    ]);
    g.fill(darkenColor(color, 0.3));

    // Glowing eyes
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
