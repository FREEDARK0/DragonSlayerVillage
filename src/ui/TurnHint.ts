import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import type { HoldConfirmProgress } from '../input/InputManager';

export interface HoldEndTurnProgressSnapshot {
  visible: boolean;
  progress: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class TurnHint {
  private container: Container;
  private endTurnLabel: Text;
  private rotateLabel: Text;
  private holdContainer: Container;
  private holdBg: Graphics;
  private holdFill: Graphics;
  private holdLabel: Text;
  private holdSnapshot: HoldEndTurnProgressSnapshot = emptyHoldSnapshot();
  private pulseTime = 0;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'TurnHint';
    this.container.eventMode = 'none';
    renderer.getLayer(RenderLayer.UI).addChild(this.container);

    this.rotateLabel = this.createLabel('按住鼠标右键以旋转岛屿', 0xd8fbff);
    this.container.addChild(this.rotateLabel);

    this.endTurnLabel = this.createLabel('按住鼠标左键以结束回合', 0xf2fbff);
    this.container.addChild(this.endTurnLabel);

    this.holdContainer = new Container();
    this.holdContainer.label = 'HoldEndTurnProgress';
    this.holdContainer.visible = false;
    this.holdContainer.eventMode = 'none';
    this.holdBg = new Graphics();
    this.holdFill = new Graphics();
    this.holdLabel = new Text({
      text: '结束回合',
      style: {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xffffff,
        fontWeight: 'bold',
        stroke: { color: 0x10202a, width: 4 },
      },
    });
    this.holdLabel.anchor.set(0.5);
    this.holdLabel.eventMode = 'none';
    this.holdContainer.addChild(this.holdBg, this.holdFill, this.holdLabel);
    renderer.getLayer(RenderLayer.OVERLAY).addChild(this.holdContainer);
    this.renderer.app.ticker.add(this.updatePulse, this);
  }

  private createLabel(text: string, fill: number): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: 'Arial',
        fontSize: 15,
        fill,
        fontWeight: 'bold',
        stroke: { color: 0x10202a, width: 4 },
      },
    });
    label.anchor.set(1, 1);
    label.eventMode = 'none';
    return label;
  }

  draw(endTurnVisible: boolean): void {
    this.container.visible = true;
    this.container.alpha = 0.92;
    this.endTurnLabel.visible = endTurnVisible;
    if (this.renderer.layoutProfile === 'mobilePortrait') {
      this.endTurnLabel.text = '长按结束';
      this.rotateLabel.text = '拖动转盘或按钮旋转';
    } else {
      this.endTurnLabel.text = '按住鼠标左键以结束回合';
      this.rotateLabel.text = '按住鼠标右键以旋转岛屿';
    }
    const marginX = 18;
    const marginY = this.renderer.layoutProfile === 'mobilePortrait' ? 74 : 18;
    const bottomY = this.renderer.screenH - marginY;
    this.endTurnLabel.position.set(this.renderer.screenW - marginX, bottomY);
    this.rotateLabel.position.set(this.renderer.screenW - marginX, endTurnVisible ? bottomY - 24 : bottomY);
  }

  isVisible(): boolean {
    return this.container.visible && this.endTurnLabel.visible;
  }

  isRotateHintVisible(): boolean {
    return this.container.visible && this.rotateLabel.visible;
  }

  getRotateHintText(): string {
    return this.rotateLabel.text;
  }

  getEndTurnHintText(): string {
    return this.endTurnLabel.text;
  }

  getRotateHintScale(): number {
    return this.rotateLabel.scale.x;
  }

  drawHoldProgress(progress: HoldConfirmProgress): void {
    if (!progress.visible) {
      this.holdContainer.visible = false;
      this.holdSnapshot = emptyHoldSnapshot();
      return;
    }

    const width = 132;
    const height = 28;
    const gap = 16;
    const x = clamp(progress.x + gap, 8, this.renderer.screenW - width - 8);
    const y = clamp(progress.y + gap, 8, this.renderer.screenH - height - 8);
    const ratio = clamp(progress.progress, 0, 1);

    this.holdContainer.visible = true;
    this.holdContainer.position.set(x, y);
    this.holdBg.clear();
    this.holdBg.roundRect(0, 0, width, height, 7);
    this.holdBg.fill({ color: 0x10202a, alpha: 0.88 });
    this.holdBg.stroke({ width: 2, color: 0xf2fbff, alpha: 0.88 });
    this.holdBg.roundRect(4, 4, width - 8, height - 8, 5);
    this.holdBg.fill({ color: 0x223746, alpha: 0.92 });

    this.holdFill.clear();
    if (ratio > 0) {
      this.holdFill.roundRect(4, 4, (width - 8) * ratio, height - 8, 5);
      this.holdFill.fill({ color: 0x5fb8ff, alpha: 0.95 });
    }

    this.holdLabel.text = progress.text;
    this.holdLabel.position.set(width / 2, height / 2 + 1);
    this.holdSnapshot = {
      visible: true,
      progress: ratio,
      text: progress.text,
      x,
      y,
      width,
      height,
    };
  }

  getHoldProgressSnapshot(): HoldEndTurnProgressSnapshot {
    return { ...this.holdSnapshot };
  }

  private updatePulse(): void {
    this.pulseTime += this.renderer.app.ticker.deltaMS;
    const endTurnPulse = 1.03 + Math.sin(this.pulseTime * 0.003) * 0.03;
    const rotatePulse = 1.01 + Math.sin(this.pulseTime * 0.0024 + 0.8) * 0.018;
    this.endTurnLabel.scale.set(endTurnPulse);
    this.rotateLabel.scale.set(rotatePulse);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyHoldSnapshot(): HoldEndTurnProgressSnapshot {
  return { visible: false, progress: 0, text: '', x: 0, y: 0, width: 0, height: 0 };
}
