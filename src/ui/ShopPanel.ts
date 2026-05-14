import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { BLOCK_TYPE_TABLE, BlockType, ShopItem, SpellType } from '../config/blockTypes';
import { getBlockEffectDescriptions } from '../effects/BlockEffectRegistry';
import {
  RefreshSectionKey,
  SHOP_SECTION_LABELS,
  SHOP_SECTION_ORDER,
  SHOP_TOTAL_SLOT_LIMIT,
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

interface ButtonLayout extends SlotLayout {}

interface SectionLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  slots: SlotLayout[];
  addButton: ButtonLayout;
}

export interface ShopLayoutSnapshot {
  sections: Record<ShopSectionKey, {
    slots: SlotLayout[];
    addButton: ButtonLayout;
  }>;
}

export class ShopPanel {
  private container: Container;
  onSectionItemDropped: ((section: RefreshSectionKey, sourceIndex: number, lockedIndex: number) => void) | null = null;
  onSectionItemSelected: ((section: ShopSectionKey, index: number) => void) | null = null;
  onSectionExpanded: ((section: ShopSectionKey) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;
  private dragging: { item: ShopItem; section: RefreshSectionKey; index: number; width: number; height: number } | null = null;
  private dragGraphics = new Graphics();
  private tooltip: TooltipPanel;
  private lastLayout: Record<ShopSectionKey, SectionLayout> = {} as Record<ShopSectionKey, SectionLayout>;

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
    this.lastLayout = this.buildLayout(state);

    const layouts = SHOP_SECTION_ORDER.map(section => this.lastLayout[section]);
    const left = Math.min(...layouts.map(layout => layout.x));
    const top = Math.min(...layouts.map(layout => layout.y));
    const right = Math.max(...layouts.map(layout => layout.x + layout.width));
    const bottom = Math.max(...layouts.map(layout => layout.y + layout.height));

    const bg = new Graphics();
    bg.roundRect(left - 18, top - 18, right - left + 36, bottom - top + 24, 10);
    bg.fill({ color: 0x21374a, alpha: 0.8 });
    bg.stroke({ width: 2, color: 0xd7b46a, alpha: 0.7 });
    bg.eventMode = 'none';
    this.container.addChild(bg);

    const title = new Text({ text: '商店', style: { fontFamily: 'Arial', fontSize: 13, fill: 0xffcc44, fontWeight: 'bold' } });
    title.anchor.set(0.5, 0);
    title.position.set(this.renderer.screenW / 2, top - 10);
    title.eventMode = 'none';
    this.container.addChild(title);

    for (const section of SHOP_SECTION_ORDER) {
      this.drawSection(section, state, selected, disabled);
    }

    if (selected) {
      const hint = new Text({
        text: '选择放置的扇区',
        style: { fontFamily: 'Arial', fontSize: 15, fill: 0xfff0bb, fontWeight: 'bold', stroke: { color: 0x21374a, width: 3 } },
      });
      hint.anchor.set(0.5, 0);
      hint.position.set(this.renderer.screenW / 2, bottom + 4);
      hint.eventMode = 'none';
      this.container.addChild(hint);
    }
  }

  isTooltipVisible(): boolean {
    return this.tooltip.isVisible();
  }

  isDragging(): boolean {
    return this.dragging !== null;
  }

  getTooltipLines(): string[] {
    return this.tooltip.getLines();
  }

  getTooltipLayout(): TooltipLineLayout[] {
    return this.tooltip.getLineLayout();
  }

  getLayoutSnapshot(): ShopLayoutSnapshot {
    const sections = {} as ShopLayoutSnapshot['sections'];
    for (const section of SHOP_SECTION_ORDER) {
      sections[section] = {
        slots: this.lastLayout[section]?.slots.map(slot => ({ ...slot })) ?? [],
        addButton: this.lastLayout[section]?.addButton ? { ...this.lastLayout[section].addButton } : emptyButton(),
      };
    }
    return { sections };
  }

  private drawSection(section: ShopSectionKey, state: ShopState, selected: ShopSelection | null, disabled: boolean): void {
    const layout = this.lastLayout[section];
    const slots = state[section];

    const frame = new Graphics();
    frame.roundRect(layout.x - 6, layout.y - 6, layout.width + 12, layout.height - 4, 8);
    frame.fill({ color: 0xffffff, alpha: 0.03 });
    frame.stroke({ width: 1, color: 0x55738c, alpha: 0.7 });
    frame.eventMode = 'none';
    this.container.addChild(frame);

    const header = new Text({
      text: SHOP_SECTION_LABELS[section],
      style: { fontFamily: 'Arial', fontSize: 11, fill: 0xcfe6f6, fontWeight: 'bold' },
    });
    header.anchor.set(0.5, 0);
    header.position.set(layout.x + layout.width / 2, layout.y - 2);
    header.eventMode = 'none';
    this.container.addChild(header);

    slots.forEach((item, index) => {
      this.drawSlot(layout.slots[index], item, selected?.area === section && selected.index === index, disabled, (event) => {
        this.onUiPointerActivity?.(event);
        if (!item) return;
        if (section === 'locked') {
          this.onSectionItemSelected?.(section, index);
          return;
        }
        this.startRefreshSectionGesture(item, section, index, layout.slots[index], event);
      });
    });

    this.drawAddButton(section, layout.addButton, state, disabled);
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
    name.position.set(layout.centerX, layout.y + layout.height * 0.28);
    name.eventMode = 'none';
    this.container.addChild(name);

    if (item.tags.length > 0) {
      const tag = new Text({
        text: `【${item.tags[0]}】`,
        style: { fontFamily: 'Arial', fontSize: Math.max(8, Math.floor(layout.width * 0.12)), fill: 0xaad7ff, fontWeight: 'bold' },
      });
      tag.anchor.set(0.5);
      tag.position.set(layout.centerX, layout.y + layout.height * 0.49);
      tag.eventMode = 'none';
      this.container.addChild(tag);
    }

    if (item.kind === 'block') {
      const power = new Text({
        text: `战力 ${item.combatPower}`,
        style: { fontFamily: 'Arial', fontSize: Math.max(9, Math.floor(layout.width * 0.13)), fill: 0xffffff },
      });
      power.anchor.set(0.5);
      power.position.set(layout.centerX, layout.y + layout.height * 0.64);
      power.eventMode = 'none';
      this.container.addChild(power);
    }

    const cost = new Text({
      text: `${item.cost}`,
      style: { fontFamily: 'Arial', fontSize: Math.max(12, Math.floor(layout.width * 0.18)), fill: 0xb7f7a2, fontWeight: 'bold', stroke: { color: 0x1b2a1e, width: 3 } },
    });
    cost.anchor.set(0.5);
    cost.position.set(layout.centerX, layout.y + layout.height * 0.82);
    cost.eventMode = 'none';
    this.container.addChild(cost);
  }

  private drawAddButton(section: ShopSectionKey, layout: ButtonLayout, state: ShopState, disabled: boolean): void {
    const atLimit = state.totalSlots >= SHOP_TOTAL_SLOT_LIMIT;
    const g = new Graphics();
    g.circle(layout.centerX, layout.centerY, layout.width / 2);
    g.fill({ color: atLimit ? 0x55646b : 0x2f5f3a, alpha: 0.96 });
    g.stroke({ width: 2, color: atLimit ? 0x95a7af : 0xc9ec9e, alpha: 0.95 });
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = atLimit ? 'default' : 'pointer';
      g.on('pointerover', () => this.showExpansionTooltip(section, state));
      g.on('pointerout', () => this.tooltip.hide());
      g.on('pointerdown', (event) => {
        this.onUiPointerActivity?.(event);
        if (atLimit) return;
        this.onSectionExpanded?.(section);
      });
    }
    this.container.addChild(g);

    const plus = new Text({
      text: '+',
      style: { fontFamily: 'Arial', fontSize: Math.max(14, Math.floor(layout.width * 0.7)), fill: 0xffffff, fontWeight: 'bold' },
    });
    plus.anchor.set(0.5);
    plus.position.set(layout.centerX, layout.centerY - 1);
    plus.eventMode = 'none';
    this.container.addChild(plus);
  }

  private startRefreshSectionGesture(
    item: ShopItem,
    section: RefreshSectionKey,
    index: number,
    slotLayout: SlotLayout,
    event: any,
  ): void {
    this.tooltip.hide();
    this.onUiPointerActivity?.(event);
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
      if (!startedDrag && Math.hypot(dx, dy) > 8) {
        startedDrag = true;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        this.startDrag(item, section, index, slotLayout, e);
      }
    };

    const onUp = (e: PointerEvent) => {
      this.onUiPointerActivity?.(e);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!startedDrag) this.onSectionItemSelected?.(section, index);
    };

    startClientX = (event as PointerEvent).clientX;
    startClientY = (event as PointerEvent).clientY;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private startDrag(item: ShopItem, section: RefreshSectionKey, index: number, slotLayout: SlotLayout, initialEvent?: PointerEvent): void {
    this.dragging = { item, section, index, width: slotLayout.width, height: slotLayout.height };
    const color = item.kind === 'block' ? BLOCK_TYPE_TABLE[item.blockType].color : 0x5f8dd3;
    this.dragGraphics.clear();
    this.dragGraphics.roundRect(0, 0, slotLayout.width, slotLayout.height, 6);
    this.dragGraphics.fill({ color, alpha: 0.72 });
    this.dragGraphics.stroke({ width: 2, color: 0xffffff });
    this.dragGraphics.visible = false;
    this.dragGraphics.eventMode = 'none';
    this.container.addChild(this.dragGraphics);

    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    const positionDrag = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = this.renderer.screenW / rect.width;
      const sy = this.renderer.screenH / rect.height;
      const cx = (e.clientX - rect.left) * sx;
      const cy = (e.clientY - rect.top) * sy;
      this.dragGraphics.position.set(cx - slotLayout.width / 2, cy - slotLayout.height / 2);
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
      const x = (e.clientX - rect.left) * sx;
      const y = (e.clientY - rect.top) * sy;

      const lockedLayout = this.lastLayout.locked;
      for (let lockedIndex = 0; lockedIndex < lockedLayout.slots.length; lockedIndex++) {
        if (containsPoint(lockedLayout.slots[lockedIndex], x, y)) {
          this.onSectionItemDropped?.(this.dragging.section, this.dragging.index, lockedIndex);
          break;
        }
      }
      this.dragging = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private showItemTooltip(item: ShopItem, x: number, y: number): void {
    const descriptions = item.kind === 'block'
      ? getBlockShopDescriptions(item.blockType, item.combatPower)
      : getSpellDescriptions(item.spellType);
    this.tooltip.show([
      { text: `${item.label}  ${item.cost}战力` },
      { text: item.kind === 'spell' ? '【法术】点击合法目标后释放' : '放置为 Lv1；同类叠加最高 Lv3', color: 0xb7f7a2, bold: true },
      ...descriptions.map(text => ({ text: `- ${text}` })),
    ], x, y);
  }

  private showExpansionTooltip(section: ShopSectionKey, state: ShopState): void {
    const button = this.lastLayout[section]?.addButton;
    if (!button) return;
    const lines = state.totalSlots >= SHOP_TOTAL_SLOT_LIMIT
      ? [{ text: `${SHOP_SECTION_LABELS[section]}区已达总上限`, bold: true }]
      : [
        { text: `${SHOP_SECTION_LABELS[section]}区扩展`, bold: true },
        { text: `消耗: ${state.nextExpansionCost} 战力`, color: 0xb7f7a2, bold: true },
      ];
    this.tooltip.show(lines, button.centerX, button.centerY);
  }

  private buildLayout(state: ShopState): Record<ShopSectionKey, SectionLayout> {
    const marginX = 56;
    const sectionGap = 16;
    const slotGap = 8;
    const totalSlots = SHOP_SECTION_ORDER.reduce((sum, section) => sum + state[section].length, 0);
    const totalGapWidth = (totalSlots - SHOP_SECTION_ORDER.length) * slotGap + (SHOP_SECTION_ORDER.length - 1) * sectionGap;
    const usableWidth = Math.max(520, this.renderer.screenW - marginX * 2 - totalGapWidth);
    const slotWidth = Math.max(60, Math.min(80, Math.floor(usableWidth / Math.max(totalSlots, 1))));
    const slotHeight = Math.round(slotWidth * 1.12);
    const sectionHeights = slotHeight + 54;
    const layouts = {} as Record<ShopSectionKey, SectionLayout>;

    let x = Math.floor((this.renderer.screenW - (totalSlots * slotWidth + totalGapWidth)) / 2);
    const y = 62;
    for (const section of SHOP_SECTION_ORDER) {
      const slotCount = state[section].length;
      const width = slotCount * slotWidth + Math.max(0, slotCount - 1) * slotGap;
      const slots: SlotLayout[] = [];
      for (let index = 0; index < slotCount; index++) {
        const slotX = x + index * (slotWidth + slotGap);
        slots.push({
          x: slotX,
          y: y + 18,
          width: slotWidth,
          height: slotHeight,
          centerX: slotX + slotWidth / 2,
          centerY: y + 18 + slotHeight / 2,
        });
      }
      const buttonSize = Math.max(20, Math.floor(slotWidth * 0.38));
      layouts[section] = {
        x,
        y,
        width,
        height: sectionHeights,
        slots,
        addButton: {
          x: x + width / 2 - buttonSize / 2,
          y: y + 18 + slotHeight + 10,
          width: buttonSize,
          height: buttonSize,
          centerX: x + width / 2,
          centerY: y + 18 + slotHeight + 10 + buttonSize / 2,
        },
      };
      x += width + sectionGap;
    }
    return layouts;
  }
}

function tintSlot(color: number): number {
  return ((Math.floor(((color >> 16) & 0xff) * 0.3)) << 16)
    | ((Math.floor(((color >> 8) & 0xff) * 0.3)) << 8)
    | Math.floor((color & 0xff) * 0.3);
}

function containsPoint(layout: SlotLayout, x: number, y: number): boolean {
  return x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height;
}

function emptyButton(): ButtonLayout {
  return { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
}

function getBlockShopDescriptions(blockType: BlockType, combatPower: number): string[] {
  const levels = [1, 2, 3] as const;
  const descriptionsByLevel = levels.map(level => ({
    level,
    descriptions: getBlockEffectDescriptions(blockType, level).filter(line => !isLevelSummaryLine(line)),
  }));

  const occurrenceCount = new Map<string, number>();
  for (const { descriptions } of descriptionsByLevel) {
    for (const line of new Set(descriptions)) {
      occurrenceCount.set(line, (occurrenceCount.get(line) ?? 0) + 1);
    }
  }
  const staticDescriptions = new Set([...occurrenceCount.entries()]
    .filter(([, count]) => count === levels.length)
    .map(([line]) => line));

  const lines = [`当前战力: ${combatPower}`];
  for (const { level, descriptions } of descriptionsByLevel) {
    const variableDescriptions = descriptions
      .filter(line => !staticDescriptions.has(line))
      .map(normalizeLevelDescription);
    if (variableDescriptions.length > 0) {
      lines.push(`Lv${level}: ${variableDescriptions.join('，')}`);
    }
  }

  for (const description of descriptionsByLevel[0].descriptions) {
    if (staticDescriptions.has(description)) lines.push(description);
  }

  return dedupe(lines);
}

function normalizeLevelDescription(line: string): string {
  return line.replace(/[：:]\s*/u, ' ');
}

function isLevelSummaryLine(line: string): boolean {
  return /Lv\s*1\s*\/\s*Lv\s*2\s*\/\s*Lv\s*3/i.test(line);
}

function dedupe(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    result.push(line);
  }
  return result;
}

function getSpellDescriptions(spellType: SpellType): string[] {
  if (spellType === SpellType.FOCUS_FIELD) return ['指定友方，吸收左右相邻友方各一半战力'];
  if (spellType === SpellType.SACRIFICE) return ['摧毁指定友方，随机升级另一个友方'];
  if (spellType === SpellType.BULWARK) return ['所有友方【无法攻击】地块战力 +5'];
  if (spellType === SpellType.SHIELD_CRUSH) return ['摧毁友方【无法攻击】地块，对同扇区龙造成等同战力伤害'];
  return ['暂无说明'];
}
