import { Graphics } from 'pixi.js';
import { BlockType } from '../config/blockTypes';
import { BlockData } from '../models/Block';

export type BlockVisualDrawer = (g: Graphics, size: number, block: BlockData) => void;

const drawers = new Map<BlockType, BlockVisualDrawer>();

export function registerBlockVisual(type: BlockType, drawer: BlockVisualDrawer): void {
  drawers.set(type, drawer);
}

export function drawBlockVisual(type: BlockType, g: Graphics, size: number, block: BlockData): void {
  const drawer = drawers.get(type);
  if (drawer) drawer(g, size, block);
}

registerBlockVisual(BlockType.KNIGHT, (g, s) => {
  g.poly([0, -s * 0.7, s * 0.55, -s * 0.3, s * 0.45, s * 0.5, 0, s * 0.8, -s * 0.45, s * 0.5, -s * 0.55, -s * 0.3]);
  g.fill(0x4488ff); g.stroke({ width: 1, color: 0x2255cc });
  g.roundRect(-s * 0.02, -s * 0.85, s * 0.04, s * 0.55, 1);
  g.fill(0xddeeff);
  g.roundRect(-s * 0.3, -s * 0.35, s * 0.6, s * 0.06, 1);
  g.fill(0xcca833);
});

registerBlockVisual(BlockType.MAGE, (g, s) => {
  g.poly([0, -s * 0.6, s * 0.45, s * 0.1, s * 0.35, s * 0.8, -s * 0.35, s * 0.8, -s * 0.45, s * 0.1]);
  g.fill(0x8844cc); g.stroke({ width: 1, color: 0x6622aa });
  g.poly([0, -s * 0.9, s * 0.25, -s * 0.5, -s * 0.25, -s * 0.5]);
  g.fill(0x6622aa);
  g.roundRect(s * 0.35, -s * 0.7, s * 0.04, s * 0.8, 1);
  g.fill(0x886633);
  g.circle(s * 0.37, -s * 0.7, s * 0.1);
  g.fill(0xaa44ff);
});

registerBlockVisual(BlockType.VOODOO, (g, s, block) => {
  const color = block.targetColor ?? 0x888888;
  g.circle(0, -s * 0.1, s * 0.35);
  g.fill(color); g.stroke({ width: 1, color: 0x666666 });
  g.ellipse(0, s * 0.3, s * 0.25, s * 0.4);
  g.fill(color); g.stroke({ width: 1, color: 0x666666 });
  g.roundRect(-s * 0.5, s * 0.1, s * 0.18, s * 0.06, 2);
  g.fill(color);
  g.roundRect(s * 0.32, s * 0.1, s * 0.18, s * 0.06, 2);
  g.fill(color);
  g.circle(0, s * 0.25, s * 0.05);
  g.fill(0xff4444);
  g.circle(-s * 0.1, -s * 0.15, s * 0.05);
  g.fill(0x000000);
  g.circle(s * 0.1, -s * 0.15, s * 0.05);
  g.fill(0x000000);
});

registerBlockVisual(BlockType.POWER_STONE, (g, s) => {
  g.poly([0, -s * 0.75, s * 0.5, 0, 0, s * 0.75, -s * 0.5, 0]);
  g.fill(0xffaa00); g.stroke({ width: 1, color: 0xcc8800 });
  g.poly([0, -s * 0.35, s * 0.2, 0, 0, s * 0.35, -s * 0.2, 0]);
  g.fill(0xffcc44);
  g.circle(0, -s * 0.3, s * 0.08);
  g.fill(0xffffff);
});

registerBlockVisual(BlockType.WEAKNESS, (g, s) => {
  g.circle(0, 0, s * 0.7);
  g.fill(0xcc2222);
  g.stroke({ width: 1.5, color: 0xff4444 });
  g.rect(-s * 0.35, -s * 0.05, s * 0.7, s * 0.03);
  g.fill(0x880000);
  g.rect(-s * 0.05, -s * 0.35, s * 0.03, s * 0.7);
  g.fill(0x880000);
  g.circle(0, 0, s * 0.15);
  g.fill(0x440000);
});

registerBlockVisual(BlockType.DRAGON_FIRE, (g, s) => {
  g.poly([
    0, -s * 0.85,
    s * 0.38, -s * 0.15,
    s * 0.2, s * 0.65,
    -s * 0.25, s * 0.65,
    -s * 0.4, -s * 0.1,
  ]);
  g.fill(0xff5522);
  g.stroke({ width: 1.5, color: 0xffcc44 });
  g.poly([0, -s * 0.45, s * 0.18, s * 0.05, 0, s * 0.45, -s * 0.18, s * 0.05]);
  g.fill(0xffdd55);
});

registerBlockVisual(BlockType.WOOD_WALL, (g, s) => {
  g.roundRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1, 3);
  g.fill(0x8B6914);
  g.stroke({ width: 1.5, color: 0x5C3A00 });
  for (let i = 0; i < 4; i++) {
    const lx = -s * 0.4 + i * s * 0.27;
    g.roundRect(lx, -s * 0.55, s * 0.08, s * 1.1, 1);
    g.fill(0x6B4914);
  }
  g.roundRect(-s * 0.55, -s * 0.25, s * 1.1, s * 0.06, 1);
  g.fill(0x5C3A00);
  g.roundRect(-s * 0.55, s * 0.2, s * 1.1, s * 0.06, 1);
  g.fill(0x5C3A00);
});

registerBlockVisual(BlockType.BALLISTA, (g, s) => {
  g.roundRect(-s * 0.15, s * 0.2, s * 0.3, s * 0.5, 3);
  g.fill(0x666666);
  g.roundRect(-s * 0.5, -s * 0.1, s * 1.0, s * 0.12, 2);
  g.fill(0x8B6914);
  g.stroke({ width: 1, color: 0x5C3A00 });
  g.poly([0, -s * 0.6, -s * 0.06, -s * 0.05, s * 0.06, -s * 0.05]);
  g.fill(0xcccccc);
  g.rect(-s * 0.48, -s * 0.15, s * 0.96, s * 0.02);
  g.fill(0xaaaaaa);
});

registerBlockVisual(BlockType.MINE, (g, s) => {
  g.roundRect(-s * 0.55, -s * 0.3, s * 1.1, s * 0.08, 1);
  g.fill(0x666666);
  g.poly([-s * 0.3, -s * 0.3, s * 0.3, -s * 0.3, s * 0.2, s * 0.15, -s * 0.2, s * 0.15]);
  g.fill(0x8B6914); g.stroke({ width: 1, color: 0x5C3A00 });
  g.circle(s * 0.05, s * 0.05, s * 0.12);
  g.fill(0xcca833);
  g.roundRect(s * 0.2, -s * 0.45, s * 0.04, s * 0.3, 1);
  g.fill(0x886633);
  g.poly([s * 0.15, -s * 0.55, s * 0.35, -s * 0.55, s * 0.25, -s * 0.35]);
  g.fill(0x666666);
});

registerBlockVisual(BlockType.PRESSURE_STONE, (g, s) => {
  g.poly([0, -s * 0.7, s * 0.5, -s * 0.2, s * 0.3, s * 0.6, -s * 0.3, s * 0.6, -s * 0.5, -s * 0.2]);
  g.fill(0x6644aa); g.stroke({ width: 1.5, color: 0x442288 });
  for (let i = 0; i < 3; i++) {
    g.rect(-s * 0.3 + i * s * 0.25, -s * 0.5 + i * s * 0.2, s * 0.1, s * 0.02);
    g.fill(0x8866cc);
  }
});

registerBlockVisual(BlockType.PRIEST, (g, s) => {
  g.circle(0, -s * 0.2, s * 0.35); g.fill(0xffddaa); g.stroke({ width: 1, color: 0xcc8844 });
  g.poly([-s * 0.3, s * 0.5, s * 0.3, s * 0.5, 0, s * 0.15]); g.fill(0xddccaa);
  g.roundRect(-s * 0.05, -s * 0.55, s * 0.1, s * 0.4, 2); g.fill(0x886633);
});

registerBlockVisual(BlockType.PORTAL, (g, s) => {
  g.ellipse(0, 0, s * 0.5, s * 0.65); g.fill(0x442266); g.stroke({ width: 2, color: 0x8844cc });
  g.ellipse(0, 0, s * 0.25, s * 0.35); g.fill(0x220044);
  g.circle(0, 0, s * 0.1); g.fill(0xffffff);
});

registerBlockVisual(BlockType.SPIKES, (g, s) => {
  for (let i = 0; i < 5; i++) {
    g.poly([-s * 0.5 + i * s * 0.25, s * 0.4, -s * 0.4 + i * s * 0.25, -s * 0.4, -s * 0.3 + i * s * 0.25, s * 0.4]);
    g.fill(0xaaaaaa); g.stroke({ width: 0.5, color: 0x666666 });
  }
});

registerBlockVisual(BlockType.TAVERN, (g, s) => {
  g.roundRect(-s * 0.5, -s * 0.1, s * 1.0, s * 0.8, 3); g.fill(0xcc8844); g.stroke({ width: 1, color: 0x886633 });
  g.poly([-s * 0.5, -s * 0.1, s * 0.5, -s * 0.1, 0, -s * 0.65]); g.fill(0xaa6633);
  g.circle(0, -s * 0.3, s * 0.08); g.fill(0xffdd44);
});

registerBlockVisual(BlockType.ASSASSIN, (g, s) => {
  g.ellipse(0, s * 0.1, s * 0.35, s * 0.45); g.fill(0x222222); g.stroke({ width: 1, color: 0x444444 });
  g.circle(0, -s * 0.3, s * 0.3); g.fill(0x333333);
  g.poly([-s * 0.15, -s * 0.1, s * 0.15, -s * 0.1, 0, s * 0.05]); g.fill(0x888888);
});

registerBlockVisual(BlockType.BELLOWS, (g, s) => {
  g.poly([-s * 0.5, -s * 0.4, s * 0.5, -s * 0.4, s * 0.35, s * 0.5, -s * 0.35, s * 0.5]); g.fill(0x7799aa); g.stroke({ width: 1, color: 0x557788 });
  g.rect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.25); g.fill(0x667788);
  g.poly([s * 0.3, 0, s * 0.5, -s * 0.15, s * 0.5, s * 0.15]); g.fill(0x334455);
});

registerBlockVisual(BlockType.SENSING_WALL, (g, s) => {
  g.roundRect(-s * 0.6, -s * 0.55, s * 1.2, s * 1.1, 4);
  g.fill(0x4aa6aa);
  g.stroke({ width: 1.5, color: 0xb8ffff });
  g.circle(0, 0, s * 0.22);
  g.fill(0x17343a);
  g.stroke({ width: 1, color: 0xd8ffff });
  g.circle(0, 0, s * 0.08);
  g.fill(0xd8ffff);
});
