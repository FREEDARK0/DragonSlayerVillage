import { Container, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';

export class TurnHint {
  private container: Container;
  private label: Text;
  private pulseTime = 0;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'TurnHint';
    this.container.eventMode = 'none';
    renderer.getLayer(RenderLayer.UI).addChild(this.container);

    this.label = new Text({
      text: '点击鼠标左键以结束回合',
      style: {
        fontFamily: 'Arial',
        fontSize: 15,
        fill: 0xf2fbff,
        fontWeight: 'bold',
        stroke: { color: 0x10202a, width: 4 },
      },
    });
    this.label.anchor.set(1, 1);
    this.label.eventMode = 'none';
    this.container.addChild(this.label);

    this.renderer.app.ticker.add(this.updatePulse, this);
  }

  draw(visible: boolean): void {
    this.container.visible = visible;
    this.container.alpha = visible ? 0.92 : 0;
    const marginX = 18;
    const marginY = 18;
    this.label.position.set(this.renderer.screenW - marginX, this.renderer.screenH - marginY);
  }

  isVisible(): boolean {
    return this.container.visible;
  }

  private updatePulse(): void {
    this.pulseTime += this.renderer.app.ticker.deltaMS;
    const pulse = 1.03 + Math.sin(this.pulseTime * 0.003) * 0.03;
    this.label.scale.set(pulse);
  }
}
