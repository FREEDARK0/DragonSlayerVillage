import { Container, FederatedPointerEvent, Filter, GlProgram, Graphics, Rectangle, Text, UniformGroup } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';

export type TutorialId = 'goal' | 'shop' | 'progress' | 'dayNight';

export interface RectLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface TutorialPanelRect extends RectLayout {
  horizontal: boolean;
  buttonWidth: number;
}

export interface TutorialHighlight {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  shape: 'circle' | 'rect';
}

export interface TutorialTarget {
  highlights: TutorialHighlight[];
  text: string;
  textX: number;
  textY: number;
  textAnchor: 'top' | 'bottom' | 'center';
}

export interface TutorialPanelState {
  activeId: TutorialId | null;
  targets: Partial<Record<TutorialId, TutorialTarget>>;
}

export interface TutorialPanelSnapshot {
  activeId: TutorialId | null;
  dimVisible: boolean;
  text: string;
  highlights: TutorialHighlight[];
  layout: {
    panel: RectLayout;
    buttons: Array<RectLayout & { id: TutorialId; label: string; active: boolean }>;
    textPanel: RectLayout;
  };
}

const TUTORIALS: Array<{ id: TutorialId; label: string }> = [
  { id: 'goal', label: '游戏目标' },
  { id: 'shop', label: '商店' },
  { id: 'progress', label: '进度' },
  { id: 'dayNight', label: '黑夜/白天' },
];

const PANEL_WIDTH = 132;
const PANEL_MARGIN = 8;
const BUTTON_HEIGHT = 34;
const BUTTON_GAP = 8;
const DIM_ALPHA = 0.66;
const FALLBACK_DIM_ALPHA = 0.64;
const MAX_HIGHLIGHTS = 4;

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

const SPOTLIGHT_FRAGMENT = `
in vec2 vTextureCoord;
in vec2 vUnitCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uScreenSize;
uniform vec4 uHighlight0;
uniform vec4 uHighlight1;
uniform vec4 uHighlight2;
uniform vec4 uHighlight3;
uniform vec4 uHighlightMeta;
uniform float uHighlightCount;
uniform float uDimAlpha;

float rectSpotlight(vec2 p, vec4 rect, float radius)
{
    vec2 center = rect.xy + rect.zw * 0.5;
    vec2 halfSize = max(rect.zw * 0.5 - vec2(radius), vec2(0.0));
    vec2 q = abs(p - center) - halfSize;
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    return 1.0 - smoothstep(-10.0, 22.0, dist);
}

float circleSpotlight(vec2 p, vec4 rect)
{
    vec2 center = rect.xy + rect.zw * 0.5;
    float radius = max(rect.z, rect.w) * 0.5;
    float dist = distance(p, center) - radius;
    return 1.0 - smoothstep(-10.0, 26.0, dist);
}

float spotlightAt(int index, vec2 p)
{
    vec4 rect = uHighlight0;
    if (index == 1) rect = uHighlight1;
    if (index == 2) rect = uHighlight2;
    if (index == 3) rect = uHighlight3;
    float meta = uHighlightMeta[index];
    float shape = floor(meta + 0.5);
    float radius = (meta - shape) * 1000.0;
    if (shape > 0.5) return circleSpotlight(p, rect);
    return rectSpotlight(p, rect, radius);
}

void main()
{
    vec4 base = texture(uTexture, vTextureCoord);
    vec2 p = vUnitCoord * uScreenSize;
    float spotlight = 0.0;
    for (int i = 0; i < 4; i++)
    {
        if (float(i) >= uHighlightCount) break;
        spotlight = max(spotlight, spotlightAt(i, p));
    }
    float alpha = uDimAlpha * (1.0 - spotlight);
    finalColor = vec4(0.02, 0.035, 0.05, base.a * alpha);
}
`;

export class TutorialPanel {
  private dimContainer: Container;
  private uiContainer: Container;
  private fallbackDim: Graphics;
  private dimQuad: Graphics;
  private highlightGlow: Graphics;
  private uniforms = new UniformGroup({
    uScreenSize: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    uHighlight0: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
    uHighlight1: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
    uHighlight2: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
    uHighlight3: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
    uHighlightMeta: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
    uHighlightCount: { value: 0, type: 'f32' },
    uDimAlpha: { value: DIM_ALPHA, type: 'f32' },
  });
  private filter = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: SPOTLIGHT_FRAGMENT, name: 'tutorial-spotlight-filter' }),
    resources: { tutorialUniforms: this.uniforms },
  });
  private lastSnapshot: TutorialPanelSnapshot = emptySnapshot();

  onTutorialClicked: ((id: TutorialId, event?: { pointerId?: number; type?: string }) => void) | null = null;
  onBackdropClicked: ((event?: { pointerId?: number; type?: string }) => void) | null = null;
  onUiPointerActivity: ((event?: { pointerId?: number; type?: string }) => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.dimContainer = new Container();
    this.dimContainer.label = 'TutorialDim';
    this.dimContainer.eventMode = 'none';
    renderer.getLayer(RenderLayer.TUTORIAL_DIM).addChild(this.dimContainer);

    this.fallbackDim = new Graphics();
    this.fallbackDim.label = 'TutorialFallbackDim';
    this.fallbackDim.eventMode = 'none';
    this.dimContainer.addChild(this.fallbackDim);

    this.dimQuad = new Graphics();
    this.dimQuad.label = 'TutorialSpotlightQuad';
    this.dimQuad.filters = [this.filter];
    this.dimQuad.on('pointerdown', (event) => this.handleBackdropPointerDown(event));
    this.dimContainer.addChild(this.dimQuad);

    this.highlightGlow = new Graphics();
    this.highlightGlow.label = 'TutorialHighlightGlow';
    this.highlightGlow.eventMode = 'none';
    this.dimContainer.addChild(this.highlightGlow);

    this.uiContainer = new Container();
    this.uiContainer.label = 'TutorialPanel';
    this.uiContainer.eventMode = 'static';
    renderer.getLayer(RenderLayer.TUTORIAL_UI).addChild(this.uiContainer);
  }

  draw(state: TutorialPanelState): void {
    this.uiContainer.removeChildren();
    this.fallbackDim.clear();
    this.dimQuad.clear();
    this.highlightGlow.clear();

    const panel = this.panelLayout();
    this.uiContainer.hitArea = new Rectangle(panel.x, panel.y, panel.width, panel.height);

    const buttons: TutorialPanelSnapshot['layout']['buttons'] = [];
    TUTORIALS.forEach((item, index) => {
      const layout = panel.horizontal
        ? rect(panel.x + index * (panel.buttonWidth + BUTTON_GAP), panel.y, panel.buttonWidth, BUTTON_HEIGHT)
        : rect(panel.x, panel.y + index * (BUTTON_HEIGHT + BUTTON_GAP), panel.width, BUTTON_HEIGHT);
      buttons.push({ ...layout, id: item.id, label: item.label, active: state.activeId === item.id });
      this.drawButton(layout, item.id, item.label, state.activeId === item.id);
    });

    const target = state.activeId ? state.targets[state.activeId] : null;
    const highlights = target?.highlights.slice(0, MAX_HIGHLIGHTS) ?? [];
    let textPanel = emptyRect();
    if (target) {
      this.drawDim(highlights);
      textPanel = this.drawTutorialText(target);
    } else {
      this.dimContainer.visible = false;
      this.uniforms.uniforms.uHighlightCount = 0;
    }

    this.lastSnapshot = {
      activeId: state.activeId,
      dimVisible: Boolean(target),
      text: target?.text ?? '',
      highlights: highlights.map(highlight => ({ ...highlight })),
      layout: { panel, buttons, textPanel },
    };
  }

  getLayoutSnapshot(): TutorialPanelSnapshot {
    return {
      activeId: this.lastSnapshot.activeId,
      dimVisible: this.lastSnapshot.dimVisible,
      text: this.lastSnapshot.text,
      highlights: this.lastSnapshot.highlights.map(highlight => ({ ...highlight })),
      layout: {
        panel: { ...this.lastSnapshot.layout.panel },
        buttons: this.lastSnapshot.layout.buttons.map(button => ({ ...button })),
        textPanel: { ...this.lastSnapshot.layout.textPanel },
      },
    };
  }

  private drawDim(highlights: TutorialHighlight[]): void {
    this.dimContainer.visible = true;
    this.dimContainer.eventMode = 'static';
    this.drawFallbackDim(highlights);
    this.dimQuad.rect(0, 0, this.renderer.screenW, this.renderer.screenH);
    this.dimQuad.fill({ color: 0xffffff, alpha: 1 });
    this.dimQuad.eventMode = 'static';
    this.dimQuad.hitArea = new Rectangle(0, 0, this.renderer.screenW, this.renderer.screenH);
    this.drawHighlightGlow(highlights);

    (this.uniforms.uniforms.uScreenSize as Float32Array).set([this.renderer.screenW, this.renderer.screenH]);
    this.uniforms.uniforms.uHighlightCount = Math.min(highlights.length, MAX_HIGHLIGHTS);
    const meta = this.uniforms.uniforms.uHighlightMeta as Float32Array;
    meta.fill(0);
    const uniforms = this.uniforms.uniforms as Record<string, Float32Array | number>;
    for (let index = 0; index < MAX_HIGHLIGHTS; index++) {
      const uniform = uniforms[`uHighlight${index}`] as Float32Array;
      const highlight = highlights[index];
      if (!highlight) {
        uniform.set([0, 0, 0, 0]);
        continue;
      }
      uniform.set([highlight.x, highlight.y, highlight.width, highlight.height]);
      meta[index] = (highlight.shape === 'circle' ? 1 : 0) + clamp(highlight.radius, 0, 999) / 1000;
    }
  }

  private drawFallbackDim(highlights: TutorialHighlight[]): void {
    this.fallbackDim.rect(0, 0, this.renderer.screenW, this.renderer.screenH);
    this.fallbackDim.fill({ color: 0x02060a, alpha: FALLBACK_DIM_ALPHA });
    for (const highlight of highlights) {
      if (highlight.shape === 'circle') {
        const radius = Math.max(highlight.width, highlight.height) / 2;
        this.fallbackDim.circle(highlight.x + highlight.width / 2, highlight.y + highlight.height / 2, radius);
        this.fallbackDim.cut();
      } else {
        this.fallbackDim.roundRect(highlight.x, highlight.y, highlight.width, highlight.height, highlight.radius);
        this.fallbackDim.cut();
      }
    }
  }

  private drawHighlightGlow(highlights: TutorialHighlight[]): void {
    for (const highlight of highlights) {
      if (highlight.shape === 'circle') {
        const radius = Math.max(highlight.width, highlight.height) / 2;
        const x = highlight.x + highlight.width / 2;
        const y = highlight.y + highlight.height / 2;
        this.highlightGlow.circle(x, y, radius + 7);
        this.highlightGlow.stroke({ width: 6, color: 0xfff0a6, alpha: 0.18 });
        this.highlightGlow.circle(x, y, radius + 2);
        this.highlightGlow.stroke({ width: 3, color: 0xffe476, alpha: 0.9 });
      } else {
        this.highlightGlow.roundRect(highlight.x - 6, highlight.y - 6, highlight.width + 12, highlight.height + 12, highlight.radius + 6);
        this.highlightGlow.stroke({ width: 6, color: 0xfff0a6, alpha: 0.16 });
        this.highlightGlow.roundRect(highlight.x, highlight.y, highlight.width, highlight.height, highlight.radius);
        this.highlightGlow.stroke({ width: 3, color: 0xffe476, alpha: 0.9 });
      }
    }
  }

  private drawButton(layout: RectLayout, id: TutorialId, label: string, active: boolean): void {
    const button = new Graphics();
    button.roundRect(layout.x, layout.y, layout.width, layout.height, 7);
    button.fill({ color: active ? 0xffe476 : 0xf7d35a, alpha: 0.98 });
    button.stroke({ width: active ? 2.2 : 1.4, color: active ? 0xfff0a6 : 0x5a3514, alpha: active ? 0.96 : 0.7 });
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointerdown', (event) => {
      event.stopPropagation();
      this.onUiPointerActivity?.(event);
      this.onTutorialClicked?.(id, event);
    });
    this.uiContainer.addChild(button);

    const text = new Text({
      text: label,
      style: { fontFamily: 'Arial', fontSize: Math.min(14, Math.max(11, layout.width * 0.15)), fill: 0x3a2412, fontWeight: 'bold' },
    });
    text.anchor.set(0.5);
    text.position.set(layout.centerX, layout.centerY);
    text.eventMode = 'none';
    this.uiContainer.addChild(text);
  }

  private drawTutorialText(target: TutorialTarget): RectLayout {
    const width = Math.min(430, Math.max(260, this.renderer.screenW * 0.36));
    const text = new Text({
      text: target.text,
      style: {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xfff0a6,
        fontWeight: 'bold',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: width - 30,
        breakWords: true,
        lineHeight: 31,
        stroke: { color: 0x081018, width: 6 },
      },
    });
    const height = Math.max(54, Math.ceil(text.height) + 22);
    const x = clamp(target.textX - width / 2, 12, this.renderer.screenW - width - 12);
    const rawY = target.textAnchor === 'bottom'
      ? target.textY - height
      : target.textAnchor === 'center'
        ? target.textY - height / 2
        : target.textY;
    const y = clamp(rawY, 12, this.renderer.screenH - height - 12);

    const bg = new Graphics();
    bg.roundRect(x, y, width, height, 8);
    bg.fill({ color: 0x10202a, alpha: 0.64 });
    bg.stroke({ width: 2, color: 0xffe476, alpha: 0.92 });
    bg.eventMode = 'none';
    this.uiContainer.addChild(bg);

    text.anchor.set(0.5);
    text.position.set(x + width / 2, y + height / 2);
    text.eventMode = 'none';
    this.uiContainer.addChild(text);
    return rect(x, y, width, height);
  }

  private panelLayout(): TutorialPanelRect {
    if (this.renderer.layoutProfile === 'mobilePortrait') {
      const width = Math.min(this.renderer.screenW - 24, TUTORIALS.length * 86 + (TUTORIALS.length - 1) * 8);
      const buttonWidth = (width - (TUTORIALS.length - 1) * 8) / TUTORIALS.length;
      const height = BUTTON_HEIGHT;
      const x = this.renderer.screenW / 2 - width / 2;
      const y = 94;
      return { ...rect(x, y, width, height), horizontal: true, buttonWidth };
    }
    const width = PANEL_WIDTH;
    const height = TUTORIALS.length * BUTTON_HEIGHT + (TUTORIALS.length - 1) * BUTTON_GAP;
    const x = Math.max(0, this.renderer.screenW - width - PANEL_MARGIN);
    const y = Math.max(8, this.renderer.screenH / 2 - height / 2);
    return { ...rect(x, y, width, height), horizontal: false, buttonWidth: width };
  }

  private handleBackdropPointerDown(event: FederatedPointerEvent): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.onUiPointerActivity?.(event);
    this.onBackdropClicked?.(event);
  }
}

function rect(x: number, y: number, width: number, height: number): RectLayout {
  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

function emptyRect(): RectLayout {
  return rect(0, 0, 0, 0);
}

function emptySnapshot(): TutorialPanelSnapshot {
  return {
    activeId: null,
    dimVisible: false,
    text: '',
    highlights: [],
    layout: { panel: emptyRect(), buttons: [], textPanel: emptyRect() },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
