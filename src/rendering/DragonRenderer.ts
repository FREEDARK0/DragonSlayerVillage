import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { DragonState } from '../models/Dragon';
import { DragonPersonalityType } from '../config/dragonTypes';
import { GAME_CONSTANTS } from '../config/constants';

export class DragonRenderer {
  private container: Container;
  private dragonGraphics: Map<string, Container> = new Map();

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'DragonRenderer';
    this.container.eventMode = 'static';
    renderer.getLayer(4).addChild(this.container);
  }

  /** 清除所有龙 */
  clear(): void {
    this.container.removeChildren();
    this.dragonGraphics.clear();
  }

  /** 渲染所有龙立绘在上半圆弧上 */
  render(dragons: DragonState[]): void {
    const alive = dragons.filter(d => d.isAlive);
    const gridTotalSize = GAME_CONSTANTS.GRID_SIZE * GAME_CONSTANTS.CELL_SIZE;
    const gridCenterX = this.renderer.gridOriginX + gridTotalSize / 2;
    const gridTopY = this.renderer.gridOriginY;

    // Remove dead dragons
    for (const [id, g] of this.dragonGraphics) {
      if (!alive.find(d => d.id === id)) {
        this.container.removeChild(g);
        this.dragonGraphics.delete(id);
      }
    }

    // Arc parameters
    const arcRadius = gridTotalSize * 0.65;
    const arcCenterX = gridCenterX;
    const arcCenterY = gridTopY + gridTotalSize * 0.4;
    const startAngle = Math.PI * 0.15;
    const endAngle = Math.PI * 0.85;

    alive.forEach((dragon, i) => {
      const angle = startAngle + (endAngle - startAngle) * (i + 1) / (alive.length + 1);
      const x = arcCenterX - Math.cos(angle) * arcRadius;
      const y = arcCenterY - Math.sin(angle) * arcRadius;

      let dContainer = this.dragonGraphics.get(dragon.id);
      if (!dContainer) {
        dContainer = new Container();
        dContainer.label = `Dragon-${dragon.id}`;
        dContainer.eventMode = 'static';
        dContainer.cursor = 'pointer';

        dContainer.on('pointerover', () => {
          dContainer!.scale.set(1.1);
          this.drawHighlight(dContainer!, dragon);
        });
        dContainer.on('pointerout', () => {
          dContainer!.scale.set(1.0);
          this.redrawDragon(dContainer!, dragon);
        });

        this.container.addChild(dContainer);
        this.dragonGraphics.set(dragon.id, dContainer);
      }

      dContainer.position.set(x, y);
      this.redrawDragon(dContainer, dragon);
    });
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
    }

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
    container.addChild(nameText);
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
