import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';

export class ShopPanel {
  private container: Container;
  visible = false;
  onBuyWall: (() => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'ShopPanel';
    renderer.getLayer(5).addChild(this.container);
    this.draw();
  }

  draw(): void {
    this.container.removeChildren();
    this.container.visible = true;
    this.visible = true;
    const w = this.renderer.screenW;
    const slotCount = 6;
    const slotW = 80;
    const slotH = 90;
    const gap = 8;
    const totalW = slotCount * slotW + (slotCount - 1) * gap;
    const startX = (w - totalW) / 2;
    const y = 50;

    const bg = new Graphics();
    bg.roundRect(startX - 10, y - 10, totalW + 20, slotH + 20, 8);
    bg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.stroke({ width: 2, color: 0x444488 });
    this.container.addChild(bg);

    // Wood wall slot (first slot)
    const sx = startX;
    const slot = new Graphics();
    slot.roundRect(sx, y + 12, slotW, slotH, 6);
    slot.fill({ color: 0x3a3520, alpha: 0.8 });
    slot.stroke({ width: 2, color: 0x8B6914 });
    slot.eventMode = 'static';
    slot.cursor = 'pointer';
    slot.on('pointerdown', () => this.onBuyWall?.());
    this.container.addChild(slot);

    const icon = new Text({
      text: '🪵',
      style: { fontFamily: 'Arial', fontSize: 24 },
    });
    icon.anchor.set(0.5);
    icon.position.set(sx + slotW / 2, y + 30);
    this.container.addChild(icon);

    const label = new Text({
      text: '木墙',
      style: { fontFamily: 'Arial', fontSize: 11, fill: 0xddcc88 },
    });
    label.anchor.set(0.5);
    label.position.set(sx + slotW / 2, y + 60);
    this.container.addChild(label);

    const price = new Text({
      text: '5战力',
      style: { fontFamily: 'Arial', fontSize: 10, fill: 0x88cc88 },
    });
    price.anchor.set(0.5);
    price.position.set(sx + slotW / 2, y + 78);
    this.container.addChild(price);

    // Empty slots
    for (let i = 1; i < slotCount; i++) {
      const ex = startX + i * (slotW + gap);
      const es = new Graphics();
      es.roundRect(ex, y + 12, slotW, slotH, 6);
      es.fill({ color: 0x223344, alpha: 0.6 });
      es.stroke({ width: 1, color: 0x446688 });
      this.container.addChild(es);

      const q = new Text({ text: '?', style: { fontFamily: 'Arial', fontSize: 20, fill: 0x556677 } });
      q.anchor.set(0.5);
      q.position.set(ex + slotW / 2, y + 12 + slotH / 2);
      this.container.addChild(q);
    }

    const title = new Text({
      text: '商店',
      style: { fontFamily: 'Arial', fontSize: 14, fill: 0xffcc44, fontWeight: 'bold' },
    });
    title.anchor.set(0.5, 0);
    title.position.set(w / 2, y - 6);
    this.container.addChild(title);
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
  }
}
