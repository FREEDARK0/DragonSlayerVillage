import { Container, Graphics, Text } from 'pixi.js';
import { OctagonBoard } from '../core/OctagonBoard';
import { GameRenderer } from './GameRenderer';
import { BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { SECTOR_COUNT, sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';
import { calculateVillageIncome } from '../effects/BlockEffectRegistry';
import { IncomeEffectContext } from '../effects/EffectContext';
import { BlockAnimation } from './EffectRenderer';

export class OctagonRenderer {
  private container: Container;
  private wedgeContainer: Container;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'OctagonRenderer';
    renderer.getLayer(2).addChild(this.container);

    this.wedgeContainer = new Container();
    this.wedgeContainer.label = 'NightWedges';
    renderer.getLayer(1).addChild(this.wedgeContainer);
  }

  render(board: OctagonBoard, _heroSector?: number, rotationDeg: number = 0, nightStart?: number, nightLen?: number, villageHpAnim?: BlockAnimation): void {
    this.container.removeChildren();
    this.wedgeContainer.removeChildren();
    const g = new Graphics();
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const outerR = this.renderer.octagonRadius;
    const innerR = outerR * 0.25;

    const farR = Math.max(this.renderer.screenW, this.renderer.screenH) * 1.5;
    const wg = new Graphics();
    if (nightStart !== undefined && nightLen !== undefined) {
      for (let i = 0; i < SECTOR_COUNT; i++) {
        if (!this.sectorInNight(i, nightStart, nightLen)) continue;
        const a1 = sectorStartAngle(i, 0);
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
    for (let i = 0; i < 8; i++) {
      const a = sectorStartAngle(i, 0);
      wg.moveTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
      wg.lineTo(cx + Math.cos(a) * farR, cy + Math.sin(a) * farR);
      wg.stroke({ width: 1, color: 0x334466, alpha: 0.5 });
    }
    this.wedgeContainer.addChild(wg);

    const islandShadow = new Graphics();
    islandShadow.circle(cx + 8, cy + 12, outerR * 1.05);
    islandShadow.fill({ color: 0x28566c, alpha: 0.2 });
    this.container.addChild(islandShadow);

    for (let i = 0; i < SECTOR_COUNT; i++) {
      const a1 = sectorStartAngle(i, rotationDeg);
      const a2 = sectorEndAngle(i, rotationDeg);
      const block = board.getSector(i);
      let fillColor = i % 2 === 0 ? 0x8abf6f : 0x78aa63;
      if (block) fillColor = BLOCK_TYPE_TABLE[block.type].color;
      const r16 = (fillColor >> 16) & 0xff;
      const g8 = (fillColor >> 8) & 0xff;
      const b8 = fillColor & 0xff;
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

    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill({ color: 0x5f9f68, alpha: 0.92 });
    g.stroke({ width: 2, color: 0xe8d48a });

    const hpRatio = Math.max(0, Math.min(1, board.villageHp / 50));
    const villageColor = hpRatio > 0.5 ? 0x66bb44 : hpRatio > 0.25 ? 0xc7b04d : 0xb45a42;
    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill(villageColor);
    g.stroke({ width: 2, color: 0xf4df9a });

    this.container.addChild(g);

    const icon = new Graphics();
    const hs = innerR * 0.4;
    icon.roundRect(cx - hs * 0.55, cy - hs * 0.1, hs * 1.1, hs * 0.65, 3);
    icon.fill(0x889966); icon.stroke({ width: 1, color: 0x667744 });
    icon.poly([cx, cy - hs * 0.55, cx + hs * 0.55, cy - hs * 0.05, cx - hs * 0.55, cy - hs * 0.05]);
    icon.fill(0xcc6633); icon.stroke({ width: 1, color: 0x994422 });
    this.container.addChild(icon);

    const gain = calculateVillageIncome(this.createRenderEffectContext(board, nightStart ?? 0, nightLen ?? 0));
    const hpText = new Text({ text: `HP ${board.villageHp}`, style: { fontFamily: 'Arial', fontSize: 15, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } });
    const goldText = new Text({ text: `金 ${board.villageGold}  +${gain}`, style: { fontFamily: 'Arial', fontSize: 11, fill: 0xffe08a, stroke: { color: 0x000000, width: 2 } } });
    hpText.anchor.set(0.5); hpText.position.set(cx, cy + innerR * 0.42 - 4); this.container.addChild(hpText);
    hpText.scale.set(villageHpAnim?.scaleX ?? 1, villageHpAnim?.scaleY ?? 1);
    goldText.anchor.set(0.5); goldText.position.set(cx, cy + innerR * 0.42 + 16); this.container.addChild(goldText);
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
    };
  }
}
