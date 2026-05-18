import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { RelicDef, RELIC_DEF_BY_ID } from '../config/blockTypes';
import { OwnedRelic, RelicState } from '../systems/RelicSystem';
import { TooltipPanel, TooltipPanelSnapshot } from './TooltipPanel';
import { bindPressable } from './PressInteractions';

interface RectLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface RelicPanelLayoutSnapshot {
  cards: Array<RectLayout & { id: string }>;
  confirmButton: RectLayout;
  ownedIcons: Array<RectLayout & { id: string; count: number }>;
}

export class RelicPanel {
  private container: Container;
  private ownedContainer: Container;
  private ownedTooltip: TooltipPanel;
  private lastLayout: RelicPanelLayoutSnapshot = { cards: [], confirmButton: emptyRect(), ownedIcons: [] };
  onRelicSelected: ((id: string, event?: { pointerId?: number; type?: string }) => void) | null = null;
  onConfirm: ((event?: { pointerId?: number; type?: string }) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'RelicChoicePanel';
    renderer.getLayer(RenderLayer.OVERLAY).addChild(this.container);

    this.ownedContainer = new Container();
    this.ownedContainer.label = 'RelicOwnedStrip';
    renderer.getLayer(RenderLayer.UI).addChild(this.ownedContainer);

    this.ownedTooltip = new TooltipPanel(renderer, 'RelicOwnedTooltip');
  }

  draw(state: RelicState): void {
    this.container.removeChildren();
    this.ownedContainer.removeChildren();
    this.drawOwned(state.owned);

    if (state.pendingChoices.length === 0) {
      this.lastLayout.cards = [];
      this.lastLayout.confirmButton = emptyRect();
      return;
    }

    const shade = new Graphics();
    shade.rect(0, 0, this.renderer.screenW, this.renderer.screenH);
    shade.fill({ color: 0x081018, alpha: 0.58 });
    shade.eventMode = 'static';
    this.container.addChild(shade);

    const cards = this.buildCardLayouts(state.pendingChoices.length);
    this.lastLayout.cards = state.pendingChoices.map((relic, index) => ({ ...cards[index], id: relic.id }));

    for (let i = 0; i < state.pendingChoices.length; i++) {
      this.drawCard(state.pendingChoices[i], cards[i], state.selectedChoiceId === state.pendingChoices[i].id);
    }

    const confirm = this.buildConfirmLayout(cards);
    this.lastLayout.confirmButton = confirm;
    this.drawConfirmButton(confirm, Boolean(state.selectedChoiceId));
  }

  getLayoutSnapshot(): RelicPanelLayoutSnapshot {
    return {
      cards: this.lastLayout.cards.map(card => ({ ...card })),
      confirmButton: { ...this.lastLayout.confirmButton },
      ownedIcons: this.lastLayout.ownedIcons.map(icon => ({ ...icon })),
    };
  }

  isOwnedTooltipVisible(): boolean {
    return this.ownedTooltip.isVisible();
  }

  hideOwnedTooltip(): void {
    this.ownedTooltip.hide();
  }

  getOwnedTooltipLines(): string[] {
    return this.ownedTooltip.getLines();
  }

  getOwnedTooltipPanelSnapshot(): TooltipPanelSnapshot {
    return this.ownedTooltip.getPanelSnapshot();
  }

  private drawCard(relic: RelicDef, layout: RectLayout, selected: boolean): void {
    const card = new Container();
    card.position.set(layout.x, layout.y);
    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.on('pointerdown', (event) => {
      this.onUiPointerActivity?.(event);
      this.onRelicSelected?.(relic.id, event);
    });
    this.container.addChild(card);

    const bg = new Graphics();
    bg.roundRect(0, 0, layout.width, layout.height, 8);
    bg.fill({ color: 0x203746, alpha: 0.97 });
    bg.stroke({ width: selected ? 4 : 2, color: selected ? 0xfff0aa : relic.color, alpha: 0.96 });
    card.addChild(bg);

    const title = new Text({
      text: relic.label,
      style: {
        fontFamily: 'Arial',
        fontSize: 18,
        fill: 0xfff3d4,
        fontWeight: 'bold',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: layout.width - 18,
        stroke: { color: 0x10202a, width: 3 },
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(layout.width / 2, 12);
    card.addChild(title);

    const icon = new Graphics();
    icon.position.set(layout.width / 2, 86);
    drawRelicIcon(icon, relic.iconKey, relic.color, 42);
    card.addChild(icon);

    const desc = new Text({
      text: relic.description.join('\n'),
      style: {
        fontFamily: 'Arial',
        fontSize: 13,
        fill: 0xf7fbff,
        lineHeight: 18,
        wordWrap: true,
        wordWrapWidth: layout.width - 22,
        breakWords: true,
      },
    });
    desc.anchor.set(0.5, 0);
    desc.position.set(layout.width / 2, 132);
    card.addChild(desc);
  }

  private drawConfirmButton(layout: RectLayout, enabled: boolean): void {
    const button = new Graphics();
    button.roundRect(layout.x, layout.y, layout.width, layout.height, 7);
    button.fill({ color: enabled ? 0x2f6b42 : 0x27343a, alpha: enabled ? 0.96 : 0.72 });
    button.stroke({ width: 2, color: enabled ? 0xbfffc6 : 0x6e7f86, alpha: 0.95 });
    button.eventMode = enabled ? 'static' : 'none';
    if (enabled) {
      button.cursor = 'pointer';
      button.on('pointerdown', (event) => {
        this.onUiPointerActivity?.(event);
        this.onConfirm?.(event);
      });
    }
    this.container.addChild(button);

    const text = new Text({
      text: '确定',
      style: {
        fontFamily: 'Arial',
        fontSize: 18,
        fill: enabled ? 0xffffff : 0xa9b5ba,
        fontWeight: 'bold',
      },
    });
    text.anchor.set(0.5);
    text.position.set(layout.centerX, layout.centerY);
    text.eventMode = 'none';
    this.container.addChild(text);
  }

  private drawOwned(owned: OwnedRelic[]): void {
    const size = 42;
    const gap = 9;
    const total = owned.length * size + Math.max(0, owned.length - 1) * gap;
    const x = 12;
    const startY = this.renderer.screenH / 2 - total / 2;
    this.lastLayout.ownedIcons = [];

    owned.forEach((entry, index) => {
      const relic = RELIC_DEF_BY_ID.get(entry.id);
      if (!relic) return;
      const y = startY + index * (size + gap);
      const bg = new Graphics();
      bg.roundRect(x, y, size, size, 7);
      bg.fill({ color: 0x1d3342, alpha: 0.92 });
      bg.stroke({ width: 1.5, color: relic.color, alpha: 0.95 });
      bg.eventMode = 'static';
      bg.cursor = 'pointer';
      bindPressable(bg, {
        onPress: (event) => this.onUiPointerActivity?.(event),
        onLongPress: () => this.showOwnedTooltip(relic, entry.count, x + size + 8, y),
        onHoverStart: () => this.showOwnedTooltip(relic, entry.count, x + size + 8, y),
        onHoverEnd: () => this.ownedTooltip.hide(),
      });
      this.ownedContainer.addChild(bg);

      const icon = new Graphics();
      icon.position.set(x + size / 2, y + size / 2);
      drawRelicIcon(icon, relic.iconKey, relic.color, size * 0.34);
      this.ownedContainer.addChild(icon);

      if (entry.count > 1) {
        const count = new Text({
          text: `x${entry.count}`,
          style: { fontFamily: 'Arial', fontSize: 12, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } },
        });
        count.anchor.set(1, 1);
        count.position.set(x + size - 3, y + size - 1);
        count.eventMode = 'none';
        this.ownedContainer.addChild(count);
      }

      this.lastLayout.ownedIcons.push({ x, y, width: size, height: size, centerX: x + size / 2, centerY: y + size / 2, id: entry.id, count: entry.count });
    });
  }

  private showOwnedTooltip(relic: RelicDef, count: number, x: number, y: number): void {
    this.ownedTooltip.show([
      { text: relic.label },
      { text: `数量: ${count}`, color: 0xb7f7a2, bold: true },
      ...relic.description.map(text => ({ text: `- ${text}` })),
    ], x, y, { placement: 'right', align: 'top' });
  }

  private buildCardLayouts(count: number): RectLayout[] {
    const cardW = Math.max(150, Math.min(210, Math.floor(this.renderer.screenW / 5.2)));
    const cardH = Math.max(220, Math.min(270, Math.floor(this.renderer.screenH * 0.34)));
    const gap = Math.max(14, Math.min(24, Math.floor(this.renderer.screenW * 0.018)));
    const totalW = count * cardW + Math.max(0, count - 1) * gap;
    const startX = this.renderer.screenW / 2 - totalW / 2;
    const y = this.renderer.screenH / 2 - cardH / 2 - 18;
    return Array.from({ length: count }, (_, index) => {
      const x = startX + index * (cardW + gap);
      return { x, y, width: cardW, height: cardH, centerX: x + cardW / 2, centerY: y + cardH / 2 };
    });
  }

  private buildConfirmLayout(cards: RectLayout[]): RectLayout {
    const bottom = Math.max(...cards.map(card => card.y + card.height));
    const width = 140;
    const height = 42;
    const x = this.renderer.screenW / 2 - width / 2;
    const y = bottom + 20;
    return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
  }
}

export function drawRelicIcon(g: Graphics, iconKey: string, color: number, size: number): void {
  g.circle(0, 0, size);
  g.fill({ color, alpha: 0.88 });
  g.stroke({ width: 2, color: 0xffffff, alpha: 0.72 });

  if (iconKey.includes('missile')) {
    g.poly([0, -size * 0.75, size * 0.18, -size * 0.05, size * 0.58, size * 0.08, size * 0.18, size * 0.22, 0, size * 0.75, -size * 0.18, size * 0.22, -size * 0.58, size * 0.08, -size * 0.18, -size * 0.05]);
    g.fill(0xf4fbff);
    return;
  }
  if (iconKey.includes('shield')) {
    g.poly([0, -size * 0.72, size * 0.56, -size * 0.38, size * 0.42, size * 0.42, 0, size * 0.78, -size * 0.42, size * 0.42, -size * 0.56, -size * 0.38]);
    g.fill(0xeaf5ff);
    return;
  }
  if (iconKey.includes('gold') || iconKey.includes('coin')) {
    g.circle(0, 0, size * 0.5);
    g.fill(0xffe08a);
    g.stroke({ width: 2, color: 0x8a5a00 });
    return;
  }
  if (iconKey.includes('wall')) {
    g.roundRect(-size * 0.52, -size * 0.42, size * 1.04, size * 0.84, 3);
    g.fill(0x8b6914);
    return;
  }
  if (iconKey.includes('heart')) {
    g.circle(-size * 0.22, -size * 0.12, size * 0.28);
    g.circle(size * 0.22, -size * 0.12, size * 0.28);
    g.poly([-size * 0.48, 0, 0, size * 0.58, size * 0.48, 0]);
    g.fill(0xfff0f0);
    return;
  }
  g.poly([0, -size * 0.62, size * 0.18, -size * 0.18, size * 0.62, 0, size * 0.18, size * 0.18, 0, size * 0.62, -size * 0.18, size * 0.18, -size * 0.62, 0, -size * 0.18, -size * 0.18]);
  g.fill(0xffffff);
}

function emptyRect(): RectLayout {
  return { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
}
