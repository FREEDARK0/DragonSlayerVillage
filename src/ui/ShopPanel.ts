import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { BLOCK_TYPE_TABLE, BlockType, ShopItem, SpellType } from '../config/blockTypes';
import { getBlockEffectDescriptions } from '../effects/BlockEffectRegistry';
import {
  ShopSectionKey,
  ShopSelection,
  ShopState,
} from '../systems/ShopSystem';
import { TooltipLineLayout, TooltipPanel } from './TooltipPanel';

interface SlotLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface RandomSlotLayout extends SlotLayout {
  lockButton: SlotLayout;
}

interface RefreshButtonLayout extends SlotLayout {}

export interface ShopLayoutSnapshot {
  sections: {
    base: { slots: SlotLayout[] };
    random: { slots: RandomSlotLayout[] };
  };
  refreshButton: RefreshButtonLayout;
}

export class ShopPanel {
  private container: Container;
  onSectionItemSelected: ((section: ShopSectionKey, index: number) => void) | null = null;
  onRandomLockToggled: ((index: number) => void) | null = null;
  onRefreshClicked: (() => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;
  private tooltip: TooltipPanel;
  private lastLayout: ShopLayoutSnapshot = emptyLayout();

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'ShopPanel';
    this.container.eventMode = 'passive';
    renderer.getLayer(RenderLayer.UI).addChild(this.container);
    this.tooltip = new TooltipPanel(renderer, 'ShopTooltip');
  }

  draw(state: ShopState, selected: ShopSelection | null = null, disabled: boolean = false): void {
    this.tooltip.hide();
    this.container.removeChildren();
    this.lastLayout = this.buildLayout();

    const allSlots = [
      ...this.lastLayout.sections.base.slots,
      ...this.lastLayout.sections.random.slots,
      this.lastLayout.refreshButton,
    ];
    const left = Math.min(...allSlots.map(layout => layout.x));
    const top = Math.min(...allSlots.map(layout => layout.y));
    const right = Math.max(...allSlots.map(layout => layout.x + layout.width));
    const bottom = Math.max(...allSlots.map(layout => layout.y + layout.height));

    const bg = new Graphics();
    bg.roundRect(left - 18, top - 34, right - left + 36, bottom - top + 52, 8);
    bg.fill({ color: 0x21374a, alpha: 0.84 });
    bg.stroke({ width: 2, color: 0xd7b46a, alpha: 0.7 });
    bg.eventMode = 'none';
    this.container.addChild(bg);

    this.drawHeader('基础区', sectionCenter(this.lastLayout.sections.base.slots), top - 26);
    this.drawHeader('随机区', sectionCenter(this.lastLayout.sections.random.slots), top - 26);

    state.base.forEach((item, index) => {
      this.drawSlot(this.lastLayout.sections.base.slots[index], item, selected?.area === 'base' && selected.index === index, disabled, (event) => {
        this.onUiPointerActivity?.(event);
        this.onSectionItemSelected?.('base', index);
      });
    });

    state.random.forEach((slot, index) => {
      const layout = this.lastLayout.sections.random.slots[index];
      this.drawSlot(layout, slot.item, selected?.area === 'random' && selected.index === index, disabled, (event) => {
        this.onUiPointerActivity?.(event);
        if (slot.item) this.onSectionItemSelected?.('random', index);
      });
      this.drawLockButton(layout.lockButton, slot.locked, disabled, (event) => {
        this.onUiPointerActivity?.(event);
        this.onRandomLockToggled?.(index);
      });
    });

    this.drawRefreshButton(this.lastLayout.refreshButton, state.refreshCost, disabled);

    if (selected) {
      const hint = new Text({
        text: selected.item.kind === 'spell' ? '选择法术目标' : '选择放置扇区',
        style: { fontFamily: 'Arial', fontSize: 15, fill: 0xfff0bb, fontWeight: 'bold', stroke: { color: 0x21374a, width: 3 } },
      });
      hint.anchor.set(0.5, 0);
      hint.position.set(this.renderer.screenW / 2, bottom + 6);
      hint.eventMode = 'none';
      this.container.addChild(hint);
    }
  }

  isTooltipVisible(): boolean {
    return this.tooltip.isVisible();
  }

  isDragging(): boolean {
    return false;
  }

  getTooltipLines(): string[] {
    return this.tooltip.getLines();
  }

  getTooltipLayout(): TooltipLineLayout[] {
    return this.tooltip.getLineLayout();
  }

  getLayoutSnapshot(): ShopLayoutSnapshot {
    return {
      sections: {
        base: { slots: this.lastLayout.sections.base.slots.map(slot => ({ ...slot })) },
        random: { slots: this.lastLayout.sections.random.slots.map(slot => ({ ...slot, lockButton: { ...slot.lockButton } })) },
      },
      refreshButton: { ...this.lastLayout.refreshButton },
    };
  }

  private drawHeader(text: string, x: number, y: number): void {
    const header = new Text({
      text,
      style: { fontFamily: 'Arial', fontSize: 12, fill: 0xcfe6f6, fontWeight: 'bold' },
    });
    header.anchor.set(0.5, 0);
    header.position.set(x, y);
    header.eventMode = 'none';
    this.container.addChild(header);
  }

  private drawSlot(layout: SlotLayout, item: ShopItem | null, selected: boolean, disabled: boolean, onClick: (event: any) => void): void {
    const g = new Graphics();
    const scale = selected ? 1.06 : 1;
    const width = layout.width * scale;
    const height = layout.height * scale;
    const x = layout.centerX - width / 2;
    const y = layout.centerY - height / 2;
    g.roundRect(x, y, width, height, 6);
    if (item) {
      const color = item.kind === 'block' ? BLOCK_TYPE_TABLE[item.blockType].color : 0x5f8dd3;
      g.fill({ color: tintSlot(color), alpha: 0.92 });
      g.stroke({ width: selected ? 3 : 2, color: selected ? 0xfff0aa : color });
    } else {
      g.fill({ color: 0xb9d6ba, alpha: 0.2 });
      g.stroke({ width: 1, color: 0x6d8f78, alpha: 0.8 });
    }
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = item ? 'pointer' : 'default';
      g.on('pointerdown', onClick);
    }
    if (item && !disabled) {
      g.on('pointerover', () => this.showItemTooltip(item, layout.centerX, layout.centerY));
      g.on('pointerout', () => this.tooltip.hide());
    }
    this.container.addChild(g);

    if (!item) return;

    const name = new Text({
      text: item.label,
      style: { fontFamily: 'Arial', fontSize: Math.max(10, Math.floor(layout.width * 0.14)), fill: 0xfff0cc, fontWeight: 'bold', align: 'center' },
    });
    name.anchor.set(0.5);
    name.position.set(layout.centerX, layout.y + layout.height * 0.24);
    name.eventMode = 'none';
    this.container.addChild(name);

    if (item.kind === 'block') {
      const stats = new Text({
        text: `HP ${item.hp}  攻 ${item.attack}`,
        style: { fontFamily: 'Arial', fontSize: Math.max(9, Math.floor(layout.width * 0.12)), fill: 0xffffff },
      });
      stats.anchor.set(0.5);
      stats.position.set(layout.centerX, layout.y + layout.height * 0.52);
      stats.eventMode = 'none';
      this.container.addChild(stats);
    } else {
      const tag = new Text({
        text: '【法术】',
        style: { fontFamily: 'Arial', fontSize: Math.max(9, Math.floor(layout.width * 0.13)), fill: 0xaad7ff, fontWeight: 'bold' },
      });
      tag.anchor.set(0.5);
      tag.position.set(layout.centerX, layout.y + layout.height * 0.52);
      tag.eventMode = 'none';
      this.container.addChild(tag);
    }

    const cost = new Text({
      text: `${item.cost} 金币`,
      style: { fontFamily: 'Arial', fontSize: Math.max(11, Math.floor(layout.width * 0.15)), fill: 0xb7f7a2, fontWeight: 'bold', stroke: { color: 0x1b2a1e, width: 3 } },
    });
    cost.anchor.set(0.5);
    cost.position.set(layout.centerX, layout.y + layout.height * 0.8);
    cost.eventMode = 'none';
    this.container.addChild(cost);
  }

  private drawLockButton(layout: SlotLayout, locked: boolean, disabled: boolean, onClick: (event: any) => void): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 5);
    g.fill({ color: locked ? 0xb2862d : 0x31495d, alpha: 0.96 });
    g.stroke({ width: 1, color: locked ? 0xffe29a : 0x8eb2c9 });
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = 'pointer';
      g.on('pointerdown', onClick);
      g.on('pointerover', () => this.tooltip.show([{ text: locked ? '解除锁定' : '锁定商品' }], layout.centerX, layout.centerY));
      g.on('pointerout', () => this.tooltip.hide());
    }
    this.container.addChild(g);

    const label = new Text({
      text: locked ? '锁定' : '未锁',
      style: { fontFamily: 'Arial', fontSize: 10, fill: 0xffffff, fontWeight: 'bold' },
    });
    label.anchor.set(0.5);
    label.position.set(layout.centerX, layout.centerY);
    label.eventMode = 'none';
    this.container.addChild(label);
  }

  private drawRefreshButton(layout: RefreshButtonLayout, cost: number, disabled: boolean): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 7);
    g.fill({ color: 0x2f5f3a, alpha: 0.96 });
    g.stroke({ width: 2, color: 0xc9ec9e, alpha: 0.95 });
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = 'pointer';
      g.on('pointerdown', (event) => {
        this.onUiPointerActivity?.(event);
        this.onRefreshClicked?.();
      });
      g.on('pointerover', () => this.tooltip.show([
        { text: '刷新随机区', bold: true },
        { text: `消耗: ${cost} 金币`, color: 0xb7f7a2, bold: true },
      ], layout.centerX, layout.centerY));
      g.on('pointerout', () => this.tooltip.hide());
    }
    this.container.addChild(g);

    const text = new Text({
      text: `刷新\n${cost}`,
      style: { fontFamily: 'Arial', fontSize: 12, fill: 0xffffff, fontWeight: 'bold', align: 'center' },
    });
    text.anchor.set(0.5);
    text.position.set(layout.centerX, layout.centerY);
    text.eventMode = 'none';
    this.container.addChild(text);
  }

  private showItemTooltip(item: ShopItem, x: number, y: number): void {
    const descriptions = item.kind === 'block'
      ? getBlockShopDescriptions(item.blockType, item.hp, item.attack)
      : getSpellDescriptions(item.spellType);
    this.tooltip.show([
      { text: `${item.label}  ${item.cost}金币` },
      { text: item.kind === 'spell' ? '【法术】点击合法目标后释放' : `HP ${item.hp} / 攻击 ${item.attack}`, color: 0xb7f7a2, bold: true },
      ...descriptions.map(text => ({ text: `- ${text}` })),
    ], x, y);
  }

  private buildLayout(): ShopLayoutSnapshot {
    const slotWidth = Math.max(64, Math.min(82, Math.floor(this.renderer.screenW / 17)));
    const slotHeight = Math.round(slotWidth * 1.08);
    const slotGap = 10;
    const sectionGap = 28;
    const refreshWidth = Math.max(58, Math.floor(slotWidth * 0.8));
    const totalWidth = 3 * slotWidth + 2 * slotGap + sectionGap + 4 * slotWidth + 3 * slotGap + sectionGap + refreshWidth;
    const startX = Math.floor((this.renderer.screenW - totalWidth) / 2);
    const y = 72;
    const baseSlots = buildSlots(startX, y, 3, slotWidth, slotHeight, slotGap);
    const randomStart = startX + 3 * slotWidth + 2 * slotGap + sectionGap;
    const randomSlots = buildSlots(randomStart, y, 4, slotWidth, slotHeight, slotGap).map(slot => ({
      ...slot,
      lockButton: {
        x: slot.x,
        y: slot.y + slot.height + 8,
        width: slot.width,
        height: 22,
        centerX: slot.centerX,
        centerY: slot.y + slot.height + 19,
      },
    }));
    const refreshX = randomStart + 4 * slotWidth + 3 * slotGap + sectionGap;
    const refreshButton = {
      x: refreshX,
      y: y,
      width: refreshWidth,
      height: slotHeight + 30,
      centerX: refreshX + refreshWidth / 2,
      centerY: y + (slotHeight + 30) / 2,
    };
    return {
      sections: {
        base: { slots: baseSlots },
        random: { slots: randomSlots },
      },
      refreshButton,
    };
  }
}

function buildSlots(startX: number, y: number, count: number, width: number, height: number, gap: number): SlotLayout[] {
  return Array.from({ length: count }, (_, index) => {
    const x = startX + index * (width + gap);
    return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
  });
}

function sectionCenter(slots: SlotLayout[]): number {
  const left = Math.min(...slots.map(slot => slot.x));
  const right = Math.max(...slots.map(slot => slot.x + slot.width));
  return (left + right) / 2;
}

function tintSlot(color: number): number {
  return ((Math.floor(((color >> 16) & 0xff) * 0.3)) << 16)
    | ((Math.floor(((color >> 8) & 0xff) * 0.3)) << 8)
    | Math.floor((color & 0xff) * 0.3);
}

function getBlockShopDescriptions(blockType: BlockType, hp: number, attack: number): string[] {
  return [`HP: ${hp}`, `攻击力: ${attack}`, ...getBlockEffectDescriptions(blockType)];
}

function getSpellDescriptions(spellType: SpellType): string[] {
  if (spellType === SpellType.MISSILE) return ['对选择目标造成 5 点伤害；每个法师增加 1 次效果并附加攻击力'];
  if (spellType === SpellType.FOCUS_DEFENSE) return ['指定友方，吸收左右相邻友方各一半 HP'];
  if (spellType === SpellType.FOCUS_BREAKTHROUGH) return ['指定友方，吸收左右相邻友方各一半攻击力'];
  if (spellType === SpellType.SACRIFICE) return ['摧毁指定友方，将其一半 HP/攻击传递给随机友方'];
  if (spellType === SpellType.BULWARK) return ['所有攻击力为 0 的友方 +5 HP'];
  if (spellType === SpellType.SHIELD_CRUSH) return ['摧毁攻击力为 0 的友方，对其扇区敌人造成其 HP 的伤害'];
  return ['暂无说明'];
}

function emptyLayout(): ShopLayoutSnapshot {
  const refreshButton = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  return {
    sections: {
      base: { slots: [] },
      random: { slots: [] },
    },
    refreshButton,
  };
}
