import { Container, Graphics, Text } from 'pixi.js';
import { OctagonBoard } from '../core/OctagonBoard';
import { GameRenderer } from './GameRenderer';
import { BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { SECTOR_COUNT, sectorAngle } from '../utils/SectorUtils';
import { BlockAnimation } from './EffectRenderer';
import { drawBlockVisual } from './BlockVisualRegistry';

export class BlockRenderer {
  private container: Container;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'BlockRenderer';
    renderer.getLayer(3).addChild(this.container); // BLOCKS
  }

  render(board: OctagonBoard, blockAnims?: Map<string, BlockAnimation>, rotationDeg: number = 0): void {
    this.container.removeChildren();
    const R = this.renderer.octagonRadius;
    const cxOct = this.renderer.octagonCenterX;
    const cyOct = this.renderer.octagonCenterY;

    for (let i = 0; i < SECTOR_COUNT; i++) {
      const block = board.getSector(i);
      if (!block) continue;
      // Position at mid-radius (between inner and outer octagon)
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

      // Value display
      if (block.combatPower > 0 && animAlpha > 0.3) {
        const valR = R * 0.85;
        const valAngle = sectorAngle(i, rotationDeg);
        const wx = cxOct + Math.cos(valAngle) * valR;
        const wy = cyOct + Math.sin(valAngle) * valR;
        const valText = new Text({
          text: `${block.combatPower}`,
          style: { fontFamily: 'Arial', fontSize: 14, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } },
        });
        valText.anchor.set(0.5, 0.5);
        valText.position.set(wx - cx, wy - cy);
        valText.rotation = 0;
        valText.label = `Value-${block.id}`;
        bc.addChild(valText);
      }

      // Block name label
      const labelText = new Text({
        text: `${BLOCK_TYPE_TABLE[block.type].label} Lv.${block.level ?? 1}`,
        style: { fontFamily: 'Arial', fontSize: 9, fill: 0xcccccc, align: 'center' },
      });
      labelText.anchor.set(0.5, 0);
      labelText.position.set(0, s * 0.7);
      labelText.rotation = 0;
      bc.addChild(labelText);

      this.container.addChild(bc);
    }
  }
}
