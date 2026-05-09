import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';
import { GAME_CONSTANTS } from '../config/constants';

export class PhaseAnnouncement {
  private container: Container;
  private bg: Graphics;
  private text: Text;
  private life = 0;
  private maxLife = 120;
  private active = false;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'PhaseAnnouncement';
    this.container.visible = false;
    renderer.getLayer(6).addChild(this.container);

    const w = GAME_CONSTANTS.SCREEN_WIDTH;
    const h = GAME_CONSTANTS.SCREEN_HEIGHT;

    this.bg = new Graphics();
    this.bg.rect(0, h / 2 - 40, w, 80);
    this.bg.fill({ color: 0x000000, alpha: 0.7 });
    this.container.addChild(this.bg);

    this.text = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 24,
        fill: 0xffffff,
        fontWeight: 'bold',
        align: 'center',
      },
    });
    this.text.anchor.set(0.5);
    this.text.position.set(w / 2, h / 2);
    this.container.addChild(this.text);
  }

  show(message: string): void {
    this.text.text = message;
    this.container.visible = true;
    this.container.alpha = 1;
    this.active = true;
    this.life = 0;

    const tick = () => {
      this.life++;
      if (this.life > this.maxLife * 0.7) {
        this.container.alpha = 1 - (this.life - this.maxLife * 0.7) / (this.maxLife * 0.3);
      }
      if (this.life >= this.maxLife) {
        this.container.visible = false;
        this.active = false;
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }
}
