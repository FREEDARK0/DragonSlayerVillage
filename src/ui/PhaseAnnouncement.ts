import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
export class PhaseAnnouncement {
  private container: Container;
  private bg: Graphics;
  private text: Text;
  private holdMs = 1400;
  private fadeMs = 600;
  private active = false;
  private activeTick: (() => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'PhaseAnnouncement';
    this.container.visible = false;
    renderer.getLayer(RenderLayer.UI).addChild(this.container);

    const w = this.renderer.screenW;
    const h = this.renderer.screenH;

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

  show(message: string, options: { holdMs?: number; fadeMs?: number } = {}): void {
    if (this.activeTick) {
      this.renderer.app.ticker.remove(this.activeTick);
      this.activeTick = null;
    }
    this.text.text = message;
    this.container.visible = true;
    this.container.alpha = 1;
    this.active = true;
    this.holdMs = options.holdMs ?? 1400;
    this.fadeMs = options.fadeMs ?? 600;
    const startedAt = performance.now();

    const tick = () => {
      const lifeMs = performance.now() - startedAt;
      if (lifeMs > this.holdMs) {
        this.container.alpha = 1 - Math.min(1, (lifeMs - this.holdMs) / this.fadeMs);
      }
      if (lifeMs >= this.holdMs + this.fadeMs) {
        this.container.visible = false;
        this.active = false;
        this.activeTick = null;
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.activeTick = tick;
    this.renderer.app.ticker.add(tick);
  }

  isVisible(): boolean {
    return this.container.visible;
  }

  getText(): string {
    return this.text.text;
  }
}
