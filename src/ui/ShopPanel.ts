import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { BLOCK_TYPE_TABLE, BlockType, ShopActionType, ShopItem, SpellType, getSpellTypeDescriptions } from '../config/blockTypes';
import { getBlockEffectDescriptions } from '../effects/BlockEffectRegistry';
import { BlockData } from '../models/Block';
import { drawBlockVisual } from '../rendering/BlockVisualRegistry';
import {
  ShopSectionKey,
  ShopSelection,
  ShopState,
} from '../systems/ShopSystem';
import { TooltipLineLayout, TooltipPanel } from './TooltipPanel';
import { getSpellAttackDisplay } from './ShopItemDisplay';
import { bindPressable } from './PressInteractions';

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
    temporary: { slots: SlotLayout[] };
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

  draw(state: ShopState, selected: ShopSelection | null = null, disabled: boolean = false, villageGold: number = Infinity, costResolver: (item: ShopItem) => number = item => item.cost): void {
    this.tooltip.hide();
    this.container.removeChildren();
    this.lastLayout = this.buildLayout(state.base.length, state.random.length, state.temporary.length);

    const allSlots = [
      ...this.lastLayout.sections.base.slots,
      ...this.lastLayout.sections.random.slots,
      ...this.lastLayout.sections.temporary.slots.slice(0, state.temporary.length),
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
    if (state.temporary.length > 0) {
      this.drawHeader('临时区', sectionCenter(this.lastLayout.sections.temporary.slots.slice(0, state.temporary.length)), this.lastLayout.sections.temporary.slots[0].y - 22);
    }

    state.base.forEach((item, index) => {
      this.drawSlot(this.lastLayout.sections.base.slots[index], item, selected?.area === 'base' && selected.index === index, disabled, villageGold, costResolver, (event) => {
        this.onUiPointerActivity?.(event);
        this.onItemClicked?.(event);
        this.onSectionItemSelected?.('base', index);
      });
    });

    state.random.forEach((slot, index) => {
      const layout = this.lastLayout.sections.random.slots[index];
      this.drawSlot(layout, slot.item, selected?.area === 'random' && selected.index === index, disabled, villageGold, costResolver, (event) => {
        this.onUiPointerActivity?.(event);
        this.onItemClicked?.(event);
        if (slot.item) this.onSectionItemSelected?.('random', index);
      });
      this.drawLockButton(layout.lockButton, slot.locked, disabled, (event) => {
        this.onUiPointerActivity?.(event);
        this.onRandomLockToggled?.(index);
      });
    });

    state.temporary.forEach((item, index) => {
      const layout = this.lastLayout.sections.temporary.slots[index];
      this.drawSlot(layout, item, selected?.area === 'temporary' && selected.index === index, disabled, villageGold, costResolver, (event) => {
        this.onUiPointerActivity?.(event);
        this.onItemClicked?.(event);
        this.onSectionItemSelected?.('temporary', index);
      });
    });

    this.drawRefreshButton(this.lastLayout.refreshButton, state.refreshCost, state.freeRefreshCredits, disabled);

    if (selected) {
      const hint = new Text({
        text: selectionHint(selected.item),
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

  hideTooltip(): void {
    this.tooltip.hide();
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
        temporary: { slots: this.lastLayout.sections.temporary.slots.map(slot => ({ ...slot })) },
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

  private drawSlot(layout: SlotLayout, item: ShopItem | null, selected: boolean, disabled: boolean, villageGold: number, costResolver: (item: ShopItem) => number, onClick: (event: any) => void): void {
    const g = new Graphics();
    const scale = selected ? 1.06 : 1;
    const width = layout.width * scale;
    const height = layout.height * scale;
    const x = layout.centerX - width / 2;
    const y = layout.centerY - height / 2;
    const effectiveCost = item ? costResolver(item) : 0;
    const unaffordable = Boolean(item && effectiveCost > villageGold);
    g.roundRect(x, y, width, height, 6);
    if (item) {
      const color = itemSlotColor(item);
      g.fill({ color: unaffordable ? UNAFFORDABLE_BG : blendColors(CARD_BG, tintSlot(color), 0.3), alpha: unaffordable ? 0.9 : 0.96 });
      g.stroke({ width: selected ? 3 : 2, color: selected ? 0xfff0aa : unaffordable ? UNAFFORDABLE_STROKE : color, alpha: unaffordable ? 0.72 : 1 });
    } else {
      g.fill({ color: 0xb9d6ba, alpha: 0.2 });
      g.stroke({ width: 1, color: 0x6d8f78, alpha: 0.8 });
    }
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = item ? 'pointer' : 'default';
    }
    if (item && !disabled) {
      bindPressable(g, {
        onPointerActivity: (event) => this.onUiPointerActivity?.(event),
        onPress: onClick,
        onLongPress: () => this.showItemTooltip(item, layout.centerX, layout.centerY),
        onHoverStart: () => this.showItemTooltip(item, layout.centerX, layout.centerY),
        onHoverEnd: () => this.tooltip.hide(),
      });
    } else if (!disabled) {
      bindPressable(g, {
        onPointerActivity: (event) => this.onUiPointerActivity?.(event),
        onPress: onClick,
      });
    }
    this.container.addChild(g);

    if (!item) return;

    const headerH = Math.max(18, Math.round(height * 0.23));
    const spellAttack = getSpellAttackDisplay(item);
    const statH = item.kind === 'block' || spellAttack ? Math.max(18, Math.round(height * 0.23)) : 0;
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
    } else if (item.kind === 'spell') {
      this.drawSpellIcon(visual, visualSize, layout.centerX, visualCenterY, unaffordable);
      if (spellAttack) {
        this.drawSpellAttackBar(x + innerPad, y + height - statH - 3, width - innerPad * 2, statH, spellAttack.value, unaffordable);
      }
    } else {
      this.drawActionIcon(visual, visualSize, layout.centerX, visualCenterY, unaffordable);
    }

    const cost = new Text({
      text: costText(item, effectiveCost),
      style: {
        fontFamily: 'Arial',
        fontSize: Math.max(11, Math.floor(layout.width * 0.15)),
        fill: item.kind === 'action' ? 0x9cff9c : unaffordable ? UNAFFORDABLE_COST : 0xffe08a,
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
      bindPressable(g, {
        onPointerActivity: (event) => this.onUiPointerActivity?.(event),
        onPress: onClick,
        onLongPress: () => this.tooltip.show([{ text: locked ? '解除锁定' : '锁定商品' }], layout.centerX, layout.centerY),
        onHoverStart: () => this.tooltip.show([{ text: locked ? '解除锁定' : '锁定商品' }], layout.centerX, layout.centerY),
        onHoverEnd: () => this.tooltip.hide(),
      });
    }
    this.container.addChild(g);

    this.drawLockIcon(layout, locked);
  }

  private drawRefreshButton(layout: RefreshButtonLayout, cost: number, freeCredits: number, disabled: boolean): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 7);
    g.fill({ color: 0x2f5f3a, alpha: 0.96 });
    g.stroke({ width: 2, color: 0xc9ec9e, alpha: 0.95 });
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = 'pointer';
      const showTooltip = () => this.tooltip.show([
        { text: '刷新随机区', bold: true },
        { text: freeCredits > 0 ? `免费次数: ${freeCredits}` : `消耗: ${cost} 金币`, color: 0xb7f7a2, bold: true },
      ], layout.centerX, layout.centerY);
      bindPressable(g, {
        onPointerActivity: (event) => this.onUiPointerActivity?.(event),
        onPress: (event) => {
          this.onUiPointerActivity?.(event);
          this.onRefreshClicked?.();
        },
        onLongPress: showTooltip,
        onHoverStart: showTooltip,
        onHoverEnd: () => this.tooltip.hide(),
      });
    }
    this.container.addChild(g);

    const text = new Text({
      text: freeCredits > 0 ? '刷新\n免费' : `刷新\n${cost}`,
      style: { fontFamily: 'Arial', fontSize: 12, fill: 0xffffff, fontWeight: 'bold', align: 'center' },
    });
    text.anchor.set(0.5);
    text.position.set(layout.centerX, layout.centerY);
    text.eventMode = 'none';
    this.container.addChild(text);
  }

  private showItemTooltip(item: ShopItem, x: number, y: number): void {
    const descriptions = itemDescriptions(item);
    const tagText = item.tags.length > 0 ? item.tags.join('、') : '无';
    this.tooltip.show([
      { text: `${item.label}  ${costText(item)}` },
      { text: tooltipSummary(item), color: 0xb7f7a2, bold: true },
      { text: `标签: ${tagText}`, color: 0xcfe6f6 },
      ...descriptions.map(text => ({ text: `- ${text}` })),
    ], x, y);
  }

  private buildLayout(baseCount: number = 3, randomCount: number = 4, temporaryCount: number = 0): ShopLayoutSnapshot {
    if (this.renderer.layoutProfile === 'mobilePortrait') {
      return this.buildWrappedLayout(baseCount, randomCount, temporaryCount);
    }
    const slotGap = 10;
    const sectionGap = 28;
    const visibleSectionCount = 2 + (temporaryCount > 0 ? 1 : 0);
    const visibleSlotCount = baseCount + randomCount + temporaryCount;
    const preferredSlotWidth = Math.max(64, Math.min(82, Math.floor(this.renderer.screenW / 17)));
    const fixedWidth =
      Math.max(0, visibleSlotCount - visibleSectionCount) * slotGap
      + visibleSectionCount * sectionGap;
    const fitSlotWidth = Math.floor((this.renderer.screenW - fixedWidth) / (visibleSlotCount + 0.8));
    const slotWidth = Math.max(48, Math.min(preferredSlotWidth, fitSlotWidth));
    const slotHeight = Math.round(slotWidth * 1.12);
    const refreshWidth = Math.max(58, Math.floor(slotWidth * 0.8));
    const baseSlotsWidth = baseCount * slotWidth + Math.max(0, baseCount - 1) * slotGap;
    const randomSlotsWidth = randomCount * slotWidth + Math.max(0, randomCount - 1) * slotGap;
    const temporarySlotsWidth = temporaryCount > 0 ? temporaryCount * slotWidth + Math.max(0, temporaryCount - 1) * slotGap : 0;
    const totalWidth =
      baseSlotsWidth
      + sectionGap
      + randomSlotsWidth
      + (temporarySlotsWidth > 0 ? sectionGap + temporarySlotsWidth : 0)
      + sectionGap
      + refreshWidth;
    const startX = Math.floor((this.renderer.screenW - totalWidth) / 2);
    const y = 38;
    const baseSlots = buildSlots(startX, y, baseCount, slotWidth, slotHeight, slotGap);
    const randomStart = startX + baseSlotsWidth + sectionGap;
    const randomSlots = buildSlots(randomStart, y, randomCount, slotWidth, slotHeight, slotGap).map(slot => ({
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
    const temporaryStart = randomStart + randomSlotsWidth + sectionGap;
    const temporarySlots = temporarySlotsWidth > 0 ? buildSlots(temporaryStart, y, temporaryCount, slotWidth, slotHeight, slotGap) : [];
    const refreshX = temporarySlotsWidth > 0
      ? temporaryStart + temporarySlotsWidth + sectionGap
      : temporaryStart;
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
        temporary: { slots: temporarySlots },
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

  private buildWrappedLayout(baseCount: number, randomCount: number, temporaryCount: number): ShopLayoutSnapshot {
    const slotGap = 8;
    const sectionGap = 20;
    const slotWidth = Math.max(64, Math.min(78, Math.floor(this.renderer.screenW / 9.2)));
    const slotHeight = Math.round(slotWidth * 1.1);
    const refreshWidth = Math.max(58, Math.floor(slotWidth * 0.84));
    const baseSlotsWidth = baseCount * slotWidth + Math.max(0, baseCount - 1) * slotGap;
    const randomSlotsWidth = randomCount * slotWidth + Math.max(0, randomCount - 1) * slotGap;
    const topWidth = baseSlotsWidth + sectionGap + refreshWidth;
    const rowWidth = Math.max(topWidth, randomSlotsWidth);
    const startX = Math.floor((this.renderer.screenW - rowWidth) / 2);
    const boardBottom = this.renderer.octagonCenterY + this.renderer.octagonRadius + 16;
    const desiredY = Math.floor(this.renderer.screenH - slotHeight * 2 - 108);
    const topY = Math.max(boardBottom, desiredY);
    const baseSlots = buildSlots(startX, topY, baseCount, slotWidth, slotHeight, slotGap);
    const refreshX = startX + baseSlotsWidth + sectionGap;
    const refreshButton = {
      x: refreshX,
      y: topY,
      width: refreshWidth,
      height: slotHeight + 40,
      centerX: refreshX + refreshWidth / 2,
      centerY: topY + (slotHeight + 40) / 2,
    };
    const randomY = topY + slotHeight + 58;
    const randomStart = Math.floor((this.renderer.screenW - randomSlotsWidth) / 2);
    const randomSlots = buildSlots(randomStart, randomY, randomCount, slotWidth, slotHeight, slotGap).map(slot => ({
      ...slot,
      lockButton: {
        x: slot.x + Math.max(12, Math.floor(slot.width * 0.25)),
        y: slot.y + slot.height + 22,
        width: slot.width - Math.max(24, Math.floor(slot.width * 0.5)),
        height: 22,
        centerX: slot.centerX,
        centerY: slot.y + slot.height + 33,
      },
    }));
    const temporarySlots = temporaryCount > 0
      ? buildSlots(
        Math.floor((this.renderer.screenW - (temporaryCount * slotWidth + Math.max(0, temporaryCount - 1) * slotGap)) / 2),
        Math.max(18, topY - slotHeight - 42),
        temporaryCount,
        slotWidth,
        slotHeight,
        slotGap,
      )
      : [];

    return {
      sections: {
        base: { slots: baseSlots },
        random: { slots: randomSlots },
        temporary: { slots: temporarySlots },
      },
      refreshButton,
    };
  }

  private drawSpellAttackBar(x: number, y: number, width: number, height: number, attack: number, dimmed: boolean = false): void {
    const bar = new Graphics();
    bar.roundRect(x, y, width, height, 4);
    bar.fill({ color: 0x10202a, alpha: dimmed ? 0.58 : 0.8 });
    bar.roundRect(x, y, width, height, 4);
    bar.fill({ color: dimmed ? 0x6a3030 : ATTACK_COLOR, alpha: dimmed ? 0.52 : 0.94 });
    bar.eventMode = 'none';
    this.container.addChild(bar);

    const fontSize = Math.max(12, Math.floor(height * 0.72));
    this.drawCenteredText(`${attack}`, x + width / 2, y + height / 2, fontSize, dimmed);
  }

  private drawActionIcon(g: Graphics, size: number, x: number, y: number, dimmed: boolean = false): void {
    g.position.set(x, y);
    g.roundRect(-size * 0.56, -size * 0.38, size * 1.12, size * 0.76, size * 0.14);
    g.fill({ color: dimmed ? 0x2d4b37 : 0x3c8f55, alpha: dimmed ? 0.5 : 0.96 });
    g.stroke({ width: 2, color: dimmed ? UNAFFORDABLE_STROKE : 0xbfffc6, alpha: dimmed ? 0.65 : 0.98 });
    g.moveTo(-size * 0.22, -size * 0.56);
    g.lineTo(size * 0.22, -size * 0.56);
    g.lineTo(size * 0.34, -size * 0.38);
    g.lineTo(-size * 0.34, -size * 0.38);
    g.closePath();
    g.fill({ color: dimmed ? 0x6d7a70 : 0xe7fff0, alpha: dimmed ? 0.6 : 1 });
    g.rect(-size * 0.3, -size * 0.2, size * 0.6, size * 0.1);
    g.fill({ color: 0x10202a, alpha: 0.72 });
    g.rect(-size * 0.3, size * 0.02, size * 0.6, size * 0.1);
    g.fill({ color: 0x10202a, alpha: 0.72 });
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
  return getSpellTypeDescriptions(spellType);
}

function itemSlotColor(item: ShopItem): number {
  if (item.kind === 'block') return BLOCK_TYPE_TABLE[item.blockType].color;
  if (item.kind === 'action') return 0x4aad62;
  return 0x5f8dd3;
}

function costText(item: ShopItem, effectiveCost: number = item.cost): string {
  if (item.kind === 'action' && item.actionType === ShopActionType.SELL) return `+${item.baseReward} 金币`;
  return effectiveCost === item.cost ? `${item.cost} 金币` : `${effectiveCost} 金币`;
}

function selectionHint(item: ShopItem): string {
  if (item.kind === 'action' && item.actionType === ShopActionType.SELL) return '选择出售目标';
  if (item.kind === 'spell') return '选择法术目标';
  return '选择放置扇区';
}

function itemDescriptions(item: ShopItem): string[] {
  if (item.kind === 'block') return getBlockShopDescriptions(item.blockType, item.hp, item.attack);
  if (item.kind === 'action') return [...item.description];
  return getSpellDescriptions(item.spellType);
}

function tooltipSummary(item: ShopItem): string {
  if (item.kind === 'block') return `攻击 ${item.attack} / HP ${item.hp}`;
  if (item.kind === 'action') return '操作：点击合法目标后执行';
  const spellAttack = getSpellAttackDisplay(item);
  if (spellAttack) return `法术攻击 ${spellAttack.value}`;
  if ((item.tempAttack ?? 0) > 0) return `法术：临时攻击 +${item.tempAttack}`;
  return '法术：点击合法目标后释放';
}

function emptyLayout(): ShopLayoutSnapshot {
  const refreshButton = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  return {
    sections: {
      base: { slots: [] },
      random: { slots: [] },
      temporary: { slots: [] },
    },
    refreshButton,
  };
}
