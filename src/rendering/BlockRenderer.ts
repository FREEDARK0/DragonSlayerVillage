import { Container, Graphics, Text } from 'pixi.js';
import { Grid } from '../models/Grid';
import { GameRenderer } from './GameRenderer';
import { BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { Direction, directionToDelta } from '../utils/Direction';
import { GAME_CONSTANTS } from '../config/constants';
import { BlockAnimation } from './EffectRenderer';

function darken(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * (1 - factor));
  const g = Math.floor(((color >> 8) & 0xff) * (1 - factor));
  const b = Math.floor((color & 0xff) * (1 - factor));
  return (r << 16) | (g << 8) | b;
}

const C = {
  HERO_BODY: 0x3377cc,
  HERO_SKIN: 0xffcc88,
  HERO_HAIR: 0x553322,
  HERO_OUTLINE: 0x1a3366,
  HERO_ARROW: 0xffffff,
  VILLAGE_WALL: 0x889966,
  VILLAGE_ROOF: 0xcc6633,
  FOOD_MAIN: 0xff8844,
  FOOD_LEAF: 0x44cc44,
  SWORD_BLADE: 0xddeeff,
  SWORD_GUARD: 0xcca833,
  SWORD_HANDLE: 0x886633,
  IMP_BODY: 0xcc3333,
  IMP_HORN: 0x881111,
  IMP_EYE: 0xffff00,
  WALL_MAIN: 0x887766,
  WALL_LINE: 0x665544,
  EVIL_EYE_BODY: 0x6644aa,
  EVIL_EYE_PUPIL: 0xff44ff,
  SHIELD: 0x44aaff,
};

export class BlockRenderer {
  private container: Container;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'BlockRenderer';
    renderer.getLayer(2).addChild(this.container);
  }

  render(grid: Grid, blockAnims?: Map<string, BlockAnimation>): void {
    this.container.removeChildren();

    const cellSize = GAME_CONSTANTS.CELL_SIZE;
    const halfCell = cellSize / 2;

    grid.forEach(cell => {
      if (!cell.block) return;
      const block = cell.block;
      const cx = this.renderer.gridOriginX + cell.position.col * cellSize + halfCell;
      const cy = this.renderer.gridOriginY + cell.position.row * cellSize + halfCell;
      const s = cellSize * 0.38;

      // Check animation state for this position
      const anim = blockAnims?.get(cell.position.key());
      const scaleX = anim?.scaleX ?? 1;
      const scaleY = anim?.scaleY ?? 1;
      const alpha = anim?.alpha ?? 1;

      // Skip fully invisible blocks
      if (alpha <= 0) return;

      // Wrap everything in a per-block container for transform
      const blockContainer = new Container();
      blockContainer.position.set(cx, cy);
      blockContainer.scale.set(scaleX, scaleY);
      blockContainer.alpha = alpha;

      const g = new Graphics();
      // All drawing relative to (0,0) since container handles position
      const originX = 0;
      const originY = 0;

      // Shadow
      const shadow = new Graphics();
      shadow.circle(originX + 2, originY + 2, s + 2);
      shadow.fill({ color: 0x000000, alpha: 0.2 });

      switch (block.type) {
        case BlockType.VILLAGE:
          this.drawVillage(g, originX, originY, s);
          break;
        case BlockType.FOOD:
          this.drawFood(g, originX, originY, s);
          break;
        case BlockType.SWORD:
          this.drawSword(g, originX, originY, s, block.targetColor);
          break;
        case BlockType.TRAINING:
          this.drawTraining(g, originX, originY, s);
          break;
        case BlockType.IMP:
          this.drawImp(g, originX, originY, s);
          break;
        case BlockType.WALL:
          this.drawWall(g, originX, originY, s);
          break;
        case BlockType.EVIL_EYE:
          this.drawEvilEye(g, originX, originY, s);
          break;
      }

      // Direction arrows for imps
      if (block.type === BlockType.IMP && block.direction) {
        this.drawImpDirectionArrow(g, originX, originY, s, block.direction);
      }

      g.label = `Block-${block.type}[${cell.position.row},${cell.position.col}]`;
      blockContainer.addChild(shadow);
      blockContainer.addChild(g);

      // Value number (bottom-right, >1, only if not dying)
      if (block.value > 1 && alpha > 0.3) {
        const valText = new Text({
          text: `${block.value}`,
          style: {
            fontFamily: 'Arial, sans-serif',
            fontSize: 11,
            fill: 0xffffff,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 2 },
          },
        });
        valText.anchor.set(0, 0.5);
        valText.position.set(-s + 2, s - 2);
        valText.label = `Value-${block.id}`;
        blockContainer.addChild(valText);
      }

      this.container.addChild(blockContainer);
    });
  }

  private drawHero(g: Graphics, cx: number, cy: number, s: number): void {
    const r = s * 0.75;
    // Head
    g.circle(cx, cy - r * 0.55, r * 0.35);
    g.fill(C.HERO_SKIN);
    g.stroke({ width: 1.2, color: C.HERO_OUTLINE });

    // Helmet / hair
    g.ellipse(cx, cy - r * 0.6, r * 0.35, r * 0.2);
    g.fill(C.HERO_HAIR);

    // Body (armor plate - shield-like trapezoid)
    g.poly([
      cx - r * 0.45, cy - r * 0.15,
      cx + r * 0.45, cy - r * 0.15,
      cx + r * 0.35, cy + r * 0.7,
      cx - r * 0.35, cy + r * 0.7,
    ]);
    g.fill(C.HERO_BODY);
    g.stroke({ width: 1.2, color: C.HERO_OUTLINE });

    // Belt
    g.roundRect(cx - r * 0.38, cy + r * 0.2, r * 0.76, r * 0.12, 2);
    g.fill(0x886633);

    // Shoulder armor
    g.ellipse(cx - r * 0.38, cy - r * 0.08, r * 0.2, r * 0.13);
    g.fill(C.HERO_BODY);
    g.stroke({ width: 1, color: C.HERO_OUTLINE });
    g.ellipse(cx + r * 0.38, cy - r * 0.08, r * 0.2, r * 0.13);
    g.fill(C.HERO_BODY);
    g.stroke({ width: 1, color: C.HERO_OUTLINE });

    // Legs
    g.roundRect(cx - r * 0.25, cy + r * 0.6, r * 0.18, r * 0.4, 3);
    g.fill(C.HERO_BODY);
    g.stroke({ width: 1, color: C.HERO_OUTLINE });
    g.roundRect(cx + r * 0.08, cy + r * 0.6, r * 0.18, r * 0.4, 3);
    g.fill(C.HERO_BODY);
    g.stroke({ width: 1, color: C.HERO_OUTLINE });

    // Shield on left arm
    g.ellipse(cx - r * 0.5, cy + r * 0.1, r * 0.18, r * 0.28);
    g.fill(0x5588cc);
    g.stroke({ width: 1, color: 0x336699 });
    // Cross on shield
    g.rect(cx - r * 0.52, cy + r * 0.02, r * 0.04, r * 0.16);
    g.fill(0xccaa44);
    g.rect(cx - r * 0.58, cy + r * 0.07, r * 0.16, r * 0.04);
    g.fill(0xccaa44);
  }

  private drawHeroDirectionArrow(g: Graphics, cx: number, cy: number, s: number, dir: Direction): void {
    const { dr, dc } = directionToDelta(dir);
    const dist = s * 1.15;
    const tipX = cx + dc * dist;
    const tipY = cy + dr * dist;
    const baseX = cx + dc * (dist - s * 0.45);
    const baseY = cy + dr * (dist - s * 0.45);
    const perpX = -dr * s * 0.22;
    const perpY = dc * s * 0.22;

    g.poly([
      tipX, tipY,
      baseX + perpX, baseY + perpY,
      baseX - perpX, baseY - perpY,
    ]);
    g.fill(C.HERO_ARROW);
  }

  private drawImpDirectionArrow(g: Graphics, cx: number, cy: number, s: number, dir: Direction): void {
    const { dr, dc } = directionToDelta(dir);
    const dist = s * 1.1;
    const tipX = cx + dc * dist;
    const tipY = cy + dr * dist;
    const baseX = cx + dc * (dist - s * 0.35);
    const baseY = cy + dr * (dist - s * 0.35);
    const perpX = -dr * s * 0.15;
    const perpY = dc * s * 0.15;

    g.poly([tipX, tipY, baseX + perpX, baseY + perpY, baseX - perpX, baseY - perpY]);
    g.fill(0xffaaaa);
  }

  private drawVillage(g: Graphics, cx: number, cy: number, s: number): void {
    // House body — wider base
    g.roundRect(cx - s * 0.6, cy, s * 1.2, s * 0.75, 4);
    g.fill(C.VILLAGE_WALL);
    g.stroke({ width: 1.2, color: 0x667744 });

    // Roof — steep triangle with overhang
    g.poly([
      cx, cy - s * 0.85,
      cx + s * 0.8, cy + s * 0.05,
      cx - s * 0.8, cy + s * 0.05,
    ]);
    g.fill(C.VILLAGE_ROOF);
    g.stroke({ width: 1, color: 0x994422 });

    // Chimney
    g.roundRect(cx + s * 0.3, cy - s * 0.65, s * 0.15, s * 0.35, 2);
    g.fill(0xaa6644);

    // Smoke puffs
    g.circle(cx + s * 0.37, cy - s * 0.75, s * 0.1);
    g.fill({ color: 0xcccccc, alpha: 0.5 });
    g.circle(cx + s * 0.42, cy - s * 0.92, s * 0.07);
    g.fill({ color: 0xcccccc, alpha: 0.3 });
  }

  private drawFood(g: Graphics, cx: number, cy: number, s: number): void {
    // Apple shape
    g.circle(cx, cy + s * 0.1, s * 0.65);
    g.fill(C.FOOD_MAIN);
    g.stroke({ width: 1, color: 0xcc6633 });

    // Leaf
    g.ellipse(cx, cy - s * 0.65, s * 0.18, s * 0.32);
    g.fill(C.FOOD_LEAF);

    // Stem
    g.rect(cx - s * 0.02, cy - s * 0.45, s * 0.04, s * 0.2);
    g.fill(0x886633);

    // Shine spot
    g.ellipse(cx - s * 0.15, cy - s * 0.15, s * 0.15, s * 0.2);
    g.fill({ color: 0xffffff, alpha: 0.3 });
  }

  private drawSword(g: Graphics, cx: number, cy: number, s: number, dragonColor?: number): void {
    const bladeColor = dragonColor ?? C.SWORD_BLADE;
    // Blade
    g.poly([
      cx - s * 0.08, cy - s * 0.85,
      cx + s * 0.08, cy - s * 0.85,
      cx + s * 0.05, cy + s * 0.15,
      cx - s * 0.05, cy + s * 0.15,
    ]);
    g.fill(bladeColor);
    g.stroke({ width: 0.8, color: darken(bladeColor, 0.3) });
    // Cross guard
    g.roundRect(cx - s * 0.5, cy + s * 0.1, s * 1.0, s * 0.12, 3);
    g.fill(C.SWORD_GUARD);
    g.stroke({ width: 0.8, color: 0x997722 });
    // Handle
    g.roundRect(cx - s * 0.07, cy + s * 0.2, s * 0.14, s * 0.45, 3);
    g.fill(C.SWORD_HANDLE);
    // Pommel
    g.circle(cx, cy + s * 0.65, s * 0.1);
    g.fill(C.SWORD_GUARD);
    // Shine
    g.rect(cx - s * 0.02, cy - s * 0.7, s * 0.03, s * 0.6);
    g.fill({ color: 0xffffff, alpha: 0.4 });
  }

  private drawTraining(g: Graphics, cx: number, cy: number, s: number): void {
    // Arm
    g.roundRect(cx - s * 0.6, cy - s * 0.15, s * 0.5, s * 0.8, s * 0.2);
    g.fill(0xffaa77);
    g.stroke({ width: 1, color: 0xcc8855 });
    // Forearm (bent up)
    g.roundRect(cx + s * 0.05, cy - s * 0.55, s * 0.22, s * 0.6, s * 0.1);
    g.fill(0xffaa77);
    g.stroke({ width: 1, color: 0xcc8855 });
    // Dumbbell bar
    g.roundRect(cx - s * 0.1, cy - s * 0.75, s * 0.6, s * 0.08, 2);
    g.fill(0x888888);
    // Dumbbell weights
    g.roundRect(cx - s * 0.25, cy - s * 0.85, s * 0.15, s * 0.28, 3);
    g.fill(0x444444);
    g.stroke({ width: 0.8, color: 0x666666 });
    g.roundRect(cx + s * 0.35, cy - s * 0.85, s * 0.15, s * 0.28, 3);
    g.fill(0x444444);
    g.stroke({ width: 0.8, color: 0x666666 });
    // Muscle bulge
    g.circle(cx + s * 0.1, cy + s * 0.1, s * 0.2);
    g.fill(0xff9966);
  }

  private drawImp(g: Graphics, cx: number, cy: number, s: number): void {
    // Body
    g.ellipse(cx, cy + s * 0.15, s * 0.45, s * 0.5);
    g.fill(C.IMP_BODY);
    g.stroke({ width: 1, color: 0x991111 });

    // Head
    g.circle(cx, cy - s * 0.35, s * 0.35);
    g.fill(C.IMP_BODY);
    g.stroke({ width: 1, color: 0x991111 });

    // Horns
    g.poly([cx - s * 0.25, cy - s * 0.55, cx - s * 0.12, cy - s * 0.9, cx, cy - s * 0.45]);
    g.fill(C.IMP_HORN);
    g.poly([cx + s * 0.25, cy - s * 0.55, cx + s * 0.12, cy - s * 0.9, cx, cy - s * 0.45]);
    g.fill(C.IMP_HORN);

    // Eyes
    g.circle(cx - s * 0.12, cy - s * 0.38, s * 0.1);
    g.fill(C.IMP_EYE);
    g.circle(cx + s * 0.12, cy - s * 0.38, s * 0.1);
    g.fill(C.IMP_EYE);

    // Mouth (grin)
    g.ellipse(cx, cy - s * 0.18, s * 0.18, s * 0.08);
    g.fill(0x440000);

    // Arms
    g.ellipse(cx - s * 0.45, cy + s * 0.1, s * 0.12, s * 0.2);
    g.fill(C.IMP_BODY);
    g.stroke({ width: 0.8, color: 0x991111 });
    g.ellipse(cx + s * 0.45, cy + s * 0.1, s * 0.12, s * 0.2);
    g.fill(C.IMP_BODY);
    g.stroke({ width: 0.8, color: 0x991111 });
  }

  private drawWall(g: Graphics, cx: number, cy: number, s: number): void {
    // Main wall block
    g.roundRect(cx - s * 0.7, cy - s * 0.7, s * 1.4, s * 1.4, 4);
    g.fill(C.WALL_MAIN);
    g.stroke({ width: 1.2, color: C.WALL_LINE });

    // Brick pattern
    for (let row = 0; row < 3; row++) {
      const ry = cy - s * 0.5 + row * s * 0.45;
      const offset = row % 2 === 0 ? 0 : s * 0.3;
      for (let col = 0; col < 2; col++) {
        const rx = cx - s * 0.5 + col * s * 0.6 + offset;
        if (rx - s * 0.15 > cx - s * 0.6 && rx + s * 0.15 < cx + s * 0.6) {
          g.roundRect(rx - s * 0.15, ry - s * 0.1, s * 0.3, s * 0.2, 1.5);
          g.fill(C.WALL_LINE);
        }
      }
    }

    // Top battlement
    for (let i = 0; i < 3; i++) {
      const bx = cx - s * 0.5 + i * s * 0.5;
      g.rect(bx - s * 0.1, cy - s * 0.85, s * 0.2, s * 0.2);
      g.fill(C.WALL_MAIN);
      g.stroke({ width: 0.8, color: C.WALL_LINE });
    }
  }

  private drawEvilEye(g: Graphics, cx: number, cy: number, s: number): void {
    g.circle(cx, cy, s * 0.82);
    g.fill({ color: 0x220044, alpha: 0.5 });
    g.stroke({ width: 1.5, color: C.EVIL_EYE_BODY });
    g.ellipse(cx, cy, s * 0.4, s * 0.65);
    g.fill(C.EVIL_EYE_BODY);
    g.stroke({ width: 1, color: 0x8855cc });
    g.ellipse(cx, cy, s * 0.25, s * 0.5);
    g.fill(0xeeeeff);
    g.stroke({ width: 0.5, color: 0x888899 });
    g.ellipse(cx, cy, s * 0.08, s * 0.3);
    g.fill(C.EVIL_EYE_PUPIL);
    g.circle(cx, cy, s * 0.06);
    g.fill(0xffffff);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.poly([
        cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.7,
        cx + Math.cos(a + 0.1) * s * 0.6, cy + Math.sin(a + 0.1) * s * 0.8,
        cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.9,
      ]);
      g.stroke({ width: 0.6, color: 0x7744aa, alpha: 0.5 });
    }
  }
}
