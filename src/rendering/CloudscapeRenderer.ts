import { Container, Filter, GlProgram, Graphics, UniformGroup } from 'pixi.js';
import { GameRenderer, RenderLayer } from './GameRenderer';

type GridW = 1 | 2 | 3 | 4;
type GridH = 1 | 2;

interface CloudSeed {
  x: number;
  y: number;
  size: number;
  gridW: GridW;
  gridH: GridH;
  variant: number;
  shadowOnly?: boolean;
}

export interface CloudscapeSample {
  x: number;
  y: number;
  alpha: number;
}

export interface CloudscapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CloudscapeSnapshot {
  count: number;
  direction: { x: number; y: number };
  shadowsClippedToIsland: boolean;
  cloudShaderEnabled: boolean;
  shadowShaderEnabled: boolean;
  shaderShadowEnabled: boolean;
  cloudOverlayLayerAboveDragons: boolean;
  cloudShadowLayerAboveDragons: boolean;
  cloudAlpha: number;
  shadowAlpha: number;
  visibleCloudCount: number;
  visibleShadowCount: number;
  cloudOverlaySamples: CloudscapeSample[];
  islandShadowSamples: CloudscapeSample[];
  fallbackGraphicsEnabled: boolean;
  renderMode: 'shader-field';
  cloudShape: 'grid-rounded-rectangles';
  allowedGridSizes: string[];
  cloudGridSizes: string[];
  shadowGridSizes: string[];
  shadowOnlyCount: number;
  cloudBounds: CloudscapeBounds[];
  shadowBounds: CloudscapeBounds[];
  uniformCloudColor: number;
  uniformShadowColor: number;
  maskComposition: 'max-union-subtract-cloud';
  overlapPreservesColor: boolean;
  smoothMotion: boolean;
  runSeed: number;
  edgeAntiAliased: boolean;
  jaggedStepEdges: boolean;
  largeThickCloudCount: number;
  thinLongCloudCount: number;
  uniqueYBands: number;
  verticalSpread: number;
  pointedEnds: boolean;
  lengthRange: { min: number; max: number };
  thicknessRange: { min: number; max: number };
  cloudPixelSamples: CloudscapeSample[];
  shadowPixelSamples: CloudscapeSample[];
  firstCloud: { x: number; y: number } | null;
}

const ALLOWED_GRID_SIZES = [
  { label: '1x1', w: 1 as const, h: 1 as const },
  { label: '2x1', w: 2 as const, h: 1 as const },
  { label: '3x1', w: 3 as const, h: 1 as const },
  { label: '4x2', w: 4 as const, h: 2 as const },
];

const CLOUD_LAYOUT: Array<{ x: number; y: number; gridW: GridW; gridH: GridH; size: number }> = [
  { x: 0.04, y: 0.07, gridW: 3, gridH: 1, size: 1.06 },
  { x: 0.46, y: 0.22, gridW: 4, gridH: 2, size: 0.98 },
  { x: 0.94, y: 0.04, gridW: 2, gridH: 1, size: 0.94 },
  { x: 0.14, y: 0.39, gridW: 1, gridH: 1, size: 1.03 },
  { x: 0.75, y: 0.50, gridW: 3, gridH: 1, size: 0.9 },
  { x: 1.13, y: 0.65, gridW: 4, gridH: 2, size: 0.9 },
  { x: -0.12, y: 0.78, gridW: 2, gridH: 1, size: 1.05 },
  { x: 0.34, y: 0.96, gridW: 1, gridH: 1, size: 0.88 },
  { x: 0.86, y: 1.13, gridW: 3, gridH: 1, size: 1.0 },
  { x: 0.18, y: 1.31, gridW: 2, gridH: 1, size: 0.9 },
];

const SHADOW_ONLY_LAYOUT: Array<{ x: number; y: number; gridW: GridW; gridH: GridH; size: number }> = [
  { x: 0.28, y: 0.18, gridW: 4, gridH: 2, size: 0.92 },
  { x: 0.62, y: 0.62, gridW: 3, gridH: 1, size: 1.08 },
  { x: 1.04, y: 0.9, gridW: 2, gridH: 1, size: 1.0 },
];

const CLOUD_ALPHA = 0.42;
const SHADOW_ALPHA = 0.34;
const CLOUD_COLOR = 0xf5fbff;
const SHADOW_COLOR = 0x102a45;
const CLOUD_SPEED = 9.5;
const CLOUD_GRID_UNIT_SCALE = 0.12;
const PROJECTED_SHADOW_OFFSET_X = 0.04;
const PROJECTED_SHADOW_OFFSET_Y = 0.14;
const DIRECTION_Y = 0.62;
const CLOUD_SHAPE = 'grid-rounded-rectangles' as const;
const RENDER_MODE = 'shader-field' as const;
const MASK_COMPOSITION = 'max-union-subtract-cloud' as const;

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

function cloudFragment(seeds: CloudSeed[]): string {
  return `
in vec2 vTextureCoord;
in vec2 vUnitCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uScreenSize;
uniform float uTime;

${roundedRectShaderHelpers()}
${fieldFunction('cloudField', seeds)}

void main()
{
    vec4 base = texture(uTexture, vTextureCoord);
    vec2 p = vUnitCoord * uScreenSize;
    float field = cloudField(p);
    float alpha = field * ${CLOUD_ALPHA.toFixed(3)};
    vec3 color = vec3(${colorVec(CLOUD_COLOR)});
    finalColor = vec4(color * alpha, base.a * alpha);
}
`;
}

function shadowFragment(cloudSeeds: CloudSeed[], shadowSeeds: CloudSeed[]): string {
  return `
in vec2 vTextureCoord;
in vec2 vUnitCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uScreenSize;
uniform float uTime;

${roundedRectShaderHelpers()}
${fieldFunction('cloudField', cloudSeeds)}
${fieldFunction('shadowField', shadowSeeds)}

void main()
{
    vec4 base = texture(uTexture, vTextureCoord);
    vec2 p = vUnitCoord * uScreenSize;
    float shadowMask = shadowField(p);
    float cloudMask = cloudField(p);
    float cloudCutout = smoothstep(0.03, 0.22, cloudMask);
    float alpha = shadowMask * (1.0 - cloudCutout) * ${SHADOW_ALPHA.toFixed(3)};
    vec3 color = vec3(${colorVec(SHADOW_COLOR)});
    finalColor = vec4(color * alpha, base.a * alpha);
}
`;
}

export class CloudscapeRenderer {
  private shadowLayer = new Container();
  private cloudLayer = new Container();
  private shadowQuad = new Graphics();
  private cloudQuad = new Graphics();
  private runSeed = Math.floor(Math.random() * 1_000_000_000);
  private cloudSeeds = generateCloudSeeds(this.runSeed);
  private shadowSeeds = generateShadowSeeds(this.runSeed, this.cloudSeeds);
  private time = 0;
  private shadowUniforms = new UniformGroup({
    uScreenSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uTime: { value: 0, type: 'f32' },
  });
  private cloudUniforms = new UniformGroup({
    uScreenSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uTime: { value: 0, type: 'f32' },
  });
  private shadowFilter: Filter;
  private cloudFilter: Filter;

  constructor(private renderer: GameRenderer) {
    this.shadowFilter = new Filter({
      glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: shadowFragment(this.cloudSeeds, this.shadowSeeds), name: 'cloudscape-shadow-field-filter' }),
      resources: { cloudscapeShadowUniforms: this.shadowUniforms },
    });
    this.cloudFilter = new Filter({
      glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: cloudFragment(this.cloudSeeds), name: 'cloudscape-cloud-field-filter' }),
      resources: { cloudscapeCloudUniforms: this.cloudUniforms },
    });

    this.shadowLayer.label = 'CloudscapeShadowShaderLayer';
    this.shadowLayer.eventMode = 'none';
    renderer.getLayer(RenderLayer.CLOUD_SHADOW).addChild(this.shadowLayer);

    this.cloudLayer.label = 'CloudscapeCloudShaderLayer';
    this.cloudLayer.eventMode = 'none';
    renderer.getLayer(RenderLayer.CLOUD_OVERLAY).addChild(this.cloudLayer);

    this.shadowQuad.label = 'CloudscapeShadowShaderQuad';
    this.shadowQuad.eventMode = 'none';
    this.shadowQuad.filters = [this.shadowFilter];
    this.shadowLayer.addChild(this.shadowQuad);

    this.cloudQuad.label = 'CloudscapeCloudShaderQuad';
    this.cloudQuad.eventMode = 'none';
    this.cloudQuad.filters = [this.cloudFilter];
    this.cloudLayer.addChild(this.cloudQuad);

    this.resize();
  }

  resize(): void {
    this.drawQuad(this.shadowQuad);
    this.drawQuad(this.cloudQuad);
    this.updateScreenUniforms();
  }

  update(deltaMS: number): void {
    this.time += deltaMS * 0.001;
    this.shadowUniforms.uniforms.uTime = this.time;
    this.cloudUniforms.uniforms.uTime = this.time;
  }

  setVisible(visible: boolean): void {
    this.shadowLayer.visible = visible;
    this.cloudLayer.visible = visible;
  }

  getSnapshot(): CloudscapeSnapshot {
    const shadowSamples = this.sampleShadowField();
    const cloudSamples = this.sampleCloudField();
    const cloudBounds = this.getCloudBounds(this.cloudSeeds);
    const shadowBounds = this.getCloudBounds(this.shadowSeeds);
    const lengthRange = range(this.cloudSeeds.map(seed => seed.gridW));
    const thicknessRange = range(this.cloudSeeds.map(seed => seed.gridH));
    const yRange = range(this.cloudSeeds.map(seed => seed.y));
    return {
      count: this.cloudSeeds.length,
      direction: { x: -1, y: -DIRECTION_Y },
      shadowsClippedToIsland: false,
      cloudShaderEnabled: this.cloudFilter.enabled,
      shadowShaderEnabled: this.shadowFilter.enabled,
      shaderShadowEnabled: this.shadowFilter.enabled,
      cloudOverlayLayerAboveDragons: RenderLayer.CLOUD_OVERLAY > RenderLayer.DRAGONS && RenderLayer.CLOUD_OVERLAY < RenderLayer.UI,
      cloudShadowLayerAboveDragons: RenderLayer.CLOUD_SHADOW > RenderLayer.DRAGONS && RenderLayer.CLOUD_SHADOW < RenderLayer.CLOUD_OVERLAY,
      cloudAlpha: CLOUD_ALPHA,
      shadowAlpha: SHADOW_ALPHA,
      visibleCloudCount: cloudSamples.filter(sample => sample.alpha > 0.1).length,
      visibleShadowCount: shadowSamples.filter(sample => sample.alpha > 0.08).length,
      cloudOverlaySamples: cloudSamples,
      islandShadowSamples: shadowSamples,
      fallbackGraphicsEnabled: false,
      renderMode: RENDER_MODE,
      cloudShape: CLOUD_SHAPE,
      allowedGridSizes: ALLOWED_GRID_SIZES.map(size => size.label),
      cloudGridSizes: this.cloudSeeds.map(gridLabel),
      shadowGridSizes: this.shadowSeeds.map(gridLabel),
      shadowOnlyCount: this.shadowSeeds.filter(seed => seed.shadowOnly).length,
      cloudBounds,
      shadowBounds,
      uniformCloudColor: CLOUD_COLOR,
      uniformShadowColor: SHADOW_COLOR,
      maskComposition: MASK_COMPOSITION,
      overlapPreservesColor: true,
      smoothMotion: true,
      runSeed: this.runSeed,
      edgeAntiAliased: true,
      jaggedStepEdges: false,
      largeThickCloudCount: this.cloudSeeds.filter(seed => seed.gridW === 4 && seed.gridH === 2).length,
      thinLongCloudCount: this.cloudSeeds.filter(seed => seed.gridW === 3 && seed.gridH === 1).length,
      uniqueYBands: uniqueYBands(this.cloudSeeds),
      verticalSpread: Number((yRange.max - yRange.min).toFixed(3)),
      pointedEnds: false,
      lengthRange,
      thicknessRange,
      cloudPixelSamples: cloudSamples,
      shadowPixelSamples: shadowSamples,
      firstCloud: this.cloudCenter(this.cloudSeeds[0]),
    };
  }

  private drawQuad(quad: Graphics): void {
    quad.clear();
    quad.rect(0, 0, Math.max(2, this.renderer.screenW), Math.max(2, this.renderer.screenH));
    quad.fill({ color: 0xffffff, alpha: 1 });
  }

  private updateScreenUniforms(): void {
    (this.shadowUniforms.uniforms.uScreenSize as Float32Array).set([this.renderer.screenW, this.renderer.screenH]);
    (this.cloudUniforms.uniforms.uScreenSize as Float32Array).set([this.renderer.screenW, this.renderer.screenH]);
  }

  private sampleShadowField(): CloudscapeSample[] {
    return this.shadowSeeds
      .map(seed => this.bestShadowSample(seed))
      .filter(sample => sample.alpha > 0.01)
      .slice(0, 7);
  }

  private sampleCloudField(): CloudscapeSample[] {
    return this.cloudSeeds
      .map(seed => this.bestCloudSample(seed))
      .filter(sample => sample.alpha > 0.01)
      .slice(0, 7);
  }

  private estimateField(x: number, y: number, seeds: CloudSeed[]): number {
    let field = 0;
    for (const seed of seeds) {
      field = Math.max(field, this.estimateRoundedRect(x, y, seed));
    }
    return field;
  }

  private estimateRoundedRect(x: number, y: number, seed: CloudSeed): number {
    const center = this.cloudCenter(seed);
    const baseSize = this.baseSize(seed);
    const halfW = baseSize * seed.gridW * 0.5;
    const halfH = baseSize * seed.gridH * 0.5;
    const radius = Math.min(halfW, halfH) * 0.34;
    const qx = Math.abs(x - center.x) - halfW + radius;
    const qy = Math.abs(y - center.y) - halfH + radius;
    const outside = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2);
    const inside = Math.min(Math.max(qx, qy), 0);
    const dist = outside + inside - radius;
    const feather = Math.max(3.5, Math.min(halfW, halfH) * 0.1);
    return 1 - smoothstep(-feather, feather, dist);
  }

  private bestCloudSample(seed: CloudSeed): CloudscapeSample {
    const center = this.cloudCenter(seed);
    const baseSize = this.baseSize(seed);
    const halfW = baseSize * seed.gridW * 0.5;
    const halfH = baseSize * seed.gridH * 0.5;
    let best = { x: center.x, y: center.y, alpha: 0 };
    for (let ix = -2; ix <= 2; ix++) {
      for (let iy = -2; iy <= 2; iy++) {
        const x = center.x + ix * halfW * 0.18;
        const y = center.y + iy * halfH * 0.22;
        if (x < 6 || y < 6 || x > this.renderer.screenW - 6 || y > this.renderer.screenH - 6) continue;
        const alpha = CLOUD_ALPHA * this.estimateField(x, y, this.cloudSeeds);
        if (alpha > best.alpha) best = { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), alpha: Number(alpha.toFixed(3)) };
      }
    }
    return best;
  }

  private bestShadowSample(seed: CloudSeed): CloudscapeSample {
    const center = this.cloudCenter(seed);
    const baseSize = this.baseSize(seed);
    const halfW = baseSize * seed.gridW * 0.5;
    const halfH = baseSize * seed.gridH * 0.5;
    let best = { x: center.x, y: center.y, alpha: 0 };
    for (let ix = -2; ix <= 2; ix++) {
      for (let iy = -2; iy <= 2; iy++) {
        const x = center.x + ix * halfW * 0.18;
        const y = center.y + iy * halfH * 0.22;
        if (x < 6 || y < 6 || x > this.renderer.screenW - 6 || y > this.renderer.screenH - 6) continue;
        const shadowField = this.estimateField(x, y, this.shadowSeeds);
        const cloudField = this.estimateField(x, y, this.cloudSeeds);
        const alpha = SHADOW_ALPHA * shadowField * (1 - smoothstep(0.03, 0.22, cloudField));
        if (alpha > best.alpha) best = { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), alpha: Number(alpha.toFixed(3)) };
      }
    }
    return best;
  }

  private getCloudBounds(seeds: CloudSeed[]): CloudscapeBounds[] {
    return seeds.map(seed => {
      const center = this.cloudCenter(seed);
      return cloudBoundsForSeed(seed, this.baseSize(seed), center);
    });
  }

  private cloudCenter(seed: CloudSeed): { x: number; y: number } {
    const baseSize = this.baseSize(seed);
    const marginX = baseSize * seed.gridW * 1.8;
    const marginY = baseSize * seed.gridH * 2.2;
    const spanX = this.renderer.screenW + marginX * 2;
    const spanY = this.renderer.screenH + marginY * 2;
    const x = positiveModulo(seed.x * this.renderer.screenW - this.time * CLOUD_SPEED + marginX, spanX) - marginX;
    const y = positiveModulo(seed.y * this.renderer.screenH - this.time * CLOUD_SPEED * DIRECTION_Y + marginY, spanY) - marginY;
    return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
  }

  private baseSize(seed: CloudSeed): number {
    return Math.min(this.renderer.screenW || 1280, this.renderer.screenH || 720) * CLOUD_GRID_UNIT_SCALE * seed.size;
  }
}

function roundedRectShaderHelpers(): string {
  return `
float positiveModulo(float value, float modValue)
{
    return mod(mod(value, modValue) + modValue, modValue);
}

vec2 roundedRectCenter(vec2 seed, float size, float gridW, float gridH)
{
    float baseSize = min(uScreenSize.x, uScreenSize.y) * ${CLOUD_GRID_UNIT_SCALE.toFixed(3)} * size;
    float marginX = baseSize * gridW * 1.8;
    float marginY = baseSize * gridH * 2.2;
    float spanX = uScreenSize.x + marginX * 2.0;
    float spanY = uScreenSize.y + marginY * 2.0;
    float x = positiveModulo(seed.x * uScreenSize.x - uTime * ${CLOUD_SPEED.toFixed(3)} + marginX, spanX) - marginX;
    float y = positiveModulo(seed.y * uScreenSize.y - uTime * ${CLOUD_SPEED.toFixed(3)} * ${DIRECTION_Y.toFixed(3)} + marginY, spanY) - marginY;
    return vec2(x, y);
}

float roundedRectMask(vec2 p, vec2 seed, float size, float gridW, float gridH)
{
    float baseSize = min(uScreenSize.x, uScreenSize.y) * ${CLOUD_GRID_UNIT_SCALE.toFixed(3)} * size;
    vec2 center = roundedRectCenter(seed, size, gridW, gridH);
    vec2 halfSize = vec2(baseSize * gridW * 0.5, baseSize * gridH * 0.5);
    float radius = min(halfSize.x, halfSize.y) * 0.34;
    vec2 q = abs(p - center) - halfSize + vec2(radius);
    float dist = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
    float feather = max(3.5, min(halfSize.x, halfSize.y) * 0.10);
    return 1.0 - smoothstep(-feather, feather, dist);
}
`;
}

function fieldFunction(name: string, seeds: CloudSeed[]): string {
  const calls = seeds.map(seed => (
    `    field = max(field, roundedRectMask(p, vec2(${seed.x.toFixed(3)}, ${seed.y.toFixed(3)}), ${seed.size.toFixed(3)}, ${seed.gridW.toFixed(1)}, ${seed.gridH.toFixed(1)}));`
  )).join('\n');
  return `
float ${name}(vec2 p)
{
    float field = 0.0;
${calls}
    return clamp(field, 0.0, 1.0);
}
`;
}

function cloudBoundsForSeed(seed: CloudSeed, baseSize: number, center: { x: number; y: number }): CloudscapeBounds {
  const halfW = baseSize * seed.gridW * 0.5;
  const halfH = baseSize * seed.gridH * 0.5;
  const feather = Math.max(3.5, Math.min(halfW, halfH) * 0.1);
  return {
    x: Number((center.x - halfW - feather).toFixed(3)),
    y: Number((center.y - halfH - feather).toFixed(3)),
    width: Number(((halfW + feather) * 2).toFixed(3)),
    height: Number(((halfH + feather) * 2).toFixed(3)),
  };
}

function generateCloudSeeds(runSeed: number): CloudSeed[] {
  const random = seededRandom(runSeed);
  return CLOUD_LAYOUT.map((layout, index) => {
    const yJitter = (random() - 0.5) * 0.08;
    const xJitter = (random() - 0.5) * 0.08;
    const sizeJitter = 0.9 + random() * 0.22;
    return {
      x: Number((layout.x + xJitter).toFixed(3)),
      y: Number((layout.y + yJitter).toFixed(3)),
      size: Number((layout.size * sizeJitter).toFixed(3)),
      gridW: layout.gridW,
      gridH: layout.gridH,
      variant: Number((random() * 9 + index * 0.731).toFixed(3)),
    };
  });
}

function generateShadowSeeds(runSeed: number, cloudSeeds: CloudSeed[]): CloudSeed[] {
  const random = seededRandom(runSeed ^ 0x9e3779b9);
  const projectedCloudSeeds = cloudSeeds.map((seed, index) => ({
    ...seed,
    x: Number((seed.x + PROJECTED_SHADOW_OFFSET_X + (random() - 0.5) * 0.025).toFixed(3)),
    y: Number((seed.y + PROJECTED_SHADOW_OFFSET_Y + (random() - 0.5) * 0.025).toFixed(3)),
    variant: Number((seed.variant + index * 0.19 + 2.7).toFixed(3)),
  }));
  const shadowOnlySeeds = SHADOW_ONLY_LAYOUT.map((layout, index) => ({
    x: Number((layout.x + (random() - 0.5) * 0.06).toFixed(3)),
    y: Number((layout.y + (random() - 0.5) * 0.06).toFixed(3)),
    size: Number((layout.size * (0.92 + random() * 0.18)).toFixed(3)),
    gridW: layout.gridW,
    gridH: layout.gridH,
    variant: Number((random() * 9 + index * 0.911 + 11).toFixed(3)),
    shadowOnly: true,
  }));
  return [...projectedCloudSeeds, ...shadowOnlySeeds];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uniqueYBands(seeds: CloudSeed[]): number {
  return new Set(seeds.map(seed => Math.floor(seed.y * 8))).size;
}

function gridLabel(seed: CloudSeed): string {
  return `${seed.gridW}x${seed.gridH}`;
}

function colorVec(color: number): string {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  return `${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)}`;
}

function positiveModulo(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

function range(values: number[]): { min: number; max: number } {
  return {
    min: Number(Math.min(...values).toFixed(3)),
    max: Number(Math.max(...values).toFixed(3)),
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
