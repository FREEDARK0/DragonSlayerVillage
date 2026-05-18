import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { PostProcessConfig } from '../rendering/ScreenPostProcess';

type ControlId =
  | 'warm.enabled'
  | 'warm.strength.down'
  | 'warm.strength.up'
  | 'warm.color'
  | 'posterize.enabled'
  | 'posterize.band.down'
  | 'posterize.band.up'
  | `posterize.color.${number}`
  | 'glow.enabled'
  | 'glow.strength.down'
  | 'glow.strength.up'
  | 'glow.threshold.down'
  | 'glow.threshold.up'
  | 'glow.radius.down'
  | 'glow.radius.up';

interface RectLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface PostProcessDebugPanelState {
  visible: boolean;
  config: PostProcessConfig;
  saveStatus: string;
  anchorPanel: RectLayout;
}

export interface PostProcessDebugLayoutSnapshot {
  visible: boolean;
  panel: RectLayout;
  controls: Array<RectLayout & { id: string; value?: string | number | boolean }>;
  saveStatus: string;
}

const PANEL_WIDTH = 276;
const PANEL_GAP = 10;
const PANEL_MARGIN = 8;
const ROW_H = 26;
const SWATCH_COLORS = [
  '#1f2a44', '#2f4f66', '#576b4d', '#87633f',
  '#c28f4b', '#e8cf8f', '#f5f0d4', '#b7dce2',
  '#f5b7c8', '#c7a1ff', '#ffffff', '#101820',
];

export class PostProcessDebugPanel {
  private container: Container;
  private lastLayout: PostProcessDebugLayoutSnapshot = emptyLayout();

  onControl: ((id: ControlId, event?: { pointerId?: number; type?: string }) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'PostProcessDebugPanel';
    this.container.visible = false;
    this.container.eventMode = 'static';
    this.container.on('pointerdown', (event) => this.onUiPointerActivity?.(event));
    this.container.on('wheel', (event: any) => {
      this.onUiPointerActivity?.(event);
      event.preventDefault?.();
      event.stopPropagation?.();
    });
    renderer.getLayer(RenderLayer.DEBUG_UI).addChild(this.container);
  }

  draw(state: PostProcessDebugPanelState): void {
    this.container.visible = state.visible;
    this.container.removeChildren();
    if (!state.visible) {
      this.lastLayout = emptyLayout();
      return;
    }

    const panel = this.panelLayout(state.anchorPanel);
    this.container.hitArea = new Rectangle(panel.x, panel.y, panel.width, panel.height);
    this.lastLayout = { visible: true, panel, controls: [], saveStatus: state.saveStatus };
    this.drawPanel(panel);

    let y = panel.y + 16;
    this.drawTitle('后处理调试', panel.x + 14, y);
    this.drawText(state.saveStatus, panel.x + panel.width - 14, y, 11, statusColor(state.saveStatus), false, 1);
    y += 28;

    y = this.drawWarmSection(panel, y, state.config);
    y = this.drawPosterizeSection(panel, y + 8, state.config);
    y = this.drawGlowSection(panel, y + 8, state.config);
  }

  getLayoutSnapshot(): PostProcessDebugLayoutSnapshot {
    return {
      visible: this.lastLayout.visible,
      panel: { ...this.lastLayout.panel },
      controls: this.lastLayout.controls.map(control => ({ ...control })),
      saveStatus: this.lastLayout.saveStatus,
    };
  }

  private drawWarmSection(panel: RectLayout, y: number, config: PostProcessConfig): number {
    this.drawSectionHeader('暖色调', panel.x + 14, y);
    const toggle = rect(panel.x + panel.width - 66, y - 4, 52, 22);
    this.drawButton(toggle, config.warmTint.enabled ? '开' : '关', config.warmTint.enabled, 'warm.enabled', config.warmTint.enabled);
    y += 28;
    y = this.drawStepper(panel, y, '强度', config.warmTint.strength, 'warm.strength.down', 'warm.strength.up', 2);
    y = this.drawColorRow(panel, y, '颜色', config.warmTint.color, 'warm.color');
    return y;
  }

  private drawPosterizeSection(panel: RectLayout, y: number, config: PostProcessConfig): number {
    this.drawSectionHeader('色阶调色', panel.x + 14, y);
    const toggle = rect(panel.x + panel.width - 66, y - 4, 52, 22);
    this.drawButton(toggle, config.posterizePalette.enabled ? '开' : '关', config.posterizePalette.enabled, 'posterize.enabled', config.posterizePalette.enabled);
    y += 28;
    y = this.drawStepper(panel, y, '档位', config.posterizePalette.bandCount, 'posterize.band.down', 'posterize.band.up', 0);
    this.drawText('色阶颜色', panel.x + 16, y + 5, 12, 0xcfe6f6, false);
    const swatchSize = 22;
    const startX = panel.x + 84;
    for (let index = 0; index < config.posterizePalette.colors.length; index++) {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const layout = rect(startX + col * 30, y + row * 28, swatchSize, swatchSize);
      this.drawSwatch(layout, config.posterizePalette.colors[index], index < config.posterizePalette.bandCount, `posterize.color.${index}`);
    }
    return y + 62;
  }

  private drawGlowSection(panel: RectLayout, y: number, config: PostProcessConfig): number {
    this.drawSectionHeader('柔和辉光', panel.x + 14, y);
    const toggle = rect(panel.x + panel.width - 66, y - 4, 52, 22);
    this.drawButton(toggle, config.softGlow.enabled ? '开' : '关', config.softGlow.enabled, 'glow.enabled', config.softGlow.enabled);
    y += 28;
    y = this.drawStepper(panel, y, '强度', config.softGlow.strength, 'glow.strength.down', 'glow.strength.up', 2);
    y = this.drawStepper(panel, y, '阈值', config.softGlow.threshold, 'glow.threshold.down', 'glow.threshold.up', 2);
    y = this.drawStepper(panel, y, '半径', config.softGlow.radius, 'glow.radius.down', 'glow.radius.up', 0);
    return y;
  }

  private drawStepper(panel: RectLayout, y: number, label: string, value: number, downId: ControlId, upId: ControlId, digits: number): number {
    this.drawText(label, panel.x + 16, y + 13, 12, 0xcfe6f6, false);
    const down = rect(panel.x + 82, y + 2, 24, 22);
    const up = rect(panel.x + panel.width - 38, y + 2, 24, 22);
    this.drawButton(down, '-', false, downId, value);
    this.drawText(formatValue(value, digits), panel.x + 138, y + 13, 12, 0xfff3d4, true);
    this.drawButton(up, '+', false, upId, value);
    return y + ROW_H;
  }

  private drawColorRow(panel: RectLayout, y: number, label: string, color: string, id: ControlId): number {
    this.drawText(label, panel.x + 16, y + 13, 12, 0xcfe6f6, false);
    this.drawSwatch(rect(panel.x + 84, y + 2, 34, 22), color, true, id);
    this.drawText(color, panel.x + 126, y + 13, 12, 0xfff3d4, true, 0);
    return y + ROW_H;
  }

  private drawPanel(panel: RectLayout): void {
    const g = new Graphics();
    g.roundRect(panel.x, panel.y, panel.width, panel.height, 8);
    g.fill({ color: 0x172836, alpha: 0.94 });
    g.stroke({ width: 2, color: 0xffd65a, alpha: 0.68 });
    g.eventMode = 'none';
    this.container.addChild(g);
  }

  private drawTitle(text: string, x: number, y: number): void {
    this.drawText(text, x, y, 14, 0xffd65a, true, 0);
  }

  private drawSectionHeader(text: string, x: number, y: number): void {
    this.drawText(text, x, y + 8, 13, 0xffd65a, true, 0);
  }

  private drawButton(layout: RectLayout, label: string, active: boolean, id: ControlId, value?: string | number | boolean): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 6);
    g.fill({ color: active ? 0x2f6b42 : 0x203746, alpha: 0.96 });
    g.stroke({ width: 1.2, color: active ? 0xbfffc6 : 0x7894a6, alpha: 0.9 });
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointerdown', (event) => {
      this.onUiPointerActivity?.(event);
      this.onControl?.(id, event);
    });
    this.container.addChild(g);
    this.lastLayout.controls.push({ ...layout, id, value });
    this.drawText(label, layout.centerX, layout.centerY, 12, 0xffffff, true);
  }

  private drawSwatch(layout: RectLayout, color: string, active: boolean, id: ControlId): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 5);
    g.fill({ color: hexToNumber(color), alpha: active ? 1 : 0.34 });
    g.stroke({ width: active ? 2 : 1, color: active ? 0xffffff : 0x7894a6, alpha: active ? 0.88 : 0.55 });
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointerdown', (event) => {
      this.onUiPointerActivity?.(event);
      this.onControl?.(id, event);
    });
    this.container.addChild(g);
    this.lastLayout.controls.push({ ...layout, id, value: color });
  }

  private drawText(text: string, x: number, y: number, fontSize: number, fill: number, bold: boolean, anchorX: number = 0.5): void {
    const label = new Text({
      text,
      style: { fontFamily: 'Arial', fontSize, fill, fontWeight: bold ? 'bold' : 'normal', stroke: { color: 0x10202a, width: 2 } },
    });
    label.anchor.set(anchorX, 0.5);
    label.position.set(x, y);
    label.eventMode = 'none';
    this.container.addChild(label);
  }

  private panelLayout(anchor: RectLayout): RectLayout {
    const height = Math.min(this.renderer.screenH - PANEL_MARGIN * 2, 356);
    const x = Math.max(PANEL_MARGIN, anchor.x - PANEL_GAP - PANEL_WIDTH);
    const y = Math.max(PANEL_MARGIN, anchor.y);
    return rect(x, y, PANEL_WIDTH, height);
  }
}

export function nextSwatchColor(current: string): string {
  const normalized = normalizeColor(current);
  const index = SWATCH_COLORS.findIndex(color => color === normalized);
  return SWATCH_COLORS[(index + 1 + SWATCH_COLORS.length) % SWATCH_COLORS.length];
}

function formatValue(value: number, digits: number): string {
  return digits === 0 ? `${Math.round(value)}` : value.toFixed(digits);
}

function statusColor(status: string): number {
  if (status.includes('失败')) return 0xff9a9a;
  if (status.includes('保存')) return 0xbfffc6;
  return 0xcfe6f6;
}

function normalizeColor(value: string): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : '#ffffff';
}

function hexToNumber(value: string): number {
  return Number.parseInt(normalizeColor(value).slice(1), 16);
}

function rect(x: number, y: number, width: number, height: number): RectLayout {
  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

function emptyLayout(): PostProcessDebugLayoutSnapshot {
  const empty = rect(0, 0, 0, 0);
  return { visible: false, panel: { ...empty }, controls: [], saveStatus: '' };
}
