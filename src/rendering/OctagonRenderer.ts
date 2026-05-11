import { Container, Graphics, Text } from 'pixi.js';
import { OctagonBoard } from '../core/OctagonBoard';
import { GameRenderer } from './GameRenderer';
import { BLOCK_TYPE_TABLE, getVillageLevel } from '../config/blockTypes';
import { SECTOR_COUNT } from '../utils/SectorUtils';
import { sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';
import { ELEMENT_COLORS } from '../config/dragonTypes';

export class OctagonRenderer {
  private container: Container;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'OctagonRenderer';
    renderer.getLayer(1).addChild(this.container);
  }

  render(board: OctagonBoard, heroSector?: number, rotationDeg: number = 0, nightStart?: number, nightLen?: number): void {
    this.container.removeChildren();
    const g = new Graphics();
    const isNight = (sector: number) => {
      if (nightStart === undefined || nightLen === undefined || nightLen <= 0) return false;
      for (let i = 0; i < nightLen; i++) {
        if (((nightStart + i) % 8) === sector) return true;
      }
      return false;
    };
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const outerR = this.renderer.octagonRadius;
    const innerR = outerR * 0.25;
    const midR = outerR * 0.42;

    // Draw trapezoid sectors
    for (let i = 0; i < SECTOR_COUNT; i++) {
      const a1 = sectorStartAngle(i, rotationDeg);
      const a2 = sectorEndAngle(i, rotationDeg);
      const block = board.getSector(i);

      // Fill color: attribute > block type > empty gray
      const attr = board.getAttribute(i);
      let fillColor = 0x444455; // medium gray for empty
      if (attr && ELEMENT_COLORS[attr]) {
        fillColor = ELEMENT_COLORS[attr];
      } else if (block) {
        fillColor = BLOCK_TYPE_TABLE[block.type].color;
      }

      // Darken for background
      const r16 = (fillColor >> 16) & 0xff;
      const g8 = (fillColor >> 8) & 0xff;
      const b8 = fillColor & 0xff;
      const bgColor = ((Math.floor(r16 * 0.4)) << 16) | ((Math.floor(g8 * 0.4)) << 8) | Math.floor(b8 * 0.4);

      const o1x = cx + Math.cos(a1) * outerR;
      const o1y = cy + Math.sin(a1) * outerR;
      const o2x = cx + Math.cos(a2) * outerR;
      const o2y = cy + Math.sin(a2) * outerR;
      const i2x = cx + Math.cos(a2) * innerR;
      const i2y = cy + Math.sin(a2) * innerR;
      const i1x = cx + Math.cos(a1) * innerR;
      const i1y = cy + Math.sin(a1) * innerR;

      g.poly([o1x, o1y, o2x, o2y, i2x, i2y, i1x, i1y]);
      g.fill(bgColor);
      g.poly([o1x, o1y, o2x, o2y, i2x, i2y, i1x, i1y]);
      g.stroke({ width: 1, color: 0x334466 });
    }

    // Night overlay (black triangles, fixed — does not rotate with board)
    for (let i = 0; i < SECTOR_COUNT; i++) {
      if (!isNight(i)) continue;
      const a1 = i * Math.PI / 4;
      const a2 = (i + 1) * Math.PI / 4;
      const o1x = cx + Math.cos(a1) * outerR;
      const o1y = cy + Math.sin(a1) * outerR;
      const o2x = cx + Math.cos(a2) * outerR;
      const o2y = cy + Math.sin(a2) * outerR;
      g.poly([cx, cy, o1x, o1y, o2x, o2y]);
      g.fill(0x000000);
    }

    // Inner octagon bg
    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill({ color: 0x1a1a2e, alpha: 0.9 });
    g.stroke({ width: 2, color: 0x446688 });

    // Village: fill entire inner octagon
    const vp = board.villagePower;
    const level = getVillageLevel(vp);
    const lvlColors = [0x66bb44, 0x88cc55, 0xaadd66, 0xccff88, 0xddff99];
    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill(lvlColors[Math.min(level, 4)]);
    g.stroke({ width: 2, color: 0x448833 });

    this.container.addChild(g);

    // Village icon (house shape)
    const icon = new Graphics();
    const hs = innerR * 0.4;
    icon.roundRect(cx - hs * 0.55, cy - hs * 0.1, hs * 1.1, hs * 0.65, 3);
    icon.fill(0x889966);
    icon.stroke({ width: 1, color: 0x667744 });
    icon.poly([cx, cy - hs * 0.55, cx + hs * 0.55, cy - hs * 0.05, cx - hs * 0.55, cy - hs * 0.05]);
    icon.fill(0xcc6633);
    icon.stroke({ width: 1, color: 0x994422 });
    this.container.addChild(icon);

    // Text on top
    const pText = new Text({
      text: `${vp}`,
      style: { fontFamily: 'Arial', fontSize: 16, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } },
    });
    pText.anchor.set(0.5); pText.position.set(cx, cy + innerR * 0.5);
    this.container.addChild(pText);

    const lvlText = new Text({
      text: `Lv.${level}`,
      style: { fontFamily: 'Arial', fontSize: 10, fill: 0xddffdd, stroke: { color: 0x000000, width: 2 } },
    });
    lvlText.anchor.set(0.5); lvlText.position.set(cx, cy + innerR * 0.5 + 16);
    this.container.addChild(lvlText);
  }

  private innerOctagonPoints(cx: number, cy: number, r: number, rotDeg: number): number[] {
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = sectorStartAngle(i, rotDeg);
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return pts;
  }
}
