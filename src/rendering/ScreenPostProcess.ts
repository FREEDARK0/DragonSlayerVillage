import { Filter, GlProgram, Rectangle, UniformGroup } from 'pixi.js';
import { GameRenderer } from './GameRenderer';

const MAX_BANDS = 8;
const POSTPROCESS_CONFIG_URL = import.meta.env.MODE === 'production'
  ? new URL('../config/postprocessConfig.json', import.meta.url).href
  : '/__debug/postprocess-config';

export interface WarmTintConfig {
  enabled: boolean;
  strength: number;
  color: string;
}

export interface PosterizePaletteConfig {
  enabled: boolean;
  bandCount: number;
  colors: string[];
}

export interface SoftGlowConfig {
  enabled: boolean;
  strength: number;
  threshold: number;
  radius: number;
}

export interface PostProcessConfig {
  warmTint: WarmTintConfig;
  posterizePalette: PosterizePaletteConfig;
  softGlow: SoftGlowConfig;
}

export interface PostProcessSnapshot extends PostProcessConfig {
  filterEnabled: boolean;
}

export type WarmTintSnapshot = PostProcessSnapshot['warmTint'];

const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

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
}
`;

const POSTPROCESS_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec3 uWarmTint;
uniform float uWarmEnabled;
uniform float uWarmStrength;
uniform float uPosterizeEnabled;
uniform float uBandCount;
uniform vec3 uBand0;
uniform vec3 uBand1;
uniform vec3 uBand2;
uniform vec3 uBand3;
uniform vec3 uBand4;
uniform vec3 uBand5;
uniform vec3 uBand6;
uniform vec3 uBand7;
uniform float uGlowEnabled;
uniform float uGlowStrength;
uniform float uGlowThreshold;
uniform float uGlowRadius;

float luminance(vec3 color)
{
    return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 bandColor(float index)
{
    if (index < 0.5) return uBand0;
    if (index < 1.5) return uBand1;
    if (index < 2.5) return uBand2;
    if (index < 3.5) return uBand3;
    if (index < 4.5) return uBand4;
    if (index < 5.5) return uBand5;
    if (index < 6.5) return uBand6;
    return uBand7;
}

vec3 brightSample(vec2 uv, vec2 offset)
{
    vec3 color = texture(uTexture, uv + offset).rgb;
    float bright = smoothstep(uGlowThreshold, 1.0, luminance(color));
    return color * bright;
}

void main()
{
    vec4 source = texture(uTexture, vTextureCoord);
    vec3 color = source.rgb;

    if (uWarmEnabled > 0.5) {
        vec3 warmed = mix(color, color * uWarmTint, uWarmStrength);
        warmed = mix(warmed, warmed + uWarmTint * 0.045, uWarmStrength * 0.55);
        color = warmed;
    }

    if (uPosterizeEnabled > 0.5) {
        float bands = min(max(uBandCount, 2.0), ${MAX_BANDS.toFixed(1)});
        float lum = min(max(luminance(color), 0.0), 0.9999);
        float index = min(max(floor(lum * bands), 0.0), ${(MAX_BANDS - 1).toFixed(1)});
        color = bandColor(index);
    }

    if (uGlowEnabled > 0.5 && uGlowStrength > 0.0) {
        vec2 r = uTexelSize * max(1.0, uGlowRadius);
        vec3 glow = vec3(0.0);
        glow += brightSample(vTextureCoord, vec2( r.x, 0.0));
        glow += brightSample(vTextureCoord, vec2(-r.x, 0.0));
        glow += brightSample(vTextureCoord, vec2(0.0,  r.y));
        glow += brightSample(vTextureCoord, vec2(0.0, -r.y));
        glow += brightSample(vTextureCoord, vec2( r.x,  r.y));
        glow += brightSample(vTextureCoord, vec2(-r.x,  r.y));
        glow += brightSample(vTextureCoord, vec2( r.x, -r.y));
        glow += brightSample(vTextureCoord, vec2(-r.x, -r.y));
        color = min(vec3(1.0), color + glow * 0.125 * uGlowStrength);
    }

    finalColor = vec4(color, source.a);
}
`;

const FALLBACK_CONFIG: PostProcessConfig = normalizeConfig({
  warmTint: { enabled: true, strength: 0.1, color: '#fff0b8' },
  posterizePalette: {
    enabled: false,
    bandCount: 4,
    colors: ['#24304a', '#5c5261', '#8c7f63', '#f4e6b0', '#fff7d6', '#cde5d6', '#8ab7c9', '#3f5f7a'],
  },
  softGlow: { enabled: true, strength: 0.12, threshold: 0.74, radius: 2 },
});

export class ScreenPostProcess {
  private config: PostProcessConfig = cloneConfig(FALLBACK_CONFIG);
  private uniforms = new UniformGroup({
    uTexelSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uWarmTint: { value: new Float32Array([1, 240 / 255, 184 / 255]), type: 'vec3<f32>' },
    uWarmEnabled: { value: 1, type: 'f32' },
    uWarmStrength: { value: 0.1, type: 'f32' },
    uPosterizeEnabled: { value: 0, type: 'f32' },
    uBandCount: { value: 4, type: 'f32' },
    uBand0: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBand1: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBand2: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBand3: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBand4: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBand5: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBand6: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBand7: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uGlowEnabled: { value: 1, type: 'f32' },
    uGlowStrength: { value: 0.12, type: 'f32' },
    uGlowThreshold: { value: 0.74, type: 'f32' },
    uGlowRadius: { value: 2, type: 'f32' },
  });
  private filter = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: POSTPROCESS_FRAGMENT, name: 'screen-postprocess-filter' }),
    resources: { postProcessUniforms: this.uniforms },
  });
  private area = new Rectangle();

  constructor(private renderer: GameRenderer) {
    this.filter.enabled = true;
    this.renderer.getPostProcessTarget().filters = [this.filter];
    this.applyConfigToUniforms();
    this.resize();
  }

  resize(): void {
    this.area.x = 0;
    this.area.y = 0;
    this.area.width = this.renderer.screenW;
    this.area.height = this.renderer.screenH;
    (this.uniforms.uniforms.uTexelSize as Float32Array).set([
      1 / Math.max(1, this.renderer.screenW),
      1 / Math.max(1, this.renderer.screenH),
    ]);
    this.renderer.app.stage.filterArea = this.area;
  }

  getConfig(): PostProcessConfig {
    return cloneConfig(this.config);
  }

  getDefaultConfig(): PostProcessConfig {
    return cloneConfig(FALLBACK_CONFIG);
  }

  async loadConfig(): Promise<PostProcessConfig> {
    try {
      const response = await fetch(`${POSTPROCESS_CONFIG_URL}?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const config = await response.json() as PostProcessConfig;
      return this.setConfig(config);
    } catch {
      return this.setConfig(FALLBACK_CONFIG);
    }
  }

  setConfig(partial: Partial<PostProcessConfig>): PostProcessConfig {
    this.config = normalizeConfig({ ...this.config, ...partial });
    this.applyConfigToUniforms();
    return this.getConfig();
  }

  getSnapshot(): PostProcessSnapshot {
    return {
      ...this.getConfig(),
      filterEnabled: this.filter.enabled,
    };
  }

  private applyConfigToUniforms(): void {
    const warm = hexToRgb(this.config.warmTint.color);
    (this.uniforms.uniforms.uWarmTint as Float32Array).set(warm);
    this.uniforms.uniforms.uWarmEnabled = this.config.warmTint.enabled ? 1 : 0;
    this.uniforms.uniforms.uWarmStrength = this.config.warmTint.strength;
    this.uniforms.uniforms.uPosterizeEnabled = this.config.posterizePalette.enabled ? 1 : 0;
    this.uniforms.uniforms.uBandCount = this.config.posterizePalette.bandCount;
    for (let index = 0; index < MAX_BANDS; index++) {
      const color = hexToRgb(this.config.posterizePalette.colors[index] ?? '#ffffff');
      const uniformName = `uBand${index}` as `uBand${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;
      (this.uniforms.uniforms[uniformName] as Float32Array).set(color);
    }
    this.uniforms.uniforms.uGlowEnabled = this.config.softGlow.enabled ? 1 : 0;
    this.uniforms.uniforms.uGlowStrength = this.config.softGlow.strength;
    this.uniforms.uniforms.uGlowThreshold = this.config.softGlow.threshold;
    this.uniforms.uniforms.uGlowRadius = this.config.softGlow.radius;
  }
}

export function normalizeConfig(config: PostProcessConfig): PostProcessConfig {
  const colors = [...(config.posterizePalette?.colors ?? [])].map(normalizeHexColor);
  while (colors.length < MAX_BANDS) colors.push('#ffffff');
  return {
    warmTint: {
      enabled: Boolean(config.warmTint?.enabled),
      strength: clampNumber(config.warmTint?.strength ?? 0.1, 0, 1),
      color: normalizeHexColor(config.warmTint?.color ?? '#fff0b8'),
    },
    posterizePalette: {
      enabled: Boolean(config.posterizePalette?.enabled),
      bandCount: Math.round(clampNumber(config.posterizePalette?.bandCount ?? 4, 2, MAX_BANDS)),
      colors: colors.slice(0, MAX_BANDS),
    },
    softGlow: {
      enabled: Boolean(config.softGlow?.enabled),
      strength: clampNumber(config.softGlow?.strength ?? 0.12, 0, 1),
      threshold: clampNumber(config.softGlow?.threshold ?? 0.74, 0, 1),
      radius: clampNumber(config.softGlow?.radius ?? 2, 1, 8),
    },
  };
}

function cloneConfig(config: PostProcessConfig): PostProcessConfig {
  return {
    warmTint: { ...config.warmTint },
    posterizePalette: { ...config.posterizePalette, colors: [...config.posterizePalette.colors] },
    softGlow: { ...config.softGlow },
  };
}

function normalizeHexColor(value: string): string {
  if (typeof value !== 'string') return '#ffffff';
  const trimmed = value.trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  return match ? `#${match[1].toLowerCase()}` : '#ffffff';
}

function hexToRgb(value: string): [number, number, number] {
  const hex = normalizeHexColor(value).slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
