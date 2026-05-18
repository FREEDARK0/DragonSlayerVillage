import { Container, Graphics, Text } from 'pixi.js';
import { OctagonBoard } from '../core/OctagonBoard';
import { GameRenderer, RenderLayer } from './GameRenderer';
import { BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { isBoardSectorNight, SECTOR_COUNT, sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';
import { calculateVillageIncome } from '../effects/BlockEffectRegistry';
import { IncomeEffectContext } from '../effects/EffectContext';
import { BlockAnimation } from './EffectRenderer';
import { formatStatDelta, PREVIEW_NEGATIVE_COLOR, StatPreviewDelta, statDeltaColor } from '../ui/StatPreview';
import { buildParallelHatchSegments, sectorBandPolygon } from './HatchPattern';

const SECTOR_LINE_COLOR = 0xe7d79a;
const SECTOR_LINE_ALPHA = 0.9;
const SECTOR_LINE_WIDTH = 1.5;
const OUTER_OUTLINE_WIDTH = 4;

export interface BoardOutlineSnapshot {
  outerWidth: number;
  outerColor: number;
  outerAlpha: number;
  innerSectorWidth: number;
  innerSectorColor: number;
}

export class OctagonRenderer {
  private container: Container;
  private outlineSnapshot: BoardOutlineSnapshot = {
    outerWidth: OUTER_OUTLINE_WIDTH,
    outerColor: SECTOR_LINE_COLOR,
    outerAlpha: SECTOR_LINE_ALPHA,
    innerSectorWidth: SECTOR_LINE_WIDTH,
    innerSectorColor: SECTOR_LINE_COLOR,
  };

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'OctagonRenderer';
    renderer.getLayer(RenderLayer.BOARD).addChild(this.container);
  }

  render(
    board: OctagonBoard,
    _heroSector?: number,
    rotationDeg: number = 0,
    nightStart?: number,
    nightLen?: number,
    villageHpAnim?: BlockAnimation,
    attackedSectors?: Set<number>,
    villagePreview?: StatPreviewDelta,
    villageAttacked: boolean = false,
  ): void {
    this.container.removeChildren();
    const g = new Graphics();
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const outerR = this.renderer.octagonRadius;
    const innerR = outerR * 0.25;

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
      g.stroke({ width: SECTOR_LINE_WIDTH, color: SECTOR_LINE_COLOR, alpha: SECTOR_LINE_ALPHA });
    }

    g.poly(this.outerOctagonPoints(cx, cy, outerR, rotationDeg));
    g.stroke({ width: OUTER_OUTLINE_WIDTH, color: SECTOR_LINE_COLOR, alpha: SECTOR_LINE_ALPHA });

    if (attackedSectors && attackedSectors.size > 0) {
      this.drawAttackedSectorHatching(g, attackedSectors, rotationDeg, cx, cy, innerR, outerR);
    }

    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill({ color: 0x5f9f68, alpha: 0.92 });
    g.stroke({ width: 2, color: 0xe8d48a });

    const hpRatio = Math.max(0, Math.min(1, board.villageHp / 50));
    const villageColor = hpRatio > 0.5 ? 0x66bb44 : hpRatio > 0.25 ? 0xc7b04d : 0xb45a42;
    g.poly(this.innerOctagonPoints(cx, cy, innerR, rotationDeg));
    g.fill(villageColor);
    g.stroke({ width: 2, color: 0xf4df9a });

    if (villageAttacked) {
      this.drawHatchingPolygon(g, this.innerOctagonPolygon(cx, cy, innerR, rotationDeg));
    }

    this.container.addChild(g);

    const icon = new Graphics();
    const hs = innerR * 0.4;
    icon.roundRect(cx - hs * 0.55, cy - hs * 0.1, hs * 1.1, hs * 0.65, 3);
    icon.fill(0x889966); icon.stroke({ width: 1, color: 0x667744 });
    icon.poly([cx, cy - hs * 0.55, cx + hs * 0.55, cy - hs * 0.05, cx - hs * 0.55, cy - hs * 0.05]);
    icon.fill(0xcc6633); icon.stroke({ width: 1, color: 0x994422 });
    this.container.addChild(icon);

    const gain = calculateVillageIncome(this.createRenderEffectContext(board, nightStart ?? 0, nightLen ?? 0, rotationDeg));
    const hpText = new Text({ text: `HP ${board.villageHp}`, style: { fontFamily: 'Arial', fontSize: 15, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } });
    const goldText = new Text({ text: `金 ${board.villageGold}  +${gain}`, style: { fontFamily: 'Arial', fontSize: 14, fill: 0xfff0a8, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } });
    hpText.anchor.set(0.5); hpText.position.set(cx, cy + innerR * 0.42 - 4); this.container.addChild(hpText);
    hpText.scale.set(villageHpAnim?.scaleX ?? 1, villageHpAnim?.scaleY ?? 1);
    this.addVillagePreviewText(cx + hpText.width * 0.5 + 5, cy + innerR * 0.42 - 4, villagePreview);
    goldText.anchor.set(0.5); goldText.position.set(cx, cy + innerR * 0.42 + 18); this.container.addChild(goldText);
  }

  getBoardOutlineSnapshot(): BoardOutlineSnapshot {
    return { ...this.outlineSnapshot };
  }

  private drawAttackedSectorHatching(g: Graphics, sectors: Set<number>, rotationDeg: number, cx: number, cy: number, innerR: number, outerR: number): void {
    for (const sector of sectors) {
      const polygon = sectorBandPolygon(sector, cx, cy, innerR, outerR, rotationDeg);
      this.drawHatchingPolygon(g, polygon);
    }
  }

  private drawHatchingPolygon(g: Graphics, polygon: { x: number; y: number }[]): void {
    const segments = buildParallelHatchSegments(polygon, { spacing: 8, angleRad: Math.PI / 4 });
    for (const segment of segments) {
      g.moveTo(segment.start.x, segment.start.y);
      g.lineTo(segment.end.x, segment.end.y);
    }
    g.stroke({ width: 1.45, color: 0xff1414, alpha: 0.92 });
  }

  private addVillagePreviewText(x: number, y: number, preview?: StatPreviewDelta): void {
    if (!preview) return;
    const text = preview.willDie ? 'X' : formatStatDelta(preview.hpDelta);
    if (!text) return;
    const label = new Text({
      text,
      style: {
        fontFamily: 'Arial',
        fontSize: preview.willDie ? 20 : 17,
        fill: preview.willDie ? PREVIEW_NEGATIVE_COLOR : statDeltaColor(preview.hpDelta),
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 5 },
      },
    });
    label.anchor.set(0, 0.5);
    label.position.set(x, y);
    label.eventMode = 'none';
    this.container.addChild(label);
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

  private outerOctagonPoints(cx: number, cy: number, r: number, rotDeg: number): number[] {
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = sectorStartAngle(i, rotDeg);
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    return pts;
  }

  private innerOctagonPolygon(cx: number, cy: number, r: number, rotDeg: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = sectorStartAngle(i, rotDeg);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  }

  private createRenderEffectContext(board: OctagonBoard, nightStart: number, nightLen: number, rotationDeg: number): IncomeEffectContext {
    return {
      board,
      isNight(sector: number) {
        return isBoardSectorNight(sector, rotationDeg, nightStart, nightLen);
      },
    };
  }
}
