import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';
import { RenderLayer } from '../rendering/GameRenderer';
import { BLOCK_TYPE_TABLE, ShopItem, SpellType } from '../config/blockTypes';
import { getBlockEffectDescriptions } from '../effects/BlockEffectRegistry';
import { LOCKED_SLOT_COUNT, OFFER_SLOT_COUNT, ShopSelection, ShopState } from '../systems/ShopSystem';
import { TooltipPanel } from './TooltipPanel';

export class ShopPanel {
  private container: Container;
  onOfferDropped: ((offerIndex: number, lockedIndex: number) => void) | null = null;
  onLockedSelected: ((lockedIndex: number) => void) | null = null;
  onOfferSelected: ((offerIndex: number) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;
  private dragging: { item: ShopItem; offerIndex: number } | null = null;
  private dragGraphics = new Graphics();
  private tooltip: TooltipPanel;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'ShopPanel';
    this.container.eventMode = 'static';
    renderer.getLayer(RenderLayer.UI).addChild(this.container);
    this.tooltip = new TooltipPanel(renderer, 'ShopTooltip');
  }

  draw(state: ShopState, selected: ShopSelection | null = null): void {
    this.tooltip.hide();
    this.container.removeChildren();
    const w = this.renderer.screenW;
    const slotW = 80; const slotH = 90; const gap = 10;
    const totalSlots = LOCKED_SLOT_COUNT + OFFER_SLOT_COUNT;
    const totalW = totalSlots * slotW + (totalSlots - 1) * gap;
    const startX = (w - totalW) / 2;
    const y = 50;

    const bg = new Graphics();
    bg.roundRect(startX - 14, y - 12, totalW + 28, slotH + 56, 8);
    bg.fill({ color: 0x21374a, alpha: 0.78 });
    bg.stroke({ width: 2, color: 0xd7b46a, alpha: 0.7 });
    this.container.addChild(bg);

    // Left zone label
    const leftLabel = new Text({ text: '🔒', style: { fontFamily: 'Arial', fontSize: 12 } });
    leftLabel.position.set(startX + (LOCKED_SLOT_COUNT * slotW + (LOCKED_SLOT_COUNT - 1) * gap) / 2, y - 6); leftLabel.eventMode = 'none'; this.container.addChild(leftLabel);
    const rightLabel = new Text({ text: '🔄', style: { fontFamily: 'Arial', fontSize: 12 } });
    rightLabel.position.set(startX + LOCKED_SLOT_COUNT * (slotW + gap) + (OFFER_SLOT_COUNT * slotW + (OFFER_SLOT_COUNT - 1) * gap) / 2, y - 6); rightLabel.eventMode = 'none'; this.container.addChild(rightLabel);
    const title = new Text({ text: '商店', style: { fontFamily: 'Arial', fontSize: 13, fill: 0xffcc44, fontWeight: 'bold' } });
    title.anchor.set(0.5, 0); title.position.set(w / 2, y - 2); title.eventMode = 'none'; this.container.addChild(title);

    // Left slots
    for (let i = 0; i < LOCKED_SLOT_COUNT; i++) {
      const item = state.lockedSlots[i];
      this.drawSlot(startX + i * (slotW + gap), y + 10, item, selected?.area === 'locked' && selected.index === i, (event) => {
        this.onUiPointerActivity?.(event);
        if (item) this.onLockedSelected?.(i);
      });
    }

    // Divider
    const div = new Graphics();
    div.rect(startX + LOCKED_SLOT_COUNT * slotW + (LOCKED_SLOT_COUNT - 0.5) * gap, y + 5, 2, slotH + 10);
    div.fill(0x444488);
    this.container.addChild(div);

    // Right slots (draggable)
    for (let i = 0; i < OFFER_SLOT_COUNT; i++) {
      const item = state.offerSlots[i];
      const sx = startX + (LOCKED_SLOT_COUNT + i) * (slotW + gap);
      this.drawSlot(sx, y + 10, item, selected?.area === 'offer' && selected.index === i, (event) => {
        this.onUiPointerActivity?.(event);
        if (item) this.startOfferGesture(item, i, event);
      });
    }

    if (selected) {
      const hint = new Text({
        text: '选择放置的扇区',
        style: { fontFamily: 'Arial', fontSize: 15, fill: 0xfff0bb, fontWeight: 'bold', stroke: { color: 0x21374a, width: 3 } },
      });
      hint.anchor.set(0.5, 0);
      hint.position.set(w / 2, y + slotH + 26);
      hint.eventMode = 'none';
      this.container.addChild(hint);
    }
  }

  private drawSlot(sx: number, sy: number, item: ShopItem | null, selected: boolean, onClick: (event: any) => void): void {
    const g = new Graphics();
    const scale = selected ? 1.1 : 1;
    const w = 80 * scale;
    const h = 90 * scale;
    const x = sx - (w - 80) / 2;
    const y = sy - (h - 90) / 2;
    g.roundRect(x, y, w, h, 6);
    if (item) {
      const c = item.kind === 'block' ? BLOCK_TYPE_TABLE[item.blockType].color : 0x5f8dd3;
      g.fill({ color: ((Math.floor(((c >> 16) & 0xff) * 0.3)) << 16) | ((Math.floor(((c >> 8) & 0xff) * 0.3)) << 8) | Math.floor((c & 0xff) * 0.3), alpha: 0.9 });
      g.stroke({ width: selected ? 4 : 2, color: selected ? 0xfff0aa : c });
    } else {
      g.fill({ color: 0xb9d6ba, alpha: 0.24 });
      g.stroke({ width: 1, color: 0x6d8f78, alpha: 0.8 });
    }
    g.eventMode = 'static'; g.cursor = 'pointer';
    g.on('pointerdown', onClick);
    if (item) {
      g.on('pointerover', () => this.showItemTooltip(item, sx + 40, sy + 45));
      g.on('pointerout', () => this.tooltip.hide());
    }
    this.container.addChild(g);

    if (item) {
      const name = new Text({ text: item.label, style: { fontFamily: 'Arial', fontSize: selected ? 12 : 11, fill: 0xfff0cc, fontWeight: 'bold' } });
      name.anchor.set(0.5); name.position.set(sx + 40, sy + 30); name.eventMode = 'none'; this.container.addChild(name);
      if (item.tags.length > 0) {
        const tag = new Text({ text: `【${item.tags[0]}】`, style: { fontFamily: 'Arial', fontSize: 9, fill: 0xaad7ff, fontWeight: 'bold' } });
        tag.anchor.set(0.5); tag.position.set(sx + 40, sy + 48); tag.eventMode = 'none'; this.container.addChild(tag);
      }
      if (item.kind === 'block') {
        const power = new Text({ text: `战力 ${item.combatPower}`, style: { fontFamily: 'Arial', fontSize: 10, fill: 0xffffff } });
        power.anchor.set(0.5); power.position.set(sx + 40, sy + 60); power.eventMode = 'none'; this.container.addChild(power);
      }
      const cost = new Text({ text: `${item.cost}`, style: { fontFamily: 'Arial', fontSize: 14, fill: 0xb7f7a2, fontWeight: 'bold', stroke: { color: 0x1b2a1e, width: 3 } } });
      cost.anchor.set(0.5); cost.position.set(sx + 40, sy + 76); cost.eventMode = 'none'; this.container.addChild(cost);
    }
  }

  private startOfferGesture(item: ShopItem, offerIndex: number, event: any): void {
    this.tooltip.hide();
    this.onUiPointerActivity?.(event);
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    let startedDrag = false;
    let startClientX: number | null = null;
    let startClientY: number | null = null;

    const onMove = (e: PointerEvent) => {
      this.onUiPointerActivity?.(e);
      if (startClientX === null || startClientY === null) {
        startClientX = e.clientX;
        startClientY = e.clientY;
      }
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!startedDrag && Math.sqrt(dx * dx + dy * dy) > 8) {
        startedDrag = true;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        this.startDrag(item, offerIndex, e);
      }
    };

    const onUp = (event: PointerEvent) => {
      this.onUiPointerActivity?.(event);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!startedDrag) this.onOfferSelected?.(offerIndex);
    };

    const initFromLastPointer = (e: PointerEvent) => {
      startClientX = e.clientX;
      startClientY = e.clientY;
    };

    initFromLastPointer(event as PointerEvent);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private startDrag(item: ShopItem, offerIndex: number, initialEvent?: PointerEvent): void {
    this.dragging = { item, offerIndex };
    const color = item.kind === 'block' ? BLOCK_TYPE_TABLE[item.blockType].color : 0x5f8dd3;
    this.dragGraphics.clear();
    this.dragGraphics.roundRect(0, 0, 80, 90, 6);
    this.dragGraphics.fill({ color, alpha: 0.7 });
    this.dragGraphics.stroke({ width: 2, color: 0xffffff });
    this.dragGraphics.visible = false;
    this.container.addChild(this.dragGraphics);

    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    const positionDrag = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = this.renderer.screenW / rect.width;
      const sy = this.renderer.screenH / rect.height;
      const cx = (e.clientX - rect.left) * sx;
      const cy = (e.clientY - rect.top) * sy;
      this.dragGraphics.position.set(cx - 40, cy - 45);
    };
    if (initialEvent) {
      this.dragGraphics.visible = true;
      positionDrag(initialEvent);
    }
    const onMove = (e: PointerEvent) => {
      this.onUiPointerActivity?.(e);
      if (!this.dragging) return;
      this.dragGraphics.visible = true;
      positionDrag(e);
    };
    const onUp = (e: PointerEvent) => {
      this.onUiPointerActivity?.(e);
      this.dragGraphics.visible = false;
      if (this.dragGraphics.parent) this.container.removeChild(this.dragGraphics);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!this.dragging) return;

      const rect = canvas.getBoundingClientRect();
      const sx = this.renderer.screenW / rect.width;
      const sy = this.renderer.screenH / rect.height;
      const lx = (e.clientX - rect.left) * sx;
      const ly = (e.clientY - rect.top) * sy;

      const slotW = 80; const gap = 10;
      const w = this.renderer.screenW;
      const totalSlots = LOCKED_SLOT_COUNT + OFFER_SLOT_COUNT;
      const totalW = totalSlots * slotW + (totalSlots - 1) * gap;
      const startX = (w - totalW) / 2;
      for (let i = 0; i < LOCKED_SLOT_COUNT; i++) {
        const sx2 = startX + i * (slotW + gap);
        if (lx >= sx2 && lx <= sx2 + slotW && ly >= 60 && ly <= 150) {
          this.onOfferDropped?.(this.dragging.offerIndex, i);
          break;
        }
      }
      this.dragging = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  isTooltipVisible(): boolean {
    return this.tooltip.isVisible();
  }

  private showItemTooltip(item: ShopItem, x: number, y: number): void {
    const descriptions = item.kind === 'block' ? [
      `当前战力: ${item.combatPower}`,
      ...getBlockEffectDescriptions(item.blockType, 1).map(line => `Lv1 ${line}`),
      ...getBlockEffectDescriptions(item.blockType, 2).map(line => `Lv2 ${line}`),
      ...getBlockEffectDescriptions(item.blockType, 3).map(line => `Lv3 ${line}`),
    ] : getSpellDescriptions(item.spellType);
    this.tooltip.show([
      { text: `${item.label}  ${item.cost}战力` },
      { text: item.kind === 'spell' ? '【法术】点击合法目标后释放' : '放置为 Lv1；同类叠加最高 Lv3', color: 0xb7f7a2, bold: true },
      ...descriptions.slice(0, 7).map(text => ({ text: `- ${text}` })),
    ], x, y);
  }
}

function getSpellDescriptions(spellType: SpellType): string[] {
  if (spellType === SpellType.FOCUS_FIELD) return ['指定友方，吸收左右相邻友方各一半战力'];
  if (spellType === SpellType.SACRIFICE) return ['摧毁指定友方，随机升级另一个友方'];
  if (spellType === SpellType.BULWARK) return ['所有友方【无法攻击】地块战力 +5'];
  if (spellType === SpellType.SHIELD_CRUSH) return ['摧毁友方【无法攻击】地块，对同扇区龙造成等同战力伤害'];
  return ['暂无说明'];
}
