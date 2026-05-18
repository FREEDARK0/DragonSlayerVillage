import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';

interface RectLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ReplayPanelState {
  visible: boolean;
  replayMode: boolean;
  frameIndex: number;
  frameCount: number;
  status: string;
  actionCount: number;
}

export interface ReplayPanelLayoutSnapshot {
  visible: boolean;
  panel: RectLayout;
  buttons: Array<RectLayout & { id: string; disabled: boolean }>;
  text: string;
}

type ReplayControlId = 'import' | 'export' | 'previous' | 'next' | 'death' | 'exit';

export class ReplayPanel {
  private container: Container;
  private lastLayout: ReplayPanelLayoutSnapshot = emptyLayout();

  onControl: ((id: ReplayControlId, event?: { pointerId?: number; type?: string }) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'ReplayPanel';
    this.container.eventMode = 'static';
    this.container.on('pointerdown', (event) => this.onUiPointerActivity?.(event));
    renderer.getLayer(RenderLayer.UI).addChild(this.container);
  }

  draw(state: ReplayPanelState): void {
    this.container.visible = state.visible;
    this.container.removeChildren();
    if (!state.visible) {
      this.lastLayout = emptyLayout();
      return;
    }

    const panel = this.panelLayout();
    this.container.hitArea = new Rectangle(panel.x, panel.y, panel.width, panel.height);
    const text = state.replayMode
      ? `回放 ${state.frameCount > 0 ? state.frameIndex + 1 : 0}/${state.frameCount}`
      : `Replay ${state.actionCount}`;
    this.lastLayout = { visible: true, panel, buttons: [], text };
    this.drawPanel(panel);
    this.drawText(text, panel.x + 12, panel.y + 11, 12, 0xdff8ff, true, 0);

    const buttons = state.replayMode
      ? [
        { id: 'previous' as const, label: '<', disabled: state.frameIndex <= 0 },
        { id: 'next' as const, label: '>', disabled: state.frameIndex >= state.frameCount - 1 },
        { id: 'death' as const, label: '死前', disabled: state.frameCount <= 1 },
        { id: 'exit' as const, label: '退出', disabled: false },
      ]
      : [
        { id: 'import' as const, label: '导入', disabled: false },
        { id: 'export' as const, label: '导出', disabled: false },
      ];

    let x = panel.x + 10;
    const y = panel.y + 35;
    for (const button of buttons) {
      const width = button.label.length > 1 ? 48 : 30;
      const layout = rect(x, y, width, 24);
      this.drawButton(layout, button.label, button.id, button.disabled);
      x += width + 6;
    }

    if (state.status) {
      this.drawText(state.status, panel.x + 12, panel.y + panel.height - 14, 10, 0xc8dbe5, false, 0);
    }
  }

  getLayoutSnapshot(): ReplayPanelLayoutSnapshot {
    return {
      visible: this.lastLayout.visible,
      panel: { ...this.lastLayout.panel },
      buttons: this.lastLayout.buttons.map(button => ({ ...button })),
      text: this.lastLayout.text,
    };
  }

  private panelLayout(): RectLayout {
    const compact = this.renderer.layoutProfile === 'mobilePortrait';
    const width = compact ? 170 : 210;
    const height = 76;
    return rect(compact ? 8 : 12, compact ? 8 : 12, width, height);
  }

  private drawPanel(layout: RectLayout): void {
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 8);
    g.fill({ color: 0x172836, alpha: 0.78 });
    g.stroke({ width: 1.4, color: 0x8fd0dc, alpha: 0.64 });
    g.eventMode = 'none';
    this.container.addChild(g);
  }

  private drawButton(layout: RectLayout, label: string, id: ReplayControlId, disabled: boolean): void {
    this.lastLayout.buttons.push({ ...layout, id, disabled });
    const g = new Graphics();
    g.roundRect(layout.x, layout.y, layout.width, layout.height, 6);
    g.fill({ color: disabled ? 0x23313b : 0x25495e, alpha: disabled ? 0.58 : 0.94 });
    g.stroke({ width: 1, color: disabled ? 0x627783 : 0xb8edf8, alpha: disabled ? 0.42 : 0.78 });
    g.eventMode = disabled ? 'none' : 'static';
    if (!disabled) {
      g.cursor = 'pointer';
      g.on('pointerdown', (event) => {
        this.onUiPointerActivity?.(event);
        this.onControl?.(id, event);
      });
    }
    this.container.addChild(g);
    this.drawText(label, layout.centerX, layout.centerY, 12, disabled ? 0x9dafb8 : 0xffffff, true, 0.5);
  }

  private drawText(text: string, x: number, y: number, fontSize: number, fill: number, bold: boolean, anchorX: number): void {
    const label = new Text({
      text,
      style: { fontFamily: 'Arial', fontSize, fill, fontWeight: bold ? 'bold' : 'normal', stroke: { color: 0x10202a, width: 2 } },
    });
    label.anchor.set(anchorX, 0.5);
    label.position.set(x, y);
    label.eventMode = 'none';
    this.container.addChild(label);
  }
}

function rect(x: number, y: number, width: number, height: number): RectLayout {
  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

function emptyLayout(): ReplayPanelLayoutSnapshot {
  const empty = rect(0, 0, 0, 0);
  return { visible: false, panel: empty, buttons: [], text: '' };
}
