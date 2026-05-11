import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { GAME_CONSTANTS } from '../config/constants';
import { sectorStartAngle, sectorEndAngle, SECTOR_COUNT } from '../utils/SectorUtils';

// --- Animation types ---
export type AnimType = 'bounce' | 'shrink' | 'grow';

export interface BlockAnimation {
  type: AnimType;
  progress: number;
  duration: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
}

interface FloatingText {
  text: Text;
  life: number;
  maxLife: number;
  vy: number;
  vx: number;
}

interface ScreenFlash {
  alpha: number;
  life: number;
  maxLife: number;
}

export class EffectRenderer {
  private container: Container;
  private floatingTexts: FloatingText[] = [];
  private flash: ScreenFlash | null = null;
  private flashGraphics: Graphics;
  /** 方块动画状态 map: "r,c" → animation */
  blockAnims: Map<string, BlockAnimation> = new Map();

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'EffectRenderer';
    renderer.getLayer(3).addChild(this.container);

    this.flashGraphics = new Graphics();
    this.flashGraphics.label = 'ScreenFlash';
    renderer.getLayer(6).addChild(this.flashGraphics);
  }

  // ─── Public API ───────────────────────────

  /** 视野框触发——弹性回弹动画 (慢速) */
  startBounce(sector: number): void {
    this.blockAnims.set(`${sector}`, { type: 'bounce', progress: 0, duration: 70, scaleX: 1, scaleY: 1, alpha: 1 });
  }

  /** 方块即将销毁——缩小消失动画 */
  startShrink(sector: number): void {
    this.blockAnims.set(`${sector}`, { type: 'shrink', progress: 0, duration: 18, scaleX: 1, scaleY: 1, alpha: 1 });
  }

  /** 新方块生成——放大出现动画 */
  startGrow(sector: number): void {
    this.blockAnims.set(`${sector}`, { type: 'grow', progress: 0, duration: 22, scaleX: 0, scaleY: 0, alpha: 1 });
  }

  /** 移除动画 */
  removeAnim(sector: number): void {
    this.blockAnims.delete(`${sector}`);
  }

  /** 在指定扇形显示飘字 */
  showFloatingText(sector: number, text: string, color: number = 0xffffff): void {
    const pos = this.renderer.sectorToPixel(sector);
    const cx = pos.x;
    const cy = pos.y;

    const t = new Text({
      text,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 13,
        fill: color,
        fontWeight: 'bold',
        align: 'center',
        stroke: { color: 0x000000, width: 3 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(cx, cy);
    this.container.addChild(t);

    this.floatingTexts.push({
      text: t,
      life: 0,
      maxLife: 50,
      vy: -1.2,
      vx: (Math.random() - 0.5) * 0.4,
    });
  }

  /** 屏幕闪烁效果 */
  triggerScreenFlash(color: number = 0xff4444, duration: number = 15): void {
    this.flash = { alpha: 0.4, life: 0, maxLife: duration };
    const w = this.renderer.screenW;
    const h = this.renderer.screenH;
    this.flashGraphics.clear();
    this.flashGraphics.rect(0, 0, w, h);
    this.flashGraphics.fill({ color, alpha: 0.4 });
  }

  /** 攻击位置高亮 */
  showAttackHighlight(sectors: number[], duration: number = 30, color: number = 0xff4444): void {
    const g = new Graphics();
    for (const s of sectors) {
      const pos = this.renderer.sectorToPixel(s);
      g.circle(pos.x, pos.y, 20);
      g.fill({ color, alpha: 0.45 });
    }

    g.label = 'AttackHighlight';
    this.container.addChild(g);

    let life = 0;
    const tick = () => {
      life++;
      g.alpha = 1 - life / duration;
      if (life >= duration) {
        this.container.removeChild(g);
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  /** 整个三角形闪白 */
  flashSector(sector: number, rotationDeg: number = 0): void {
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const g = new Graphics();
    const a1 = sectorStartAngle(sector, rotationDeg);
    const a2 = sectorEndAngle(sector, rotationDeg);
    g.poly([
      cx, cy,
      cx + Math.cos(a1) * R, cy + Math.sin(a1) * R,
      cx + Math.cos(a2) * R, cy + Math.sin(a2) * R,
    ]);
    g.fill({ color: 0xffffff, alpha: 0.7 });
    g.label = 'SectorFlash';
    this.container.addChild(g);

    let life = 0;
    const duration = 18;
    const tick = () => {
      life++;
      g.alpha = 1 - life / duration;
      if (life >= duration) {
        this.container.removeChild(g);
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  /** 攻击范围红色粗描边 */
  showAttackOutline(sectors: number[], rotationDeg: number = 0): void {
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const g = new Graphics();

    // Sort sectors to find consecutive runs
    const sorted = [...sectors].sort((a, b) => a - b);
    // Draw outer boundary of the affected region
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const startA = sectorStartAngle(first, rotationDeg);
    const endA = sectorEndAngle(last, rotationDeg);

    // Radial line from center to first vertex
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(startA) * R, cy + Math.sin(startA) * R);
    // Outer edge along all affected sectors
    for (const s of sorted) {
      const a = sectorEndAngle(s, rotationDeg);
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    // Radial line back to center
    g.lineTo(cx, cy);
    g.closePath();
    g.stroke({ width: 4, color: 0xff2222, alpha: 0.9, join: 'round' });

    g.label = 'AttackOutline';
    this.container.addChild(g);

    let life = 0;
    const duration = 100;
    const tick = () => {
      life++;
      if (life >= duration) {
        this.container.removeChild(g);
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  // ─── Per-frame update ──────────────────────

  update(): void {
    this.updateBlockAnimations();
    this.updateFloatingTexts();
    this.updateFlash();
  }

  private updateBlockAnimations(): void {
    const done: string[] = [];

    for (const [key, anim] of this.blockAnims) {
      anim.progress++;
      const t = Math.min(anim.progress / anim.duration, 1);

      switch (anim.type) {
        case 'bounce': {
          // Spring-like elastic bounce: shrink fast then overshoot
          const s = 1 - 0.45 * Math.sin(t * Math.PI * 1.5) * Math.exp(-t * 6);
          anim.scaleX = s;
          anim.scaleY = s;
          anim.alpha = 1;
          break;
        }
        case 'shrink': {
          // Cubic ease-out: shrink to nothing
          const s = Math.pow(1 - t, 3);
          anim.scaleX = s;
          anim.scaleY = s;
          anim.alpha = 1 - t;
          break;
        }
        case 'grow': {
          // Elastic grow: overshoot then settle
          const base = Math.sin(t * Math.PI / 2);
          const overshoot = Math.sin(t * Math.PI * 2.5) * Math.exp(-t * 5) * 0.18;
          const s = Math.max(0, Math.min(1.3, base + overshoot));
          anim.scaleX = s;
          anim.scaleY = s;
          anim.alpha = Math.min(1, t * 2);
          break;
        }
      }

      if (anim.progress >= anim.duration) {
        if (anim.type === 'shrink') {
          anim.scaleX = 0;
          anim.scaleY = 0;
          anim.alpha = 0;
          // Keep for one more tick then remove
        }
        if (anim.type === 'bounce' || anim.type === 'grow') {
          // Settle at identity
          anim.scaleX = 1;
          anim.scaleY = 1;
          anim.alpha = 1;
          done.push(key);
        }
        if (anim.type === 'shrink' && anim.progress >= anim.duration + 5) {
          done.push(key);
        }
      }
    }

    // Clean up completed animations (but keep shrink for rendering)
    for (const key of done) {
      this.blockAnims.delete(key);
    }
  }

  private updateFloatingTexts(): void {
    const dead: FloatingText[] = [];
    for (const ft of this.floatingTexts) {
      ft.life++;
      ft.text.position.y += ft.vy;
      ft.text.position.x += ft.vx;
      ft.text.alpha = 1 - ft.life / ft.maxLife;
      if (ft.life >= ft.maxLife) dead.push(ft);
    }
    for (const ft of dead) {
      this.container.removeChild(ft.text);
      const idx = this.floatingTexts.indexOf(ft);
      if (idx >= 0) this.floatingTexts.splice(idx, 1);
    }
  }

  private updateFlash(): void {
    if (!this.flash) return;
    this.flash.life++;
    const p = this.flash.life / this.flash.maxLife;
    this.flashGraphics.alpha = this.flash.alpha * (1 - p);
    if (this.flash.life >= this.flash.maxLife) {
      this.flashGraphics.clear();
      this.flash = null;
    }
  }

  clear(): void {
    for (const ft of this.floatingTexts) {
      this.container.removeChild(ft.text);
    }
    this.floatingTexts = [];
    this.flashGraphics.clear();
    this.flash = null;
    this.blockAnims.clear();
  }
}
