import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';

export class HUD {
  private container: Container;
  private turnBg: Graphics;
  private turnText: Text;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'HUD';
    renderer.getLayer(RenderLayer.UI).addChild(this.container);

    this.turnBg = new Graphics();
    this.turnBg.eventMode = 'none';
    this.container.addChild(this.turnBg);

    this.turnText = new Text({
      text: '回合 0',
      style: {
        fontFamily: 'Arial',
        fontSize: 15,
        fill: 0xf2fbff,
        fontWeight: 'bold',
        stroke: { color: 0x10202a, width: 3 },
      },
    });
    this.turnText.anchor.set(0, 0.5);
    this.turnText.eventMode = 'none';
    this.container.addChild(this.turnText);
  }

  update(_villageHp: number, _villageGold: number, turnNumber: number, _year: number, _phase: string, _messages: string[], _rotDeg: number = 0): void {
    this.turnText.text = `回合 ${turnNumber}`;
    const x = 18;
    const y = Math.max(44, this.renderer.screenH - 42);
    const width = Math.max(86, this.turnText.width + 24);
    const height = 30;
    this.turnBg.clear();
    this.turnBg.roundRect(x - 10, y - height / 2, width, height, 7);
    this.turnBg.fill({ color: 0x1d3342, alpha: 0.78 });
    this.turnBg.stroke({ width: 1.5, color: 0x8fd0dc, alpha: 0.72 });
    this.turnText.position.set(x, y);
  }
}
