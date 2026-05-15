import { Container, Graphics, Text } from 'pixi.js';
import { OctagonBoard } from '../core/OctagonBoard';
import { GameRenderer } from './GameRenderer';
import { BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { SECTOR_COUNT, sectorAngle, sectorEndAngle, sectorStartAngle } from '../utils/SectorUtils';
import { BlockAnimation } from './EffectRenderer';
import { drawBlockVisual } from './BlockVisualRegistry';
import { getBlockAttack } from '../effects/BlockEffectRegistry';
import { EffectContext } from '../effects/EffectContext';

const ATTACK_COLOR = 0xd94b4b;
const HP_COLOR = 0x22c7d7;

export class BlockRenderer {
  private container: Container;
  private statContainer: Container;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'BlockRenderer';
    renderer.getLayer(3).addChild(this.container);
    this.statContainer = new Container();
    this.statContainer.label = 'BlockStatBars';
    renderer.getLayer(3).addChild(this.statContainer);
  }

  render(
    board: OctagonBoard,
    blockAnims?: Map<string, BlockAnimation>,
    rotationDeg: number = 0,
    powerAnims?: Map<string, BlockAnimation>,
    effectContext?: EffectContext,
  ): void {
    this.container.removeChildren();
    this.statContainer.removeChildren();
    const R = this.renderer.octagonRadius;
    const cxOct = this.renderer.octagonCenterX;
    const cyOct = this.renderer.octagonCenterY;

    for (let i = 0; i < SECTOR_COUNT; i++) {
      const block = board.getSector(i);
      if (!block) continue;
      const midR = R * 0.62;
      const angle = sectorAngle(i, rotationDeg);
      const cx = cxOct + Math.cos(angle) * midR;
      const cy = cyOct + Math.sin(angle) * midR;
      const s = R * 0.2;
      const anim = blockAnims?.get(`${i}`);
      const scaleX = anim?.scaleX ?? 1;
      const scaleY = anim?.scaleY ?? 1;
      const animAlpha = anim?.alpha ?? 1;
      if (animAlpha <= 0) continue;
      const bc = new Container();
      bc.position.set(cx, cy);
      bc.scale.set(scaleX, scaleY);
      bc.alpha = animAlpha;
      bc.rotation = 0;
      const g = new Graphics();
      drawBlockVisual(block.type, g, s, block);

      g.label = `Block-${block.type}[${i}]`;
      bc.addChild(g);

      const labelText = new Text({
        text: BLOCK_TYPE_TABLE[block.type].label,
        style: {
          fontFamily: 'Arial',
          fontSize: Math.max(9, Math.floor(R * 0.035)),
          fill: 0xf7fbff,
          fontWeight: 'bold',
          align: 'center',
          stroke: { color: 0x10202a, width: 3 },
        },
      });
      labelText.anchor.set(0.5, 0);
      labelText.position.set(0, s * 0.68);
      labelText.rotation = 0;
      labelText.eventMode = 'none';
      bc.addChild(labelText);

      this.drawSectorStatsBar(
        i,
        R,
        rotationDeg,
        getBlockAttack(block, effectContext, i),
        block.hp,
        animAlpha,
        powerAnims,
      );

      this.container.addChild(bc);
    }
  }

  private drawSectorStatsBar(
    sector: number,
    radius: number,
    rotationDeg: number,
    attack: number,
    hp: number,
    alpha: number,
    powerAnims?: Map<string, BlockAnimation>,
  ): void {
    const cxOct = this.renderer.octagonCenterX;
    const cyOct = this.renderer.octagonCenterY;
    const a1 = sectorStartAngle(sector, rotationDeg);
    const a2 = sectorEndAngle(sector, rotationDeg);
    const p1 = { x: cxOct + Math.cos(a1) * radius, y: cyOct + Math.sin(a1) * radius };
    const p2 = { x: cxOct + Math.cos(a2) * radius, y: cyOct + Math.sin(a2) * radius };
    const edgeAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const barAngle = Math.cos(edgeAngle) < 0 ? edgeAngle + Math.PI : edgeAngle;
    const midAngle = (a1 + a2) / 2;
    const edgeLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const height = 22;
    const width = Math.max(66, Math.min(radius * 0.5, edgeLength * 0.46));
    const edgeMidX = (p1.x + p2.x) / 2;
    const edgeMidY = (p1.y + p2.y) / 2;
    const outwardX = Math.cos(midAngle);
    const outwardY = Math.sin(midAngle);
    const centerX = edgeMidX - outwardX * (height / 2 - 0.5);
    const centerY = edgeMidY - outwardY * (height / 2 - 0.5);
    const half = width / 2;
    const g = new Graphics();
    g.roundRect(-width / 2, -height / 2, width, height, 4);
    g.fill({ color: 0x0d1b24, alpha: 0.74 });
    g.stroke({ width: 1, color: 0xd8f2f7, alpha: 0.42 });
    g.roundRect(-width / 2 + 2, -height / 2 + 2, half - 3, height - 4, 4);
    g.fill({ color: ATTACK_COLOR, alpha: 0.88 });
    g.roundRect(1, -height / 2 + 2, half - 3, height - 4, 4);
    g.fill({ color: HP_COLOR, alpha: 0.88 });
    g.rect(-0.5, -height / 2 + 4, 1, height - 8);
    g.fill({ color: 0xf4fbff, alpha: 0.28 });
    g.rect(-width / 2 + 5, -height / 2 + 2, width - 10, 1);
    g.fill({ color: 0xffffff, alpha: 0.16 });
    g.position.set(centerX, centerY);
    g.rotation = barAngle;
    g.alpha = alpha;
    g.eventMode = 'none';
    this.statContainer.addChild(g);

    const attackPos = this.rotatedPoint(centerX, centerY, -width * 0.25, 0, barAngle);
    const hpPos = this.rotatedPoint(centerX, centerY, width * 0.25, 0, barAngle);
    const fontSize = 15;
    const attackAnim = powerAnims?.get(`sector:${sector}:attack`);
    const hpAnim = powerAnims?.get(`sector:${sector}:hp`) ?? powerAnims?.get(`${sector}`);
    const attackText = this.addStatText(this.statContainer, `${attack}`, attackPos.x, attackPos.y, fontSize, alpha);
    attackText.scale.set(attackAnim?.scaleX ?? 1, attackAnim?.scaleY ?? 1);
    const hpText = this.addStatText(this.statContainer, `${hp}`, hpPos.x, hpPos.y, fontSize, alpha);
    hpText.scale.set(hpAnim?.scaleX ?? 1, hpAnim?.scaleY ?? 1);
    hpText.label = 'Value-HP';
  }

  private addStatText(container: Container, text: string, x: number, y: number, fontSize: number, alpha: number): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: 'Arial',
        fontSize,
        fill: 0xffffff,
        fontWeight: 'bold',
        stroke: { color: 0x10202a, width: 2 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.rotation = 0;
    label.alpha = alpha;
    label.eventMode = 'none';
    container.addChild(label);
    return label;
  }

  private rotatedPoint(cx: number, cy: number, localX: number, localY: number, angle: number): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: cx + localX * cos - localY * sin,
      y: cy + localX * sin + localY * cos,
    };
  }
}
