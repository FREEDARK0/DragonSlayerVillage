import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { BlockAnimation } from '../rendering/EffectRenderer';
import { RhythmState, RhythmNode, RhythmNodeType } from '../systems/RhythmSystem';
import { TooltipPanel } from './TooltipPanel';
import { bindPressable } from './PressInteractions';

interface NodeLayout {
  x: number;
  y: number;
  radius: number;
  centerX: number;
  centerY: number;
}

export interface RhythmBarSnapshot {
  nodes: NodeLayout[];
}

export class RhythmBar {
  private container: Container;
  private tooltip: TooltipPanel;
  private lastLayout: RhythmBarSnapshot = { nodes: [] };

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'RhythmBar';
    renderer.getLayer(RenderLayer.UI).addChild(this.container);
    this.tooltip = new TooltipPanel(renderer, 'RhythmTooltip');
  }

  draw(rhythm: RhythmState | null, anims: Map<string, BlockAnimation>): void {
    this.container.removeChildren();
    if (!rhythm) {
      this.lastLayout = { nodes: [] };
      return;
    }

    const layout = this.buildLayout(rhythm.nodes.length);
    this.lastLayout = { nodes: layout.map(node => ({ ...node })) };

    for (let index = 0; index < rhythm.nodes.length; index++) {
      this.drawNode(rhythm.nodes[index], layout[index], index, anims.get(`rhythm:${index}`));
    }
  }

  getLayoutSnapshot(): RhythmBarSnapshot {
    return {
      nodes: this.lastLayout.nodes.map(node => ({ ...node })),
    };
  }

  private drawNode(node: RhythmNode, layout: NodeLayout, index: number, anim?: BlockAnimation): void {
    const group = new Container();
    group.position.set(layout.centerX, layout.centerY);
    group.scale.set(anim?.scaleX ?? 1, anim?.scaleY ?? 1);
    group.eventMode = 'static';
    group.cursor = 'help';
    bindPressable(group, {
      onLongPress: () => this.showNodeTooltip(node, layout.centerX, layout.centerY),
      onHoverStart: () => this.showNodeTooltip(node, layout.centerX, layout.centerY),
      onHoverEnd: () => this.tooltip.hide(),
    });
    this.container.addChild(group);

    const dim = node.triggered;
    const colors = nodeColors(node.type, dim);
    const halo = new Graphics();
    halo.circle(0, 0, layout.radius + 4);
    halo.fill({ color: colors.halo, alpha: dim ? 0.05 : 0.16 });
    group.addChild(halo);

    const body = new Graphics();
    body.circle(0, 0, layout.radius);
    body.fill({ color: colors.fill, alpha: dim ? 0.52 : 0.96 });
    body.stroke({ width: 1.5, color: colors.stroke, alpha: dim ? 0.28 : 0.92 });
    group.addChild(body);

    if (node.type === 'normal') {
      const dot = new Graphics();
      dot.circle(0, 0, layout.radius * 0.34);
      dot.fill({ color: dim ? 0x6b7479 : 0xf3fbff, alpha: dim ? 0.55 : 0.96 });
      group.addChild(dot);
    } else if (node.type === 'departure') {
      this.drawHorn(group, layout.radius, dim);
    } else {
      const q = new Text({
        text: '?',
        style: {
          fontFamily: 'Arial',
          fontSize: Math.round(layout.radius * 1.45),
          fontWeight: 'bold',
          fill: dim ? 0xa9afb3 : 0xffffff,
          stroke: { color: 0x172229, width: 3 },
        },
      });
      q.anchor.set(0.5);
      q.position.set(0, -1);
      group.addChild(q);
    }

    if (index === 0 || !dim) return;
    const passed = new Graphics();
    passed.circle(0, 0, layout.radius + 1.5);
    passed.fill({ color: 0x11171b, alpha: 0.28 });
    group.addChild(passed);
  }

  isTooltipVisible(): boolean {
    return this.tooltip.isVisible();
  }

  hideTooltip(): void {
    this.tooltip.hide();
  }

  getTooltipLines(): string[] {
    return this.tooltip.getLines();
  }

  private showNodeTooltip(node: RhythmNode, x: number, y: number): void {
    this.tooltip.show([{ text: nodeTooltipText(node.type) }], x, y);
  }

  private drawHorn(group: Container, radius: number, dim: boolean): void {
    const color = dim ? 0x9ba2a6 : 0xfff1b8;
    const shadow = new Graphics();
    shadow.poly([
      -radius * 0.42, -radius * 0.08,
      radius * 0.34, -radius * 0.52,
      radius * 0.52, radius * 0.48,
      -radius * 0.42, radius * 0.12,
    ]);
    shadow.fill({ color: 0x101820, alpha: 0.48 });
    group.addChild(shadow);

    const horn = new Graphics();
    horn.poly([
      -radius * 0.5, -radius * 0.16,
      radius * 0.28, -radius * 0.56,
      radius * 0.48, radius * 0.42,
      -radius * 0.5, radius * 0.14,
    ]);
    horn.fill({ color, alpha: dim ? 0.62 : 0.98 });
    horn.stroke({ width: 1.2, color: 0x5d3d1d, alpha: dim ? 0.22 : 0.74 });
    horn.rect(-radius * 0.66, -radius * 0.22, radius * 0.24, radius * 0.44);
    horn.fill({ color: dim ? 0x7d8589 : 0xf8d57d, alpha: dim ? 0.58 : 1 });
    group.addChild(horn);
  }

  private buildLayout(count: number): NodeLayout[] {
    if (count <= 0) return [];
    const radius = Math.max(7, Math.min(11, Math.floor(this.renderer.octagonRadius * 0.044)));
    const availableW = Math.min(this.renderer.screenW - 150, this.renderer.octagonRadius * 2.55);
    const gap = count <= 1 ? 0 : Math.min(24, Math.max(radius * 2.2, (availableW - radius * 2) / (count - 1)));
    const totalW = radius * 2 + gap * (count - 1);
    const startX = this.renderer.octagonCenterX - totalW / 2 + radius;
    const y = Math.max(44, this.renderer.screenH - 42);
    return Array.from({ length: count }, (_, index) => {
      const centerX = startX + index * gap;
      return {
        x: centerX - radius,
        y: y - radius,
        radius,
        centerX,
        centerY: y,
      };
    });
  }
}

function nodeTooltipText(type: RhythmNodeType): string {
  if (type === 'departure') return '所有龙离开';
  if (type === 'event') return '事件节点';
  return '无效果';
}

function nodeColors(type: RhythmNodeType, dim: boolean): { fill: number; stroke: number; halo: number } {
  if (dim) return { fill: 0x384146, stroke: 0x6d777c, halo: 0x2a3237 };
  if (type === 'departure') return { fill: 0x6e4222, stroke: 0xffd37a, halo: 0xffbd58 };
  if (type === 'event') return { fill: 0x38508d, stroke: 0xc6d7ff, halo: 0x9bb8ff };
  return { fill: 0x31505c, stroke: 0xa8e2ea, halo: 0xb9f5ff };
}
