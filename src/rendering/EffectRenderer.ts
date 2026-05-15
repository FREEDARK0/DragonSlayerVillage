import { Container, Filter, GlProgram, Graphics, Text, UniformGroup } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { sectorAngle, sectorStartAngle, sectorEndAngle } from '../utils/SectorUtils';

const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vUnitCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vUnitCoord = aPosition;
}
`;

const BREATH_FRAGMENT = `
in vec2 vTextureCoord;
in vec2 vUnitCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uProgress;
uniform float uTime;
uniform float uRadius;
uniform vec2 uSource;
uniform vec4 uBounds;

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

void main()
{
    vec4 mask = texture(uTexture, vTextureCoord);
    if (mask.a <= 0.01)
    {
        finalColor = vec4(0.0);
        return;
    }

    vec2 p = uBounds.xy + vUnitCoord * uBounds.zw;
    float d = distance(p, uSource);
    float n = noise(p * 0.034 + vec2(uTime * 2.2, -uTime * 1.35));
    float ripple = sin((p.x + p.y) * 0.045 - uTime * 13.0) * 0.5 + 0.5;
    float front = uProgress * uRadius;
    float roughFront = front + (n - 0.5) * 54.0 + ripple * 18.0;
    float reveal = smoothstep(-38.0, 26.0, roughFront - d);
    float leading = 1.0 - smoothstep(10.0, 88.0, abs(roughFront - d));
    float core = smoothstep(-16.0, 30.0, roughFront - d) * (0.55 + 0.45 * ripple);
    float tail = 1.0 - smoothstep(0.72, 1.03, uProgress);
    float emberPulse = 0.74 + 0.26 * sin(uTime * 18.0 + n * 5.0);
    float alpha = mask.a * reveal * (0.72 + leading * 0.34) * max(0.48, tail) * emberPulse;

    vec3 ember = vec3(0.72, 0.035, 0.0);
    vec3 flame = vec3(1.0, 0.26, 0.015);
    vec3 hot = vec3(1.0, 0.84, 0.25);
    vec3 color = mix(ember, flame, clamp(n + 0.28, 0.0, 1.0));
    color = mix(color, hot, clamp(core + leading * 0.6, 0.0, 1.0));

    finalColor = vec4(color * alpha, alpha);
}
`;

// --- Animation types ---
export type AnimType = 'bounce' | 'shrink' | 'grow' | 'pop';

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
  /** 数值动画状态，使用 "sector:0:hp"、"dragon:id:attack"、"village" 等 key */
  powerAnims: Map<string, BlockAnimation> = new Map();

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

  /** HP 数字快速放大并回弹 */
  startPowerBounce(target: number | 'village'): void {
    this.startStatBounce(target === 'village' ? 'village' : `sector:${target}:hp`);
  }

  /** 属性数字快速放大、压缩并回弹 */
  startStatBounce(key: string): void {
    this.powerAnims.set(key, { type: 'pop', progress: 0, duration: 26, scaleX: 1, scaleY: 1, alpha: 1 });
  }

  /** 节奏节点触发反馈 */
  startRhythmBounce(index: number): void {
    this.powerAnims.set(`rhythm:${index}`, { type: 'pop', progress: 0, duration: 26, scaleX: 1, scaleY: 1, alpha: 1 });
  }

  /** 移除动画 */
  removeAnim(sector: number): void {
    this.blockAnims.delete(`${sector}`);
  }

  /** 在指定扇形显示飘字 */
  showFloatingText(sector: number, text: string, color: number = 0xffffff): void {
    const pos = this.renderer.sectorToPixel(sector);
    this.showFloatingTextAt(pos.x, pos.y, text, color);
  }

  /** 在指定屏幕坐标显示飘字 */
  showFloatingTextAt(cx: number, cy: number, text: string, color: number = 0xffffff): void {
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
  showAttackOutline(sectors: number[], rotationDeg: number = 0, duration: number = 100): void {
    this.drawAttackRangeOutline(sectors, rotationDeg, duration);
  }

  /** 粗红色完整包裹攻击范围，按 targetSectors 原始连续顺序绘制。 */
  drawAttackRangeOutline(sectors: number[], rotationDeg: number = 0, duration: number = 320): void {
    const g = this.createAttackRangeOutline(sectors, rotationDeg);
    if (!g) return;
    g.label = 'AttackOutline';
    this.container.addChild(g);

    const startedAt = animationNow();
    const tick = () => {
      const elapsed = animationNow() - startedAt;
      const fadeStart = duration * 0.68;
      if (elapsed > fadeStart) {
        g.alpha = Math.max(0, 1 - (elapsed - fadeStart) / Math.max(1, duration - fadeStart));
      }
      if (elapsed >= duration) {
        this.container.removeChild(g);
        this.renderer.app.ticker.remove(tick);
      }
    };
    this.renderer.app.ticker.add(tick);
  }

  /** 龙息冲击波：粗红描边包裹范围，并用火焰 shader 从龙所在边铺满攻击区域 */
  showBreathShockwave(sectors: number[], sourceSector: number, rotationDeg: number = 0): void {
    if (sectors.length === 0) return;
    const group = new Container();
    group.label = 'BreathShockwave';
    group.sortableChildren = true;

    const points = this.attackRangePolygonPoints(sectors, rotationDeg);
    const source = this.breathSourcePoint(sourceSector, rotationDeg);
    const bounds = polygonBounds(points);
    const radius = Math.max(this.renderer.octagonRadius * 1.35, distanceToBoundsFarCorner(source.x, source.y, bounds) + 50);

    const rangeMask = new Graphics();
    rangeMask.poly(points);
    rangeMask.fill({ color: 0xffffff, alpha: 1 });
    rangeMask.label = 'BreathRangeMask';
    group.addChild(rangeMask);
    rangeMask.renderable = false;

    const fallbackFlame = new Graphics();
    fallbackFlame.label = 'BreathFallbackFlame';
    const fallbackLayer = new Container();
    fallbackLayer.label = 'BreathFallbackLayer';
    fallbackLayer.mask = rangeMask;
    fallbackLayer.addChild(fallbackFlame);
    fallbackLayer.zIndex = 1;

    const flameShape = new Graphics();
    flameShape.poly(points);
    flameShape.fill({ color: 0xff3a08, alpha: 1 });
    flameShape.label = 'BreathShaderFlame';
    flameShape.zIndex = 2;

    const uniforms = new UniformGroup({
      uProgress: { value: 0, type: 'f32' },
      uTime: { value: Math.random() * 10, type: 'f32' },
      uRadius: { value: radius, type: 'f32' },
      uSource: { value: new Float32Array([source.x, source.y]), type: 'vec2<f32>' },
      uBounds: { value: new Float32Array([bounds.x, bounds.y, bounds.width, bounds.height]), type: 'vec4<f32>' },
    });
    const filter = new Filter({
      glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: BREATH_FRAGMENT, name: 'dragon-breath-filter' }),
      resources: { breathUniforms: uniforms },
      padding: 8,
    });
    flameShape.filters = [filter];

    const outline = this.createAttackRangeOutline(sectors, rotationDeg);
    if (outline) {
      outline.label = 'BreathRangeOutline';
      outline.zIndex = 3;
    }

    group.addChild(fallbackLayer);
    group.addChild(flameShape);
    if (outline) group.addChild(outline);
    this.container.addChild(group);

    const startedAt = animationNow();
    const fillDurationMs = 300;
    const fadeDurationMs = 130;
    const totalDurationMs = fillDurationMs + fadeDurationMs;
    const tick = () => {
      const elapsed = animationNow() - startedAt;
      const progress = Math.min(elapsed / fillDurationMs, 1);
      const eased = easeOutCubic(progress);
      uniforms.uniforms.uProgress = easeOutCubic(progress);
      uniforms.uniforms.uTime += 0.11;
      this.drawBreathFallbackFlame(fallbackFlame, source, radius, eased, elapsed);
      if (elapsed > fillDurationMs) {
        const fade = 1 - (elapsed - fillDurationMs) / fadeDurationMs;
        group.alpha = Math.max(0, fade);
      }
      if (elapsed >= totalDurationMs) {
        this.container.removeChild(group);
        filter.destroy();
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

  hasActiveBoardAnimations(): boolean {
    return this.blockAnims.size > 0 || this.powerAnims.size > 0;
  }

  private updateBlockAnimations(): void {
    this.updateAnimationMap(this.blockAnims);
    this.updateAnimationMap(this.powerAnims);
  }

  private updateAnimationMap(anims: Map<string, BlockAnimation>): void {
    const done: string[] = [];

    for (const [key, anim] of anims) {
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
        case 'pop': {
          const s = statPopScale(t);
          anim.scaleX = s;
          anim.scaleY = s;
          anim.alpha = 1;
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
        if (anim.type === 'bounce' || anim.type === 'grow' || anim.type === 'pop') {
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
      anims.delete(key);
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
    this.powerAnims.clear();
  }

  private attackRangePolygonPoints(sectors: number[], rotationDeg: number): number[] {
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const points = [cx, cy];
    const startA = sectorStartAngle(sectors[0], rotationDeg);
    points.push(cx + Math.cos(startA) * R, cy + Math.sin(startA) * R);
    for (const sector of sectors) {
      const a = sectorEndAngle(sector, rotationDeg);
      points.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    return points;
  }

  private strokeAttackRange(g: Graphics, sectors: number[], rotationDeg: number, width: number, color: number, alpha: number): void {
    if (sectors.length === 0) return;
    g.poly(this.attackRangePolygonPoints(sectors, rotationDeg));
    g.stroke({ width, color, alpha, join: 'round', cap: 'round' });
  }

  private createAttackRangeOutline(sectors: number[], rotationDeg: number): Graphics | null {
    if (sectors.length === 0) return null;
    const g = new Graphics();
    this.strokeAttackRange(g, sectors, rotationDeg, 14, 0x8f0500, 0.72);
    this.strokeAttackRange(g, sectors, rotationDeg, 8, 0xff1f13, 0.98);
    this.strokeAttackRange(g, sectors, rotationDeg, 3, 0xffd36a, 0.95);
    return g;
  }

  private drawBreathFallbackFlame(
    g: Graphics,
    source: { x: number; y: number },
    radius: number,
    progress: number,
    elapsedMs: number,
  ): void {
    const front = Math.max(1, radius * progress);
    const pulse = 0.5 + 0.5 * Math.sin(elapsedMs * 0.06);
    g.clear();
    g.circle(source.x, source.y, front + 28);
    g.fill({ color: 0x9a0800, alpha: 0.58 + pulse * 0.08 });
    g.circle(source.x, source.y, Math.max(1, front * 0.86));
    g.fill({ color: 0xff3b0b, alpha: 0.62 });
    g.circle(source.x, source.y, Math.max(1, front * 0.56));
    g.fill({ color: 0xff971f, alpha: 0.56 });
    g.circle(source.x, source.y, Math.max(1, front * 0.28));
    g.fill({ color: 0xfff08a, alpha: 0.48 });
    g.circle(source.x, source.y, front + 7 + pulse * 9);
    g.stroke({ width: 16, color: 0xffdf59, alpha: 0.58, cap: 'round', join: 'round' });
    g.circle(source.x, source.y, front + 20 + pulse * 6);
    g.stroke({ width: 24, color: 0xff2911, alpha: 0.34, cap: 'round', join: 'round' });
  }

  private breathSourcePoint(sourceSector: number, rotationDeg: number): { x: number; y: number } {
    const angle = sectorAngle(sourceSector, rotationDeg);
    const R = this.renderer.octagonRadius * 1.04;
    return {
      x: this.renderer.octagonCenterX + Math.cos(angle) * R,
      y: this.renderer.octagonCenterY + Math.sin(angle) * R,
    };
  }

  private drawSectorFill(g: Graphics, sector: number, rotationDeg: number, color: number, alpha: number): void {
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const a1 = sectorStartAngle(sector, rotationDeg);
    const a2 = sectorEndAngle(sector, rotationDeg);
    g.poly([
      cx, cy,
      cx + Math.cos(a1) * R, cy + Math.sin(a1) * R,
      cx + Math.cos(a2) * R, cy + Math.sin(a2) * R,
    ]);
    g.fill({ color, alpha });
  }

  private drawSectorEdge(g: Graphics, sector: number, rotationDeg: number, color: number, alpha: number): void {
    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const a1 = sectorStartAngle(sector, rotationDeg);
    const a2 = sectorEndAngle(sector, rotationDeg);
    g.moveTo(cx + Math.cos(a1) * R * 0.28, cy + Math.sin(a1) * R * 0.28);
    g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    g.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R);
    g.lineTo(cx + Math.cos(a2) * R * 0.28, cy + Math.sin(a2) * R * 0.28);
    g.stroke({ width: 4, color, alpha, join: 'round' });
  }
}

function polygonBounds(points: number[]): { x: number; y: number; width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const padding = 16;
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

function distanceToBoundsFarCorner(x: number, y: number, bounds: { x: number; y: number; width: number; height: number }): number {
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];
  return Math.max(...corners.map(corner => Math.hypot(corner.x - x, corner.y - y)));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function statPopScale(t: number): number {
  if (t < 0.28) {
    const p = t / 0.28;
    return 1 + easeOutCubic(p) * 0.82;
  }
  if (t < 0.52) {
    const p = (t - 0.28) / 0.24;
    return 1.82 + (0.78 - 1.82) * easeOutCubic(p);
  }
  if (t < 0.76) {
    const p = (t - 0.52) / 0.24;
    return 0.78 + (1.16 - 0.78) * easeOutCubic(p);
  }
  const p = (t - 0.76) / 0.24;
  return 1.16 + (1 - 1.16) * easeOutCubic(p);
}

function animationNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}
