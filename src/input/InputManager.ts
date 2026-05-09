import { GameRenderer } from '../rendering/GameRenderer';
import { GridPosition } from '../utils/GridPosition';
import { VisionFrame } from '../models/VisionFrame';
import { Grid } from '../models/Grid';
import { GAME_CONSTANTS } from '../config/constants';

export class InputManager {
  private currentFrame: VisionFrame | null = null;
  private onConfirmCallback: ((frame: VisionFrame) => void) | null = null;
  private onFrameMoveCallback: ((frame: VisionFrame) => void) | null = null;
  private enabled = false;
  private boundMove: (e: PointerEvent) => void;
  private boundClick: (e: PointerEvent) => void;

  constructor(private renderer: GameRenderer) {
    this.boundMove = this.onPointerMove.bind(this);
    this.boundClick = this.onPointerDown.bind(this);
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    const canvas = this.renderer.app.canvas;
    canvas.addEventListener('pointermove', this.boundMove);
    canvas.addEventListener('pointerdown', this.boundClick);
  }

  disable(): void {
    this.enabled = false;
    const canvas = this.renderer.app.canvas;
    canvas.removeEventListener('pointermove', this.boundMove);
    canvas.removeEventListener('pointerdown', this.boundClick);
  }

  onFrameMove(cb: (frame: VisionFrame) => void): void {
    this.onFrameMoveCallback = cb;
  }

  onConfirm(cb: (frame: VisionFrame) => void): void {
    this.onConfirmCallback = cb;
  }

  getCurrentFrame(): VisionFrame | null {
    return this.currentFrame;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled) return;
    const rect = this.renderer.app.canvas.getBoundingClientRect();
    const scaleX = GAME_CONSTANTS.SCREEN_WIDTH / rect.width;
    const scaleY = GAME_CONSTANTS.SCREEN_HEIGHT / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    const gridPos = this.renderer.pixelToGrid(px, py);
    if (!gridPos) return;

    const frameSize = GAME_CONSTANTS.VISION_FRAME_SIZE;
    const gridSize = GAME_CONSTANTS.GRID_SIZE;
    const topLeft = new GridPosition(
      Math.max(0, Math.min(gridPos.row, gridSize - frameSize)),
      Math.max(0, Math.min(gridPos.col, gridSize - frameSize)),
    );

    this.currentFrame = new VisionFrame(topLeft, frameSize);
    this.onFrameMoveCallback?.(this.currentFrame);
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled || !this.currentFrame) return;
    this.onConfirmCallback?.(this.currentFrame);
  }
}
