import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';
import { RenderLayer } from '../rendering/GameRenderer';

export interface TooltipLine {
  text: string;
  color?: number;
  bold?: boolean;
}

export class TooltipPanel {
  private container: Container;

  constructor(private renderer: GameRenderer, label: string = 'TooltipPanel') {
    this.container = new Container();
    this.container.label = label;
    this.container.visible = false;
    renderer.getLayer(RenderLayer.UI).addChild(this.container);
  }

  show(lines: TooltipLine[], anchorX: number, anchorY: number): void {
    this.container.removeChildren();
    this.container.visible = true;

    const width = 230;
    const lineHeight = 18;
    const height = 18 + lines.length * lineHeight;
    const bg = new Graphics();
    bg.roundRect(0, 0, width, height, 7);
    bg.fill({ color: 0x243748, alpha: 0.92 });
    bg.stroke({ width: 2, color: 0xf4d084, alpha: 0.85 });
    this.container.addChild(bg);

    lines.forEach((line, index) => {
      const text = new Text({
        text: line.text,
        style: {
          fontFamily: 'Arial',
          fontSize: index === 0 ? 14 : 12,
          fill: line.color ?? (index === 0 ? 0xffe2a0 : 0xf7fbff),
          fontWeight: line.bold || index === 0 ? 'bold' : 'normal',
          wordWrap: true,
          wordWrapWidth: width - 18,
        },
      });
      text.position.set(10, 8 + index * lineHeight);
      this.container.addChild(text);
    });

    const above = anchorY > this.renderer.screenH / 2;
    let x = anchorX - width / 2;
    let y = above ? anchorY - height - 70 : anchorY + 70;
    x = Math.max(8, Math.min(this.renderer.screenW - width - 8, x));
    y = Math.max(42, Math.min(this.renderer.screenH - height - 8, y));
    this.container.position.set(x, y);
  }

  hide(): void {
    this.container.visible = false;
    this.container.removeChildren();
  }

  isVisible(): boolean {
    return this.container.visible;
  }
}
