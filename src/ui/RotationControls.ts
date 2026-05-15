import { Container, Graphics } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';

type RotationDirection = 'clockwise' | 'counterclockwise';

interface ButtonLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface RotationControlsSnapshot {
  clockwise: ButtonLayout;
  counterclockwise: ButtonLayout;
}

export class RotationControls {
  private container: Container;
  private lastLayout: RotationControlsSnapshot = emptyLayout();
  onRotate: ((delta: number) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'RotationControls';
    renderer.getLayer(RenderLayer.UI).addChild(this.container);
  }

  draw(disabled: boolean = false): void {
    this.container.removeChildren();
    this.lastLayout = this.buildLayout();
    this.drawButton(this.lastLayout.clockwise, 'clockwise', disabled);
    this.drawButton(this.lastLayout.counterclockwise, 'counterclockwise', disabled);
  }

  getLayoutSnapshot(): RotationControlsSnapshot {
    return {
      clockwise: { ...this.lastLayout.clockwise },
      counterclockwise: { ...this.lastLayout.counterclockwise },
    };
  }

  private drawButton(layout: ButtonLayout, direction: RotationDirection, disabled: boolean): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 8);
    g.fill({ color: disabled ? 0x24323a : 0x1f3e52, alpha: disabled ? 0.48 : 0.92 });
    g.stroke({ width: 2, color: disabled ? 0x6d7b82 : 0x8fd0dc, alpha: disabled ? 0.5 : 0.9 });
    g.eventMode = 'static';
    g.cursor = disabled ? 'default' : 'pointer';
    g.on('pointerdown', (event) => {
      event.stopPropagation();
      this.onUiPointerActivity?.(event);
      if (!disabled) this.onRotate?.(direction === 'clockwise' ? 45 : -45);
    });
    this.container.addChild(g);

    const icon = new Graphics();
    this.drawCurvedArrow(icon, layout, direction, disabled);
    icon.eventMode = 'none';
    this.container.addChild(icon);
  }

  private drawCurvedArrow(icon: Graphics, layout: ButtonLayout, direction: RotationDirection, disabled: boolean): void {
    const cx = layout.centerX;
    const cy = layout.centerY + layout.height * 0.02;
    const clockwise = direction === 'clockwise';
    const color = disabled ? 0xb4c0c5 : 0xf4fbff;
    const shadowColor = 0x10202a;
    const radius = Math.min(layout.width, layout.height) * 0.29;
    const thickness = Math.max(6, radius * 0.42);
    const sweep = Math.PI * 1.28;
    const visualRotation = clockwise ? Math.PI / 2 : -Math.PI / 2;
    const unrotatedEnd = clockwise ? Math.PI : 0;
    const end = unrotatedEnd + visualRotation;
    const start = clockwise ? end - sweep : end + sweep;

    this.drawArrowArcBand(icon, cx, cy, radius, thickness + 4, start, end);
    icon.fill({ color: shadowColor, alpha: 0.72 });
    this.drawArrowArcBand(icon, cx, cy, radius, thickness, start, end);
    icon.fill({ color, alpha: disabled ? 0.72 : 0.98 });

    const headAngle = end;
    const tangent = headAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
    this.drawArrowHead(icon, cx, cy, radius, thickness, end, tangent, radius * 0.92, radius * 0.98, shadowColor, 0.72);
    this.drawArrowHead(icon, cx, cy, radius, thickness, end, tangent, radius * 0.78, radius * 0.8, color, disabled ? 0.72 : 1);

    const glintStart = clockwise ? start + sweep * 0.2 : start - sweep * 0.2;
    const glintEnd = clockwise ? start + sweep * 0.42 : start - sweep * 0.42;
    this.drawArrowArcBand(icon, cx, cy, radius - thickness * 0.18, Math.max(1.4, thickness * 0.18), glintStart, glintEnd);
    icon.fill({ color: 0xffffff, alpha: disabled ? 0.1 : 0.28 });
  }

  private drawArrowHead(
    icon: Graphics,
    cx: number,
    cy: number,
    radius: number,
    thickness: number,
    headAngle: number,
    tangent: number,
    headLength: number,
    headWidth: number,
    color: number,
    alpha: number,
  ): void {
    const normalX = -Math.sin(tangent);
    const normalY = Math.cos(tangent);
    const tipRadius = radius + thickness * 0.46;
    const baseRadius = radius - thickness * 0.04;
    const tipX = cx + Math.cos(headAngle) * tipRadius;
    const tipY = cy + Math.sin(headAngle) * tipRadius;
    const baseCenterX = tipX - Math.cos(tangent) * headLength;
    const baseCenterY = tipY - Math.sin(tangent) * headLength;
    const bandEndX = cx + Math.cos(headAngle) * baseRadius;
    const bandEndY = cy + Math.sin(headAngle) * baseRadius;
    const baseX = baseCenterX * 0.65 + bandEndX * 0.35;
    const baseY = baseCenterY * 0.65 + bandEndY * 0.35;

    icon.poly([
      tipX, tipY,
      baseX + normalX * headWidth * 0.5, baseY + normalY * headWidth * 0.5,
      baseX - normalX * headWidth * 0.5, baseY - normalY * headWidth * 0.5,
    ]);
    icon.fill({ color, alpha });
  }

  private drawArrowArcBand(
    icon: Graphics,
    cx: number,
    cy: number,
    radius: number,
    thickness: number,
    start: number,
    end: number,
  ): void {
    const steps = 24;
    const outer = radius + thickness / 2;
    const inner = Math.max(1, radius - thickness / 2);
    const points: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = start + (end - start) * t;
      points.push(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const angle = start + (end - start) * t;
      points.push(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    }
    icon.poly(points);
  }

  private buildLayout(): RotationControlsSnapshot {
    const size = Math.max(42, Math.min(58, Math.floor(this.renderer.octagonRadius * 0.22)));
    const gap = Math.max(18, Math.floor(size * 0.44));
    const y = Math.min(this.renderer.screenH - size - 58, this.renderer.octagonCenterY + this.renderer.octagonRadius + 22);
    const leftX = this.renderer.octagonCenterX - size - gap / 2;
    const rightX = this.renderer.octagonCenterX + gap / 2;
    return {
      clockwise: makeLayout(leftX, y, size, size),
      counterclockwise: makeLayout(rightX, y, size, size),
    };
  }
}

function makeLayout(x: number, y: number, width: number, height: number): ButtonLayout {
  return {
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

function emptyLayout(): RotationControlsSnapshot {
  return {
    clockwise: makeLayout(0, 0, 0, 0),
    counterclockwise: makeLayout(0, 0, 0, 0),
  };
}
