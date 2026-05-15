import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { BLOCK_TYPE_TABLE, BlockType, ShopItem, SpellType } from '../config/blockTypes';
import { getBlockEffectDescriptions } from '../effects/BlockEffectRegistry';
import { BlockData } from '../models/Block';
import { drawBlockVisual } from '../rendering/BlockVisualRegistry';
import {
  ShopSectionKey,
  ShopSelection,
  ShopState,
} from '../systems/ShopSystem';
import { TooltipLineLayout, TooltipPanel } from './TooltipPanel';

const ATTACK_COLOR = 0xd94b4b;
const HP_COLOR = 0x22c7d7;
const PANEL_BG = 0x203746;
const CARD_BG = 0x1d2f3c;
const UNAFFORDABLE_BG = 0x101820;
const UNAFFORDABLE_STROKE = 0x52606a;
const UNAFFORDABLE_TEXT = 0x8f9aa3;
const UNAFFORDABLE_COST = 0xff7f72;

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
  onItemClicked: ((event?: any) => void) | null = null;
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

  draw(state: ShopState, selected: ShopSelection | null = null, disabled: boolean = false, villageGold: number = Infinity): void {
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
    bg.roundRect(left - 16, top - 28, right - left + 32, bottom - top + 44, 8);
    bg.fill({ color: PANEL_BG, alpha: 0.86 });
    bg.stroke({ width: 2, color: 0xd7b46a, alpha: 0.62 });
    bg.eventMode = 'none';
    this.container.addChild(bg);

    this.drawHeader('基础区', sectionCenter(this.lastLayout.sections.base.slots), top - 22);
    this.drawHeader('随机区', sectionCenter(this.lastLayout.sections.random.slots), top - 22);

    state.base.forEach((item, index) => {
      this.drawSlot(this.lastLayout.sections.base.slots[index], item, selected?.area === 'base' && selected.index === index, disabled, villageGold, (event) => {
        this.onUiPointerActivity?.(event);
        this.onItemClicked?.(event);
        this.onSectionItemSelected?.('base', index);
      });
    });

    state.random.forEach((slot, index) => {
      const layout = this.lastLayout.sections.random.slots[index];
      this.drawSlot(layout, slot.item, selected?.area === 'random' && selected.index === index, disabled, villageGold, (event) => {
        this.onUiPointerActivity?.(event);
        this.onItemClicked?.(event);
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

  private drawSlot(layout: SlotLayout, item: ShopItem | null, selected: boolean, disabled: boolean, villageGold: number, onClick: (event: any) => void): void {
    const g = new Graphics();
    const scale = selected ? 1.06 : 1;
    const width = layout.width * scale;
    const height = layout.height * scale;
    const x = layout.centerX - width / 2;
    const y = layout.centerY - height / 2;
    const unaffordable = Boolean(item && item.cost > villageGold);
    g.roundRect(x, y, width, height, 6);
    if (item) {
      const color = item.kind === 'block' ? BLOCK_TYPE_TABLE[item.blockType].color : 0x5f8dd3;
      g.fill({ color: unaffordable ? UNAFFORDABLE_BG : blendColors(CARD_BG, tintSlot(color), 0.3), alpha: unaffordable ? 0.9 : 0.96 });
      g.stroke({ width: selected ? 3 : 2, color: selected ? 0xfff0aa : unaffordable ? UNAFFORDABLE_STROKE : color, alpha: unaffordable ? 0.72 : 1 });
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

    const headerH = Math.max(18, Math.round(height * 0.23));
    const statH = item.kind === 'block' ? Math.max(18, Math.round(height * 0.23)) : 0;
    const innerPad = Math.max(3, Math.round(width * 0.04));
    const header = new Graphics();
    header.roundRect(x + 3, y + 3, width - 6, headerH, 4);
    header.fill({ color: unaffordable ? 0x0b1117 : 0x162734, alpha: unaffordable ? 0.72 : 0.82 });
    header.eventMode = 'none';
    this.container.addChild(header);

    const name = new Text({
      text: item.label,
      style: {
        fontFamily: 'Arial',
        fontSize: Math.max(10, Math.floor(layout.width * 0.15)),
        fill: unaffordable ? UNAFFORDABLE_TEXT : 0xfff3d4,
        fontWeight: 'bold',
        align: 'center',
        stroke: { color: 0x10202a, width: 2 },
      },
    });
    name.anchor.set(0.5);
    name.position.set(layout.centerX, y + headerH / 2 + 3);
    name.eventMode = 'none';
    this.container.addChild(name);

    const visual = new Graphics();
    const visualCenterY = y + headerH + (height - headerH - statH) * 0.5;
    const visualSize = Math.min(width * 0.34, (height - headerH - statH) * 0.42);
    if (item.kind === 'block') {
      drawBlockVisual(item.blockType, visual, visualSize, createDisplayBlock(item.blockType, item.hp, item.attack));
      visual.position.set(layout.centerX, visualCenterY);
      visual.alpha = unaffordable ? 0.42 : 1;
      visual.eventMode = 'none';
      this.container.addChild(visual);
      this.drawStatsBar(x + innerPad, y + height - statH - 3, width - innerPad * 2, statH, item.attack, item.hp, unaffordable);
    } else {
      this.drawSpellIcon(visual, visualSize, layout.centerX, visualCenterY, unaffordable);
    }

    const cost = new Text({
      text: `${item.cost} 金币`,
      style: {
        fontFamily: 'Arial',
        fontSize: Math.max(11, Math.floor(layout.width * 0.15)),
        fill: unaffordable ? UNAFFORDABLE_COST : 0xffe08a,
        fontWeight: 'bold',
        stroke: { color: 0x2b240e, width: 3 },
      },
    });
    cost.anchor.set(0.5);
    cost.position.set(layout.centerX, layout.y + layout.height + 10);
    cost.eventMode = 'none';
    this.container.addChild(cost);
  }

  private drawLockButton(layout: SlotLayout, locked: boolean, disabled: boolean, onClick: (event: any) => void): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 5);
    g.fill({ color: locked ? 0xffcc44 : 0x10202a, alpha: locked ? 0.96 : 0.12 });
    g.stroke({ width: 1.5, color: locked ? 0xfff0a8 : 0x8eb2c9, alpha: locked ? 0.95 : 0.76 });
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = 'pointer';
      g.on('pointerdown', onClick);
      g.on('pointerover', () => this.tooltip.show([{ text: locked ? '解除锁定' : '锁定商品' }], layout.centerX, layout.centerY));
      g.on('pointerout', () => this.tooltip.hide());
    }
    this.container.addChild(g);

    this.drawLockIcon(layout, locked);
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
    const tagText = item.tags.length > 0 ? item.tags.join('、') : '无';
    this.tooltip.show([
      { text: `${item.label}  ${item.cost}金币` },
      { text: item.kind === 'spell' ? '法术：点击合法目标后释放' : `攻击 ${item.attack} / HP ${item.hp}`, color: 0xb7f7a2, bold: true },
      { text: `标签: ${tagText}`, color: 0xcfe6f6 },
      ...descriptions.map(text => ({ text: `- ${text}` })),
    ], x, y);
  }

  private buildLayout(): ShopLayoutSnapshot {
    const slotWidth = Math.max(64, Math.min(82, Math.floor(this.renderer.screenW / 17)));
    const slotHeight = Math.round(slotWidth * 1.12);
    const slotGap = 10;
    const sectionGap = 28;
    const refreshWidth = Math.max(58, Math.floor(slotWidth * 0.8));
    const totalWidth = 3 * slotWidth + 2 * slotGap + sectionGap + 4 * slotWidth + 3 * slotGap + sectionGap + refreshWidth;
    const startX = Math.floor((this.renderer.screenW - totalWidth) / 2);
    const y = 38;
    const baseSlots = buildSlots(startX, y, 3, slotWidth, slotHeight, slotGap);
    const randomStart = startX + 3 * slotWidth + 2 * slotGap + sectionGap;
    const randomSlots = buildSlots(randomStart, y, 4, slotWidth, slotHeight, slotGap).map(slot => ({
      ...slot,
      lockButton: {
        x: slot.x + Math.max(12, Math.floor(slot.width * 0.26)),
        y: slot.y + slot.height + 24,
        width: slot.width - Math.max(24, Math.floor(slot.width * 0.52)),
        height: 22,
        centerX: slot.centerX,
        centerY: slot.y + slot.height + 35,
      },
    }));
    const refreshX = randomStart + 4 * slotWidth + 3 * slotGap + sectionGap;
    const refreshButton = {
      x: refreshX,
      y: y,
      width: refreshWidth,
      height: slotHeight + 46,
      centerX: refreshX + refreshWidth / 2,
      centerY: y + (slotHeight + 46) / 2,
    };
    return {
      sections: {
        base: { slots: baseSlots },
        random: { slots: randomSlots },
      },
      refreshButton,
    };
  }

  private drawStatsBar(x: number, y: number, width: number, height: number, attack: number, hp: number, dimmed: boolean = false): void {
    const bar = new Graphics();
    const half = width / 2;
    bar.roundRect(x, y, width, height, 4);
    bar.fill({ color: 0x10202a, alpha: dimmed ? 0.58 : 0.8 });
    bar.roundRect(x, y, half, height, 4);
    bar.fill({ color: dimmed ? 0x6a3030 : ATTACK_COLOR, alpha: dimmed ? 0.52 : 0.94 });
    bar.roundRect(x + half, y, half, height, 4);
    bar.fill({ color: dimmed ? 0x24555c : HP_COLOR, alpha: dimmed ? 0.52 : 0.94 });
    bar.rect(x + half - 0.5, y + 2, 1, height - 4);
    bar.fill({ color: 0xffffff, alpha: 0.45 });
    bar.eventMode = 'none';
    this.container.addChild(bar);

    const fontSize = Math.max(12, Math.floor(height * 0.72));
    this.drawCenteredText(`${attack}`, x + half / 2, y + height / 2, fontSize, dimmed);
    this.drawCenteredText(`${hp}`, x + half + half / 2, y + height / 2, fontSize, dimmed);
  }

  private drawCenteredText(text: string, x: number, y: number, fontSize: number, dimmed: boolean = false): void {
    const label = new Text({
      text,
      style: {
        fontFamily: 'Arial',
        fontSize,
        fill: dimmed ? UNAFFORDABLE_TEXT : 0xffffff,
        fontWeight: 'bold',
        stroke: { color: 0x10202a, width: 2 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.eventMode = 'none';
    this.container.addChild(label);
  }

  private drawSpellIcon(g: Graphics, size: number, x: number, y: number, dimmed: boolean = false): void {
    g.position.set(x, y);
    g.circle(0, 0, size * 0.62);
    g.fill({ color: dimmed ? 0x30465c : 0x5f8dd3, alpha: dimmed ? 0.48 : 0.94 });
    g.stroke({ width: 2, color: dimmed ? UNAFFORDABLE_STROKE : 0xb7dcff, alpha: dimmed ? 0.64 : 0.96 });
    g.poly([
      0, -size * 0.55,
      size * 0.14, -size * 0.08,
      size * 0.48, -size * 0.08,
      size * 0.2, size * 0.12,
      size * 0.32, size * 0.55,
      0, size * 0.2,
      -size * 0.32, size * 0.55,
      -size * 0.2, size * 0.12,
      -size * 0.48, -size * 0.08,
      -size * 0.14, -size * 0.08,
    ]);
    g.fill({ color: dimmed ? UNAFFORDABLE_TEXT : 0xf4fbff, alpha: dimmed ? 0.62 : 1 });
    g.eventMode = 'none';
    this.container.addChild(g);
  }

  private drawLockIcon(layout: SlotLayout, locked: boolean): void {
    const cx = layout.centerX;
    const cy = layout.centerY;
    const s = Math.min(layout.width, layout.height) * 0.48;
    const color = locked ? 0x6a4a00 : 0xd8f3ff;
    const shackleX = locked ? cx : cx + s * 0.18;

    const body = new Graphics();
    body.roundRect(cx - s * 0.48, cy - s * 0.02, s * 0.96, s * 0.62, 2);
    body.fill(color);
    body.stroke({ width: 1, color: locked ? 0x3f2b00 : 0x10202a, alpha: 0.65 });
    body.eventMode = 'none';
    this.container.addChild(body);

    const shackle = new Graphics();
    shackle.moveTo(shackleX - s * 0.36, cy - s * 0.02);
    shackle.arc(shackleX, cy - s * 0.02, s * 0.36, Math.PI, Math.PI * 2);
    shackle.stroke({ width: 2.2, color });
    shackle.eventMode = 'none';
    this.container.addChild(shackle);

    if (!locked) {
      const gap = new Graphics();
      gap.moveTo(cx + s * 0.5, cy - s * 0.02);
      gap.lineTo(cx + s * 0.74, cy - s * 0.18);
      gap.stroke({ width: 2.2, color });
      gap.eventMode = 'none';
      this.container.addChild(gap);
    }
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

function blendColors(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar * (1 - t) + br * t);
  const g = Math.round(ag * (1 - t) + bg * t);
  const blue = Math.round(ab * (1 - t) + bb * t);
  return (r << 16) | (g << 8) | blue;
}

function createDisplayBlock(type: BlockType, hp: number, attack: number): BlockData {
  return {
    id: 0,
    type,
    hp,
    attack,
    tags: [],
    shielded: false,
    cooldown: 0,
    tempAttack: 0,
    tempHp: 0,
    turnAttackBonus: 0,
  };
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
