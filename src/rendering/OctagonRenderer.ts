import { Container, Graphics, Text } from 'pixi.js';
import { OctagonBoard } from '../core/OctagonBoard';
import { GameRenderer } from './GameRenderer';
import { BLOCK_TYPE_TABLE, getVillageLevel } from '../config/blockTypes';
import { SECTOR_COUNT } from '../utils/SectorUtils';
import { sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';
import { calculateVillageIncome } from '../effects/BlockEffectRegistry';
import { IncomeEffectContext } from '../effects/EffectContext';
import { BlockAnimation } from './EffectRenderer';

export class OctagonRenderer {
  private container: Container;
  private wedgeContainer: Container;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'OctagonRenderer';
    renderer.getLayer(2).addChild(this.container); // BOARD

    this.wedgeContainer = new Container();
    this.wedgeContainer.label = 'NightWedges';
    renderer.getLayer(1).addChild(this.wedgeContainer); // NIGHT layer
  }

  render(board: OctagonBoard, heroSector?: number, rotationDeg: number = 0, nightStart?: number, nightLen?: number, villagePowerAnim?: BlockAnimation): void {
    this.container.removeChildren();
    this.wedgeContainer.removeChildren();
    const g = new Graphics();
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const outerR = this.renderer.octagonRadius;
    const innerR = outerR * 0.25;

    // ── External night wedges (behind everything) ──
    const farR = Math.max(this.renderer.screenW, this.renderer.screenH) * 1.5;
    const wg = new Graphics();
    if (nightStart !== undefined && nightLen !== undefined) {
      for (let i = 0; i < SECTOR_COUNT; i++) {
        const isNight = this.sectorInNight(i, nightStart, nightLen);
        if (!isNight) continue;
        const a1 = sectorStartAngle(i, 0); // night stays in fixed screen position
        const a2 = sectorEndAngle(i, 0);
        wg.poly([
          cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR,
          cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR,
          cx + Math.cos(a2) * farR, cy + Math.sin(a2) * farR,
          cx + Math.cos(a1) * farR, cy + Math.sin(a1) * farR,
        ]);
        wg.fill({ color: 0x000000, alpha: 0.5 });
      }
    }
    // Extended radial lines (径线无限延长)
    for (let i = 0; i < 8; i++) {
      const a = sectorStartAngle(i, 0); // fixed screen position
      wg.moveTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
      wg.lineTo(cx + Math.cos(a) * farR, cy + Math.sin(a) * farR);
      wg.stroke({ width: 1, color: 0x334466, alpha: 0.5 });
    }

    this.wedgeContainer.addChild(wg);

    const islandShadow = new Graphics();
    islandShadow.circle(cx + 8, cy + 12, outerR * 1.05);
    islandShadow.fill({ color: 0x28566c, alpha: 0.2 });
    this.container.addChild(islandShadow);

    // ── Trapezoid sectors ──
    for (let i = 0; i < SECTOR_COUNT; i++) {
      const a1 = sectorStartAngle(i, rotationDeg);
      const a2 = sectorEndAngle(i, rotationDeg);
      const block = board.getSector(i);
      let fillColor = i % 2 === 0 ? 0x8abf6f : 0x78aa63;
      if (block) fillColor = BLOCK_TYPE_TABLE[block.type].color;
      const r16 = (fillColor >> 16) & 0xff, g8 = (fillColor >> 8) & 0xff, b8 = fillColor & 0xff;
      const bgColor = block
        ? ((Math.floor(r16 * 0.55)) << 16) | ((Math.floor(g8 * 0.55)) << 8) | Math.floor(b8 * 0.55)
        : fillColor;

      g.poly([
        cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR,
        cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR,
        cx + Math.cos(a2) * innerR, cy + Math.sin(a2) * innerR,
        cx + Math.cos(a1) * innerR, cy + Math.sin(a1) * innerR,
      ]);
      g.fill(bgColor);
      g.stroke({ width: 1.5, color: 0xe7d79a, alpha: 0.9 });
    }

    // Inner octagon
    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill({ color: 0x5f9f68, alpha: 0.92 });
    g.stroke({ width: 2, color: 0xe8d48a });

    // Village
    const vp = board.villagePower;
    const level = getVillageLevel(vp);
    const lvlColors = [0x66bb44, 0x88cc55, 0xaadd66, 0xccff88, 0xddff99];
    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill(lvlColors[Math.min(level, 4)]);
    g.stroke({ width: 2, color: 0xf4df9a });

    this.container.addChild(g);

    // Village icon + text
    const icon = new Graphics();
    const hs = innerR * 0.4;
    icon.roundRect(cx - hs * 0.55, cy - hs * 0.1, hs * 1.1, hs * 0.65, 3);
    icon.fill(0x889966); icon.stroke({ width: 1, color: 0x667744 });
    icon.poly([cx, cy - hs * 0.55, cx + hs * 0.55, cy - hs * 0.05, cx - hs * 0.55, cy - hs * 0.05]);
    icon.fill(0xcc6633); icon.stroke({ width: 1, color: 0x994422 });
    this.container.addChild(icon);

    const gain = calculateVillageIncome(this.createRenderEffectContext(board, nightStart ?? 0, nightLen ?? 0));
    const pText = new Text({ text: `${vp}`, style: { fontFamily: 'Arial', fontSize: 16, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } });
    const gText = new Text({ text: `+${gain}`, style: { fontFamily: 'Arial', fontSize: 11, fill: 0x88ff88, stroke: { color: 0x000000, width: 2 } } });
    pText.anchor.set(0.5); pText.position.set(cx, cy + innerR * 0.5 - 4); this.container.addChild(pText);
    pText.scale.set(villagePowerAnim?.scaleX ?? 1, villagePowerAnim?.scaleY ?? 1);
    gText.anchor.set(0, 0.5); gText.position.set(cx + innerR * 0.3, cy + innerR * 0.5 + 16); this.container.addChild(gText);
    const lvlText = new Text({ text: `Lv.${level}`, style: { fontFamily: 'Arial', fontSize: 10, fill: 0xddffdd, stroke: { color: 0x000000, width: 2 } } });
    lvlText.anchor.set(0.5); lvlText.position.set(cx, cy + innerR * 0.5 + 16); this.container.addChild(lvlText);
  }

  private sectorInNight(sector: number, start: number, len: number): boolean {
    for (let i = 0; i < len; i++) if (((start + i) % 8) === sector) return true;
    return false;
  }

  private innerOctagonPoints(cx: number, cy: number, r: number, rotDeg: number): number[] {
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = sectorStartAngle(i, rotDeg);
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return pts;
  }

  private createRenderEffectContext(board: OctagonBoard, nightStart: number, nightLen: number): IncomeEffectContext {
    return {
      board,
      isNight(sector: number) {
        for (let i = 0; i < nightLen; i++) if ((nightStart + i) % 8 === sector) return true;
        return false;
      },
      villageLevel() {
        return getVillageLevel(board.villagePower);
      },
    };
  }
}
