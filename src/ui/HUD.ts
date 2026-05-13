import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';

export class HUD {
  private container: Container;
  private turnText: Text;
  private yearText: Text;
  private phaseText: Text;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'HUD';
    renderer.getLayer(6).addChild(this.container);
    const w = this.renderer.screenW;

    // Top bar only
    const topBar = new Graphics();
    topBar.roundRect(10, 8, w - 20, 28, 6);
    topBar.fill({ color: 0x24445a, alpha: 0.72 });
    topBar.stroke({ width: 1, color: 0xf1cf86, alpha: 0.7 });
    this.container.addChild(topBar);

    this.yearText = new Text({ text: '第 1 年', style: { fontFamily: 'Arial', fontSize: 14, fill: 0xffcc44, fontWeight: 'bold' } });
    this.yearText.position.set(20, 14); this.container.addChild(this.yearText);

    this.phaseText = new Text({ text: '初期', style: { fontFamily: 'Arial', fontSize: 14, fill: 0x88ff88 } });
    this.phaseText.position.set(110, 14); this.container.addChild(this.phaseText);

    this.turnText = new Text({ text: '回合: 0', style: { fontFamily: 'Arial', fontSize: 12, fill: 0x999999 } });
    this.turnText.position.set(w - 150, 15); this.container.addChild(this.turnText);
  }

  update(_villagePower: number, _villageLevel: number, turnNumber: number, year: number, _phase: string, _messages: string[], _rotDeg: number = 0): void {
    this.turnText.text = `回合: ${turnNumber}`;
    this.yearText.text = `第 ${year} 年`;
    this.phaseText.text = turnNumber <= 3 ? '初期' : turnNumber <= 10 ? '发展期' : '高潮期';
  }
}
