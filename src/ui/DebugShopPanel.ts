import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { RelicDef, ShopItem } from '../config/blockTypes';
import { drawBlockVisual } from '../rendering/BlockVisualRegistry';
import { BlockType, SpellType, ShopActionType } from '../config/blockTypes';
import { BlockData } from '../models/Block';
import { getSpellAttackDisplay } from './ShopItemDisplay';

export type DebugShopMode = 'items' | 'relics';

interface RectLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface DebugShopPanelState {
  visible: boolean;
  mode: DebugShopMode;
  freePurchase: boolean;
  items: ShopItem[];
  relics: RelicDef[];
  disabled: boolean;
  villageGold: number;
  disabledRelicIds: Set<string>;
  costResolver: (item: ShopItem) => number;
}

export interface DebugShopLayoutSnapshot {
  panel: RectLayout;
  itemModeButton: RectLayout;
  relicModeButton: RectLayout;
  freeToggle: RectLayout;
  entries: Array<RectLayout & { id: string; disabled: boolean; muted: boolean }>;
  scrollOffset: number;
  contentHeight: number;
}

const PANEL_WIDTH = 284;
const PANEL_MARGIN = 8;
const TOP_HEIGHT = 102;
const ENTRY_HEIGHT = 76;
const ENTRY_GAP = 8;
const COLUMN_GAP = 8;

export class DebugShopPanel {
  private container: Container;
  private scrollContainer: Container;
  private contentContainer: Container;
  private maskGraphics: Graphics;
  private scrollOffset = 0;
  private lastState: DebugShopPanelState | null = null;
  private lastLayout: DebugShopLayoutSnapshot = emptyLayout();

  onItemSelected: ((itemId: string, event?: { pointerId?: number; type?: string }) => void) | null = null;
  onRelicSelected: ((relicId: string, event?: { pointerId?: number; type?: string }) => void) | null = null;
  onFreeToggled: ((event?: { pointerId?: number; type?: string }) => void) | null = null;
  onModeChanged: ((mode: DebugShopMode, event?: { pointerId?: number; type?: string }) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'DebugShopPanel';
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.on('wheel', (event: any) => this.handleWheel(event));
    this.container.on('pointerdown', (event) => this.onUiPointerActivity?.(event));
    renderer.getLayer(RenderLayer.DEBUG_UI).addChild(this.container);

    this.scrollContainer = new Container();
    this.scrollContainer.label = 'DebugShopScroll';
    this.contentContainer = new Container();
    this.contentContainer.label = 'DebugShopContent';
    this.maskGraphics = new Graphics();
    this.scrollContainer.addChild(this.contentContainer);
    this.scrollContainer.mask = this.maskGraphics;
    this.container.addChild(this.scrollContainer);
    this.container.addChild(this.maskGraphics);
  }

  draw(state: DebugShopPanelState): void {
    this.lastState = state;
    this.container.visible = state.visible;
    this.container.removeChildren();
    this.scrollContainer.removeChildren();
    this.contentContainer.removeChildren();
    this.scrollContainer.addChild(this.contentContainer);
    this.maskGraphics.clear();

    if (!state.visible) {
      this.lastLayout = emptyLayout();
      this.scrollOffset = 0;
      return;
    }

    const panel = this.panelLayout();
    const itemModeButton = rect(panel.x + 12, panel.y + 14, 76, 28);
    const relicModeButton = rect(itemModeButton.x + itemModeButton.width + 8, itemModeButton.y, 76, 28);
    const freeToggle = rect(panel.x + 12, panel.y + 54, 118, 28);
    const listTop = panel.y + TOP_HEIGHT;
    const listHeight = panel.height - TOP_HEIGHT - 12;
    const listMask = rect(panel.x + 10, listTop, panel.width - 20, listHeight);
    const entries = state.mode === 'items'
      ? state.items.map(item => ({ id: item.id, disabled: state.disabled || (!state.freePurchase && state.costResolver(item) > state.villageGold) }))
      : state.relics.map(relic => ({ id: relic.id, disabled: state.disabled || state.disabledRelicIds.has(relic.id) }));
    const contentHeight = this.contentHeight(entries.length, listMask.width);
    this.scrollOffset = clamp(this.scrollOffset, 0, Math.max(0, contentHeight - listHeight));
    this.lastLayout = {
      panel,
      itemModeButton,
      relicModeButton,
      freeToggle,
      entries: [],
      scrollOffset: this.scrollOffset,
      contentHeight,
    };

    this.drawPanelBackground(panel);
    this.container.addChild(this.scrollContainer);
    this.container.addChild(this.maskGraphics);
    this.container.hitArea = new Rectangle(panel.x, panel.y, panel.width, panel.height);

    this.maskGraphics.rect(listMask.x, listMask.y, listMask.width, listMask.height);
    this.maskGraphics.fill({ color: 0xffffff, alpha: 1 });
    this.scrollContainer.position.set(0, -this.scrollOffset);

    if (state.mode === 'items') this.drawItemEntries(state, listMask);
    else this.drawRelicEntries(state, listMask);
    this.drawModeButton(itemModeButton, '物品', state.mode === 'items', (event) => this.onModeChanged?.('items', event));
    this.drawModeButton(relicModeButton, '遗物', state.mode === 'relics', (event) => this.onModeChanged?.('relics', event));
    this.drawFreeToggle(freeToggle, state.freePurchase);
    this.drawHint(panel, state.mode);
    this.drawScrollbar(listMask, contentHeight);
  }

  getLayoutSnapshot(): DebugShopLayoutSnapshot {
    return {
      panel: { ...this.lastLayout.panel },
      itemModeButton: { ...this.lastLayout.itemModeButton },
      relicModeButton: { ...this.lastLayout.relicModeButton },
      freeToggle: { ...this.lastLayout.freeToggle },
      entries: this.lastLayout.entries.map(entry => ({ ...entry })),
      scrollOffset: this.lastLayout.scrollOffset,
      contentHeight: this.lastLayout.contentHeight,
    };
  }

  resetScroll(): void {
    this.scrollOffset = 0;
  }

  private drawItemEntries(state: DebugShopPanelState, listMask: RectLayout): void {
    state.items.forEach((item, index) => {
      const layout = this.entryLayout(index, listMask);
      const unaffordable = !state.freePurchase && state.costResolver(item) > state.villageGold;
      const disabled = state.disabled || unaffordable;
      this.lastLayout.entries.push({ ...layout, id: item.id, disabled, muted: state.disabled });
      this.drawEntry(layout, item.label, item.tags.join('、') || '无标签', disabled, state.disabled, (event) => this.onItemSelected?.(item.id, event));
      if (item.kind === 'block') {
        const visual = new Graphics();
        drawBlockVisual(item.blockType, visual, 18, displayBlock(item.blockType, item.hp, item.attack));
        visual.alpha = state.disabled ? 0.76 : 1;
        visual.position.set(layout.x + 27, layout.y + 36);
        visual.eventMode = 'none';
        this.contentContainer.addChild(visual);
        this.drawSmallText(`${item.attack}/${item.hp}`, layout.x + layout.width - 30, layout.y + 50, state.disabled);
      } else if (item.kind === 'spell') {
        this.drawSpellGlyph(layout.x + 27, layout.y + 36, state.disabled);
        const attack = getSpellAttackDisplay(item);
        this.drawSmallText(attack ? `${attack.value}` : spellLabel(item.spellType), layout.x + layout.width - 35, layout.y + 50, state.disabled, attack ? 0xff9a9a : 0xffffff);
      } else if (item.kind === 'action') {
        this.drawSmallText(actionLabel(item.actionType), layout.x + layout.width - 35, layout.y + 50, state.disabled);
      }
      const cost = state.freePurchase ? '免费' : `${state.costResolver(item)} 金`;
      this.drawSmallText(cost, layout.x + layout.width - 34, layout.y + 18, state.disabled, unaffordable ? 0xd0a95a : (state.freePurchase ? 0xbfffc6 : 0xffe08a));
    });
  }

  private drawRelicEntries(state: DebugShopPanelState, listMask: RectLayout): void {
    state.relics.forEach((relic, index) => {
      const layout = this.entryLayout(index, listMask);
      const disabled = state.disabled || state.disabledRelicIds.has(relic.id);
      this.lastLayout.entries.push({ ...layout, id: relic.id, disabled, muted: disabled });
      this.drawEntry(layout, relic.label, relic.description[0] ?? '遗物', disabled, disabled, (event) => this.onRelicSelected?.(relic.id, event));
      const icon = new Graphics();
      icon.circle(0, 0, 15);
      icon.fill({ color: relic.color, alpha: disabled ? 0.34 : 0.92 });
      icon.stroke({ width: 1.5, color: 0xffffff, alpha: disabled ? 0.22 : 0.66 });
      icon.position.set(layout.x + 27, layout.y + 37);
      icon.eventMode = 'none';
      this.contentContainer.addChild(icon);
      if (disabled) this.drawSmallText('已满', layout.x + layout.width - 34, layout.y + 18, true, 0xff9a9a);
    });
  }

  private drawPanelBackground(panel: RectLayout): void {
    const bg = new Graphics();
    bg.roundRect(panel.x, panel.y, panel.width, panel.height, 8);
    bg.fill({ color: 0x172836, alpha: 0.94 });
    bg.stroke({ width: 2, color: 0x9ed8ff, alpha: 0.62 });
    bg.eventMode = 'none';
    this.container.addChild(bg);
  }

  private drawModeButton(layout: RectLayout, label: string, active: boolean, onClick: (event: any) => void): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 6);
    g.fill({ color: active ? 0x2d6b83 : 0x203746, alpha: 0.96 });
    g.stroke({ width: 1.5, color: active ? 0xc9f2ff : 0x7894a6, alpha: 0.9 });
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointerdown', (event) => {
      this.onUiPointerActivity?.(event);
      onClick(event);
    });
    this.container.addChild(g);
    this.drawText(label, layout.centerX, layout.centerY, 14, 0xffffff, true);
  }

  private drawFreeToggle(layout: RectLayout, checked: boolean): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 6);
    g.fill({ color: checked ? 0x2f6b42 : 0x203746, alpha: 0.96 });
    g.stroke({ width: 1.5, color: checked ? 0xbfffc6 : 0x7894a6, alpha: 0.9 });
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointerdown', (event) => {
      this.onUiPointerActivity?.(event);
      this.onFreeToggled?.(event);
    });
    this.container.addChild(g);
    const box = new Graphics();
    box.roundRect(layout.x + 8, layout.y + 7, 14, 14, 3);
    box.fill({ color: checked ? 0xbfffc6 : 0x0d1b24, alpha: 0.96 });
    box.stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
    this.container.addChild(box);
    if (checked) this.drawText('x', layout.x + 15, layout.y + 14, 14, 0x10202a, true);
    this.drawText('免费购买', layout.x + 70, layout.centerY, 13, 0xffffff, true);
  }

  private drawHint(panel: RectLayout, mode: DebugShopMode): void {
    this.drawText(mode === 'items' ? '调试商店' : '调试遗物', panel.x + panel.width - 56, panel.y + 28, 13, 0xcfe6f6, true);
  }

  private drawEntry(layout: RectLayout, title: string, subtitle: string, disabled: boolean, muted: boolean, onClick: (event: any) => void): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 7);
    g.fill({ color: muted ? 0x1b2d3a : 0x203746, alpha: muted ? 0.9 : 0.96 });
    g.stroke({ width: 1.4, color: muted ? 0x6f8c9f : 0x8ed4ff, alpha: muted ? 0.62 : 0.74 });
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = 'pointer';
      g.on('pointerdown', (event) => {
        this.onUiPointerActivity?.(event);
        onClick(event);
      });
    }
    this.contentContainer.addChild(g);
    this.drawContentText(title, layout.x + 50, layout.y + 13, 13, muted ? 0xd5e2e8 : 0xfff3d4, true, layout.width - 58);
    this.drawContentText(subtitle, layout.x + 50, layout.y + 35, 11, muted ? 0xb6c8d2 : 0xcfe6f6, false, layout.width - 58);
  }

  private drawScrollbar(listMask: RectLayout, contentHeight: number): void {
    if (contentHeight <= listMask.height) return;
    const track = new Graphics();
    const x = listMask.x + listMask.width - 5;
    track.roundRect(x, listMask.y + 4, 4, listMask.height - 8, 2);
    track.fill({ color: 0x0d1b24, alpha: 0.72 });
    const thumbH = Math.max(28, (listMask.height / contentHeight) * (listMask.height - 8));
    const travel = listMask.height - 8 - thumbH;
    const thumbY = listMask.y + 4 + travel * (this.scrollOffset / Math.max(1, contentHeight - listMask.height));
    track.roundRect(x, thumbY, 4, thumbH, 2);
    track.fill({ color: 0x9ed8ff, alpha: 0.86 });
    this.container.addChild(track);
  }

  private drawSpellGlyph(x: number, y: number, disabled: boolean): void {
    const g = new Graphics();
    g.circle(0, 0, 17);
    g.fill({ color: disabled ? 0x30465c : 0x5f8dd3, alpha: disabled ? 0.42 : 0.92 });
    g.stroke({ width: 1.5, color: disabled ? 0x52606a : 0xb7dcff, alpha: 0.86 });
    g.poly([0, -13, 4, -2, 13, -2, 6, 4, 8, 13, 0, 6, -8, 13, -6, 4, -13, -2, -4, -2]);
    g.fill({ color: disabled ? 0x8f9aa3 : 0xf4fbff, alpha: disabled ? 0.58 : 1 });
    g.position.set(x, y);
    g.eventMode = 'none';
    this.contentContainer.addChild(g);
  }

  private drawText(text: string, x: number, y: number, fontSize: number, fill: number, bold: boolean): void {
    const label = new Text({
      text,
      style: { fontFamily: 'Arial', fontSize, fill, fontWeight: bold ? 'bold' : 'normal', stroke: { color: 0x10202a, width: 2 } },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.eventMode = 'none';
    this.container.addChild(label);
  }

  private drawContentText(text: string, x: number, y: number, fontSize: number, fill: number, bold: boolean, wordWrapWidth: number): void {
    const label = new Text({
      text,
      style: {
        fontFamily: 'Arial',
        fontSize,
        fill,
        fontWeight: bold ? 'bold' : 'normal',
        wordWrap: true,
        wordWrapWidth,
        breakWords: true,
        lineHeight: fontSize + 4,
        stroke: bold ? { color: 0x10202a, width: 2 } : undefined,
      },
    });
    label.position.set(x, y);
    label.eventMode = 'none';
    this.contentContainer.addChild(label);
  }

  private drawSmallText(text: string, x: number, y: number, disabled: boolean, fill: number = 0xffffff): void {
    const label = new Text({
      text,
      style: { fontFamily: 'Arial', fontSize: 11, fill: disabled ? 0xb6c8d2 : fill, fontWeight: 'bold', stroke: { color: 0x10202a, width: 2 } },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.eventMode = 'none';
    this.contentContainer.addChild(label);
  }

  private handleWheel(event: any): void {
    if (!this.lastState?.visible) return;
    this.onUiPointerActivity?.(event);
    event.preventDefault?.();
    event.stopPropagation?.();
    const panel = this.panelLayout();
    const listHeight = panel.height - TOP_HEIGHT - 12;
    const contentHeight = this.lastLayout.contentHeight;
    const delta = event.deltaY ?? event.nativeEvent?.deltaY ?? 0;
    this.scrollOffset = clamp(this.scrollOffset + delta, 0, Math.max(0, contentHeight - listHeight));
    if (this.lastState) this.draw(this.lastState);
  }

  private panelLayout(): RectLayout {
    const height = this.renderer.screenH - PANEL_MARGIN * 2;
    const x = Math.max(0, this.renderer.screenW - PANEL_WIDTH - PANEL_MARGIN);
    const y = PANEL_MARGIN;
    return rect(x, y, PANEL_WIDTH, height);
  }

  private entryLayout(index: number, listMask: RectLayout): RectLayout {
    const colW = Math.floor((listMask.width - COLUMN_GAP) / 2);
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = listMask.x + col * (colW + COLUMN_GAP);
    const y = listMask.y + row * (ENTRY_HEIGHT + ENTRY_GAP);
    return rect(x, y, colW, ENTRY_HEIGHT);
  }

  private contentHeight(count: number, _listWidth: number): number {
    if (count <= 0) return 0;
    const rows = Math.ceil(count / 2);
    return rows * ENTRY_HEIGHT + Math.max(0, rows - 1) * ENTRY_GAP;
  }
}

function rect(x: number, y: number, width: number, height: number): RectLayout {
  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

function emptyLayout(): DebugShopLayoutSnapshot {
  const empty = rect(0, 0, 0, 0);
  return {
    panel: { ...empty },
    itemModeButton: { ...empty },
    relicModeButton: { ...empty },
    freeToggle: { ...empty },
    entries: [],
    scrollOffset: 0,
    contentHeight: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function displayBlock(type: BlockType, hp: number, attack: number): BlockData {
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

function spellLabel(type: SpellType): string {
  if (type === SpellType.MISSILE) return '飞弹';
  if (type === SpellType.MAGIC_BOOK) return '即用';
  if (type === SpellType.BULWARK) return '全体';
  return '目标';
}

function actionLabel(type: ShopActionType): string {
  return type === ShopActionType.SELL ? '出售' : '操作';
}
