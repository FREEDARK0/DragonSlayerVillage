import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';
import { RenderLayer } from '../rendering/GameRenderer';

export interface TooltipLine {
  text: string;
  color?: number;
  bold?: boolean;
}

export interface TooltipLineLayout {
  text: string;
  y: number;
  height: number;
  width: number;
}

export interface TooltipPanelSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TooltipPositionOptions {
  placement?: 'auto' | 'right';
  align?: 'center' | 'top';
}

export class TooltipPanel {
  private container: Container;
  private currentLines: string[] = [];
  private currentLayout: TooltipLineLayout[] = [];
  private currentPanel: TooltipPanelSnapshot = { x: 0, y: 0, width: 0, height: 0 };

  constructor(private renderer: GameRenderer, label: string = 'TooltipPanel') {
    this.container = new Container();
    this.container.label = label;
    this.container.visible = false;
    renderer.getLayer(RenderLayer.UI).addChild(this.container);
  }

  show(lines: TooltipLine[], anchorX: number, anchorY: number, options: TooltipPositionOptions = {}): void {
    this.container.removeChildren();
    this.container.visible = true;
    this.container.eventMode = 'none';
    this.bringToFront();
    this.currentLines = lines.map(line => line.text);
    this.currentLayout = [];

    const width = Math.max(190, Math.min(260, this.renderer.screenW - 16));
    const paddingX = 10;
    const paddingY = 8;
    const lineGap = 4;
    const innerWidth = width - paddingX * 2;
    const textItems: Text[] = [];
    let cursorY = paddingY;

    lines.forEach((line, index) => {
      const text = new Text({
        text: line.text,
        style: {
          fontFamily: 'Arial',
          fontSize: index === 0 ? 14 : 12,
          fill: line.color ?? (index === 0 ? 0xffe2a0 : 0xf7fbff),
          fontWeight: line.bold || index === 0 ? 'bold' : 'normal',
          wordWrap: true,
          wordWrapWidth: innerWidth,
          breakWords: true,
          lineHeight: index === 0 ? 20 : 18,
        },
      });
      const height = Math.ceil(text.height);
      text.position.set(paddingX, cursorY);
      this.currentLayout.push({ text: line.text, y: cursorY, height, width: Math.ceil(text.width) });
      textItems.push(text);
      cursorY += height + lineGap;
    });

    const height = cursorY - lineGap + paddingY;
    const bg = new Graphics();
    bg.roundRect(0, 0, width, height, 7);
    bg.fill({ color: 0x243748, alpha: 0.92 });
    bg.stroke({ width: 2, color: 0xf4d084, alpha: 0.85 });
    this.container.addChild(bg);
    for (const text of textItems) this.container.addChild(text);

    let x = anchorX - width / 2;
    let y = anchorY;
    if (options.placement === 'right') {
      x = anchorX;
      y = options.align === 'top' ? anchorY : anchorY - height / 2;
    } else {
      const above = anchorY > this.renderer.screenH / 2;
      y = above ? anchorY - height - 70 : anchorY + 70;
    }
    x = Math.max(8, Math.min(this.renderer.screenW - width - 8, x));
    y = Math.max(42, Math.min(this.renderer.screenH - height - 8, y));
    this.container.position.set(x, y);
    this.currentPanel = { x, y, width, height };
  }

  hide(): void {
    this.container.visible = false;
    this.container.removeChildren();
    this.currentLines = [];
    this.currentLayout = [];
    this.currentPanel = { x: 0, y: 0, width: 0, height: 0 };
  }

  isVisible(): boolean {
    return this.container.visible;
  }

  getLines(): string[] {
    return [...this.currentLines];
  }

  getLineLayout(): TooltipLineLayout[] {
    return this.currentLayout.map(line => ({ ...line }));
  }

  getPanelSnapshot(): TooltipPanelSnapshot {
    return { ...this.currentPanel };
  }

  bringToFront(): void {
    const parent = this.container.parent;
    if (parent) parent.addChild(this.container);
  }
}
