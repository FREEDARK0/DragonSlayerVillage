import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';

export class ShopPanel {
  private container: Container;
  visible = false;
  mineCost = 0; // increments each purchase
  onBuyWall: (() => void) | null = null;
  onBuyBallista: (() => void) | null = null;
  onBuyPressure: (() => void) | null = null;
  onBuyMine: (() => void) | null = null;

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

    // Ballista slot (slot 2)
    const bx = startX + slotW + gap;
    const bSlot = new Graphics();
    bSlot.roundRect(bx, y + 12, slotW, slotH, 6);
    bSlot.fill({ color: 0x2a2a35, alpha: 0.8 });
    bSlot.stroke({ width: 2, color: 0x888888 });
    bSlot.eventMode = 'static'; bSlot.cursor = 'pointer';
    bSlot.on('pointerdown', () => this.onBuyBallista?.());
    this.container.addChild(bSlot);
    this.addSlotText('🏹', '巨弩', '60战力', bx, y, slotW);

    // Pressure stone slot (slot 3)
    const px = startX + (slotW + gap) * 2;
    const pSlot = new Graphics();
    pSlot.roundRect(px, y + 12, slotW, slotH, 6);
    pSlot.fill({ color: 0x352a3a, alpha: 0.8 });
    pSlot.stroke({ width: 2, color: 0x6644aa });
    pSlot.eventMode = 'static'; pSlot.cursor = 'pointer';
    pSlot.on('pointerdown', () => this.onBuyPressure?.());
    this.container.addChild(pSlot);
    this.addSlotText('🪨', '压力石', '80战力', px, y, slotW);

    // Mine slot (slot 4)
    const mx = startX + (slotW + gap) * 3;
    const mSlot = new Graphics();
    mSlot.roundRect(mx, y + 12, slotW, slotH, 6);
    mSlot.fill({ color: 0x353525, alpha: 0.8 });
    mSlot.stroke({ width: 2, color: 0x888855 });
    mSlot.eventMode = 'static'; mSlot.cursor = 'pointer';
    mSlot.on('pointerdown', () => this.onBuyMine?.());
    this.container.addChild(mSlot);
    this.addSlotText('⛏', '矿厂', `${10 + this.mineCost * 5}战力`, mx, y, slotW);

    // Empty slots
    for (let i = 4; i < slotCount; i++) {
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

  private addSlotText(icon: string, name: string, price: string, sx: number, y: number, slotW: number): void {
    const i = new Text({ text: icon, style: { fontFamily: 'Arial', fontSize: 24 } });
    i.anchor.set(0.5); i.position.set(sx + slotW / 2, y + 30); this.container.addChild(i);
    const l = new Text({ text: name, style: { fontFamily: 'Arial', fontSize: 11, fill: 0xddcc88 } });
    l.anchor.set(0.5); l.position.set(sx + slotW / 2, y + 60); this.container.addChild(l);
    const p = new Text({ text: price, style: { fontFamily: 'Arial', fontSize: 10, fill: 0x88cc88 } });
    p.anchor.set(0.5); p.position.set(sx + slotW / 2, y + 78); this.container.addChild(p);
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
  }
}
