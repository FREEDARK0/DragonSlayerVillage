import { Container, Graphics, Text } from 'pixi.js';
import { OctagonBoard } from '../core/OctagonBoard';
import { GameRenderer } from './GameRenderer';
import { BlockType, getVillageLevel, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { SECTOR_COUNT, sectorAngle } from '../utils/SectorUtils';
import { BlockAnimation } from './EffectRenderer';

function isNightSector(sector: number, start: number, len: number): boolean {
  for (let i = 0; i < len; i++) if (((start + i) % 8) === sector) return true;
  return false;
}

export class BlockRenderer {
  private container: Container;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'BlockRenderer';
    renderer.getLayer(2).addChild(this.container);
  }

  render(board: OctagonBoard, blockAnims?: Map<string, BlockAnimation>, rotationDeg: number = 0, nightStart?: number, nightLen?: number): void {
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
      const nightAlpha = (nightStart !== undefined && nightLen !== undefined && isNightSector(i, nightStart, nightLen)) ? 0.35 : 1;

      const bc = new Container();
      bc.position.set(cx, cy);
      bc.scale.set(scaleX, scaleY);
      bc.alpha = animAlpha * nightAlpha;
      bc.rotation = 0;
      const g = new Graphics();

      switch (block.type) {
        case BlockType.VILLAGE: this.drawVillage(g, s, block); break;
        case BlockType.KNIGHT: this.drawKnight(g, s); break;
        case BlockType.MAGE: this.drawMage(g, s); break;
        case BlockType.VOODOO: this.drawVoodoo(g, s, block); break;
        case BlockType.POWER_STONE: this.drawPowerStone(g, s); break;
        case BlockType.WEAKNESS: this.drawWeakness(g, s); break;
        case BlockType.WOOD_WALL: this.drawWoodWall(g, s); break;
      }

      g.label = `Block-${block.type}[${i}]`;
      bc.addChild(g);

      // Value display (skip if night)
      if (block.value > 0 && animAlpha > 0.3 && nightAlpha > 0.5) {
        const valR = R * 0.85;
        const valAngle = sectorAngle(i, rotationDeg);
        const wx = cxOct + Math.cos(valAngle) * valR;
        const wy = cyOct + Math.sin(valAngle) * valR;
        const valText = new Text({
          text: `${block.value}`,
          style: { fontFamily: 'Arial', fontSize: 14, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } },
        });
        valText.anchor.set(0.5, 0.5);
        valText.position.set(wx - cx, wy - cy);
        valText.rotation = 0;
        valText.label = `Value-${block.id}`;
        bc.addChild(valText);
      }

      // Block name label (skip if night)
      if (nightAlpha < 0.5) { bc.addChild(new Container()); /* skip */ }
      else {
      const labelText = new Text({
        text: BLOCK_TYPE_TABLE[block.type].label,
        style: { fontFamily: 'Arial', fontSize: 9, fill: 0xcccccc, align: 'center' },
      });
      labelText.anchor.set(0.5, 0);
      labelText.position.set(0, s * 0.7);
      labelText.rotation = 0;
      bc.addChild(labelText);
      } // end night skip

      this.container.addChild(bc);
    }
  }

  private drawVillage(g: Graphics, s: number, block: any): void {
    const level = getVillageLevel(block.power);
    const lvlColors = [0x66bb44, 0x88cc55, 0xaadd66, 0xccff88, 0xddff99];
    const c = lvlColors[Math.min(level, 4)];
    // House body
    g.roundRect(-s * 0.55, -s * 0.1, s * 1.1, s * 0.8, 3);
    g.fill(c); g.stroke({ width: 1, color: 0x448833 });
    // Roof
    g.poly([0, -s * 0.8, s * 0.75, -s * 0.05, -s * 0.75, -s * 0.05]);
    g.fill(0xcc6633); g.stroke({ width: 1, color: 0x994422 });
    // Chimney
    g.roundRect(s * 0.25, -s * 0.6, s * 0.12, s * 0.3, 2);
    g.fill(0xaa6644);
    // Level stars
    for (let i = 0; i < level; i++) {
      const sx = -s * 0.4 + i * s * 0.2;
      this.drawStar(g, sx, s * 0.6, s * 0.08);
    }
  }

  private drawKnight(g: Graphics, s: number): void {
    // Shield body
    g.poly([0, -s * 0.7, s * 0.55, -s * 0.3, s * 0.45, s * 0.5, 0, s * 0.8, -s * 0.45, s * 0.5, -s * 0.55, -s * 0.3]);
    g.fill(0x4488ff); g.stroke({ width: 1, color: 0x2255cc });
    // Sword
    g.roundRect(-s * 0.02, -s * 0.85, s * 0.04, s * 0.55, 1);
    g.fill(0xddeeff);
    // Cross guard
    g.roundRect(-s * 0.3, -s * 0.35, s * 0.6, s * 0.06, 1);
    g.fill(0xcca833);
  }

  private drawMage(g: Graphics, s: number): void {
    // Robe
    g.poly([0, -s * 0.6, s * 0.45, s * 0.1, s * 0.35, s * 0.8, -s * 0.35, s * 0.8, -s * 0.45, s * 0.1]);
    g.fill(0x8844cc); g.stroke({ width: 1, color: 0x6622aa });
    // Hat
    g.poly([0, -s * 0.9, s * 0.25, -s * 0.5, -s * 0.25, -s * 0.5]);
    g.fill(0x6622aa);
    // Staff
    g.roundRect(s * 0.35, -s * 0.7, s * 0.04, s * 0.8, 1);
    g.fill(0x886633);
    g.circle(s * 0.37, -s * 0.7, s * 0.1);
    g.fill(0xaa44ff);
  }

  private drawVoodoo(g: Graphics, s: number, block: any): void {
    const color = block.targetColor ?? 0x888888;
    // Doll body
    g.circle(0, -s * 0.1, s * 0.35);
    g.fill(color); g.stroke({ width: 1, color: 0x666666 });
    // Body
    g.ellipse(0, s * 0.3, s * 0.25, s * 0.4);
    g.fill(color); g.stroke({ width: 1, color: 0x666666 });
    // Arms
    g.roundRect(-s * 0.5, s * 0.1, s * 0.18, s * 0.06, 2);
    g.fill(color);
    g.roundRect(s * 0.32, s * 0.1, s * 0.18, s * 0.06, 2);
    g.fill(color);
    // Pin
    g.circle(0, s * 0.25, s * 0.05);
    g.fill(0xff4444);
    // Eyes
    g.circle(-s * 0.1, -s * 0.15, s * 0.05);
    g.fill(0x000000);
    g.circle(s * 0.1, -s * 0.15, s * 0.05);
    g.fill(0x000000);
  }

  private drawPowerStone(g: Graphics, s: number): void {
    // Diamond shape
    g.poly([0, -s * 0.75, s * 0.5, 0, 0, s * 0.75, -s * 0.5, 0]);
    g.fill(0xffaa00); g.stroke({ width: 1, color: 0xcc8800 });
    // Inner glow
    g.poly([0, -s * 0.35, s * 0.2, 0, 0, s * 0.35, -s * 0.2, 0]);
    g.fill(0xffcc44);
    // Sparkle
    g.circle(0, -s * 0.3, s * 0.08);
    g.fill(0xffffff);
  }

  private drawWoodWall(g: Graphics, s: number): void {
    // Wooden palisade wall
    g.roundRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1, 3);
    g.fill(0x8B6914);
    g.stroke({ width: 1.5, color: 0x5C3A00 });
    // Vertical logs
    for (let i = 0; i < 4; i++) {
      const lx = -s * 0.4 + i * s * 0.27;
      g.roundRect(lx, -s * 0.55, s * 0.08, s * 1.1, 1);
      g.fill(0x6B4914);
    }
    // Horizontal beams
    g.roundRect(-s * 0.55, -s * 0.25, s * 1.1, s * 0.06, 1);
    g.fill(0x5C3A00);
    g.roundRect(-s * 0.55, s * 0.2, s * 1.1, s * 0.06, 1);
    g.fill(0x5C3A00);
  }

  private drawWeakness(g: Graphics, s: number): void {
    // Red cracked circle
    g.circle(0, 0, s * 0.7);
    g.fill(0xcc2222);
    g.stroke({ width: 1.5, color: 0xff4444 });
    // Crack lines
    g.rect(-s * 0.35, -s * 0.05, s * 0.7, s * 0.03);
    g.fill(0x880000);
    g.rect(-s * 0.05, -s * 0.35, s * 0.03, s * 0.7);
    g.fill(0x880000);
    // Skull center
    g.circle(0, 0, s * 0.15);
    g.fill(0x440000);
  }

  private drawStar(g: Graphics, cx: number, cy: number, r: number): void {
    const pts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      const ia = a + Math.PI / 5;
      pts.push(cx + Math.cos(ia) * r * 0.4, cy + Math.sin(ia) * r * 0.4);
    }
    g.poly(pts);
    g.fill(0xffdd44);
  }
}
