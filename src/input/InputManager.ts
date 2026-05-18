import { pixelToSector } from '../utils/SectorUtils';

type PointerLike = {
  pointerId?: number;
  type?: string;
};

export interface HoverSectorInfo {
  sector: number | null;
  x: number;
  y: number;
  outsideOctagon: boolean;
}

export interface HoldConfirmProgress {
  visible: boolean;
  progress: number;
  x: number;
  y: number;
  text: string;
}

export class InputManager {
  private onConfirmCallback: (() => void) | null = null;
  private onHoverSectorChangedCallback: ((info: HoverSectorInfo) => void) | null = null;
  private onRotateCallback: ((deltaDeg: number) => void) | null = null;
  private onHoldConfirmProgressCallback: ((progress: HoldConfirmProgress) => void) | null = null;
  private holdConfirmEnabledProvider: (() => boolean) | null = null;
  private enabled = false;
  private lastClientX = 0;
  private lastClientY = 0;
  private centerX = 0;
  private centerY = 0;
  private gestureDist = 0;
  private pointerDownActive = false;
  private rightDragActive = false;
  private rightDragAngleAccumulator = 0;
  private rightDragLastAngle: number | null = null;
  private currentSector: number | null = null;
  private currentPointerOutsideOctagon = false;
  private suppressPointerId: number | null = null;
  private suppressNextConfirm = false;
  private rotationDeg = 0;
  private holdConfirmActive = false;
  private holdConfirmCompletedPointerId: number | null = null;
  private holdConfirmPointerId: number | null = null;
  private holdConfirmStartedAt = 0;
  private holdConfirmX = 0;
  private holdConfirmY = 0;
  private holdConfirmTimer: number | ReturnType<typeof setTimeout> | null = null;
  private holdConfirmTimerIsRaf = false;
  private coordinateMapper: ((clientX: number, clientY: number) => { x: number; y: number }) | null = null;

  private boundMove: (e: PointerEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private boundUp: (e: PointerEvent) => void;
  private boundCancel: (e: PointerEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundBlur: () => void;

  constructor() {
    this.boundMove = this.onPointerMove.bind(this);
    this.boundDown = this.onPointerDown.bind(this);
    this.boundUp = this.onPointerUp.bind(this);
    this.boundCancel = this.onPointerCancel.bind(this);
    this.boundContextMenu = this.onContextMenu.bind(this);
    this.boundBlur = this.resetGestureState.bind(this);
  }

  private octagonRadius = 0;
  private static readonly HOLD_CONFIRM_MS = 650;
  private static readonly ROTATE_ANGLE_THRESHOLD = 30;
  private static readonly RIGHT_DRAG_MIN_RADIUS = 24;
  private static readonly HOLD_CONFIRM_MOVE_CANCEL_DISTANCE = 96;

  enable(canvas: HTMLCanvasElement, centerX: number, centerY: number, radius: number, coordinateMapper?: (clientX: number, clientY: number) => { x: number; y: number }): void {
    this.centerX = centerX;
    this.centerY = centerY;
    this.octagonRadius = radius;
    this.coordinateMapper = coordinateMapper ?? null;
    if (this.enabled) return;
    this.enabled = true;
    canvas.addEventListener('pointerdown', this.boundDown);
    canvas.addEventListener('pointermove', this.boundMove);
    canvas.addEventListener('pointerup', this.boundUp);
    canvas.addEventListener('pointercancel', this.boundCancel);
    canvas.addEventListener('contextmenu', this.boundContextMenu);
    window.addEventListener('blur', this.boundBlur);
  }

  disable(canvas: HTMLCanvasElement): void {
    this.enabled = false;
    this.coordinateMapper = null;
    this.cancelHoldConfirm();
    canvas.removeEventListener('pointerdown', this.boundDown);
    canvas.removeEventListener('pointermove', this.boundMove);
    canvas.removeEventListener('pointerup', this.boundUp);
    canvas.removeEventListener('pointercancel', this.boundCancel);
    canvas.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('blur', this.boundBlur);
  }

  onConfirm(cb: () => void): void { this.onConfirmCallback = cb; }
  onHoverSectorChanged(cb: (info: HoverSectorInfo) => void): void { this.onHoverSectorChangedCallback = cb; }
  onRotate(cb: (deltaDeg: number) => void): void { this.onRotateCallback = cb; }
  onHoldConfirmProgress(cb: (progress: HoldConfirmProgress) => void): void { this.onHoldConfirmProgressCallback = cb; }
  setHoldConfirmEnabledProvider(cb: () => boolean): void { this.holdConfirmEnabledProvider = cb; }
  getCurrentSector(): number | null { return this.currentSector; }
  isCurrentPointerOutsideOctagon(): boolean { return this.currentPointerOutsideOctagon; }
  setRotationAngle(deg: number): void { this.rotationDeg = ((deg % 360) + 360) % 360; }
  resetGestureState(): void {
    this.cancelHoldConfirm();
    this.gestureDist = 0;
    this.pointerDownActive = false;
    this.rightDragActive = false;
    this.resetRightDragRotation();
    this.suppressPointerId = null;
    this.suppressNextConfirm = false;
  }
  suppressCurrentGesture(event?: PointerLike): void {
    if (event?.type === 'pointerup') return;
    this.cancelHoldConfirm();
    if (event?.pointerId !== undefined) {
      this.suppressPointerId = event.pointerId;
      return;
    }
    this.suppressNextConfirm = true;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.button === 2) {
      e.preventDefault();
      this.updateCurrentSector(e);
      this.rightDragActive = true;
      this.resetRightDragRotation();
      this.rightDragLastAngle = this.pointerAngleIfStable(e);
      return;
    }
    if (e.button !== 0) return;
    this.gestureDist = 0;
    this.pointerDownActive = true;
    this.updateCurrentSector(e);
    if (this.isPointerSuppressed(e)) return;
    if (this.canStartHoldConfirm()) {
      this.startHoldConfirm(e);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled) return;
    const point = this.mapPointer(e);
    const dx = point.x - this.lastClientX;
    const dy = point.y - this.lastClientY;
    this.updateCurrentSector(e);
    if (this.rightDragActive) {
      this.accumulateRightDragRotation(e);
      return;
    }
    if (this.pointerDownActive) {
      this.gestureDist += Math.sqrt(dx * dx + dy * dy);
      if (this.gestureDist > InputManager.HOLD_CONFIRM_MOVE_CANCEL_DISTANCE && this.holdConfirmActive) {
        this.cancelHoldConfirm();
        return;
      }
      if (this.holdConfirmActive) {
        this.holdConfirmX = point.x;
        this.holdConfirmY = point.y;
        this.emitHoldConfirmProgress(this.currentHoldConfirmProgress());
      }
    }
  }

  private updateCurrentSector(e: PointerEvent): void {
    const point = this.mapPointer(e);
    this.lastClientX = point.x;
    this.lastClientY = point.y;
    const dxc = point.x - this.centerX;
    const dyc = point.y - this.centerY;
    const distToCenter = Math.sqrt(dxc * dxc + dyc * dyc);
    this.currentPointerOutsideOctagon = !this.isInsideOctagon(dxc, dyc);
    if (this.currentPointerOutsideOctagon || distToCenter < 15) this.currentSector = null;
    else this.currentSector = pixelToSector(dxc, dyc, this.rotationDeg);
    this.emitHoverSector();
  }

  private isInsideOctagon(dx: number, dy: number): boolean {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.octagonRadius) return false;

    const sectorAngle = Math.PI / 4;
    const halfSector = sectorAngle / 2;
    const angle = Math.atan2(dy, dx) - this.rotationDeg * Math.PI / 180;
    const normalized = (angle % sectorAngle + sectorAngle) % sectorAngle;
    const deltaFromSideCenter = normalized - halfSector;
    const apothem = this.octagonRadius * Math.cos(halfSector);
    const maxRadius = apothem / Math.cos(deltaFromSideCenter);
    return dist <= maxRadius + 0.001;
  }

  private shouldSuppressConfirm(e: PointerEvent): boolean {
    if (this.isPointerSuppressed(e)) {
      this.suppressPointerId = null;
      this.suppressNextConfirm = false;
      return true;
    }
    return false;
  }

  private isPointerSuppressed(e: PointerEvent): boolean {
    return this.suppressNextConfirm || this.suppressPointerId === e.pointerId;
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.button === 2) {
      e.preventDefault();
      this.updateCurrentSector(e);
      this.rightDragActive = false;
      this.resetRightDragRotation();
      return;
    }
    if (e.button !== 0) return;
    this.updateCurrentSector(e);
    this.pointerDownActive = false;
    const completedHoldPointer = this.holdConfirmCompletedPointerId !== null && this.holdConfirmCompletedPointerId === (e.pointerId ?? null);
    if (this.shouldSuppressConfirm(e)) {
      this.cancelHoldConfirm();
      return;
    }
    if (this.holdConfirmActive) {
      this.cancelHoldConfirm();
      return;
    }
    if (completedHoldPointer) {
      this.holdConfirmCompletedPointerId = null;
      return;
    }
    if (this.gestureDist > 8) return;
    this.onConfirmCallback?.();
  }

  private onPointerCancel(e: PointerEvent): void {
    if (e.button === 2 || this.rightDragActive) {
      this.rightDragActive = false;
      this.resetRightDragRotation();
    }
    this.pointerDownActive = false;
    this.cancelHoldConfirm();
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
  }

  private resetRightDragRotation(): void {
    this.rightDragAngleAccumulator = 0;
    this.rightDragLastAngle = null;
  }

  private accumulateRightDragRotation(e: PointerEvent): void {
    const currentAngle = this.pointerAngleIfStable(e);
    if (currentAngle === null) {
      this.rightDragLastAngle = null;
      this.rightDragAngleAccumulator = 0;
      return;
    }

    if (this.rightDragLastAngle === null) {
      this.rightDragLastAngle = currentAngle;
      return;
    }

    this.rightDragAngleAccumulator += shortestAngleDelta(this.rightDragLastAngle, currentAngle);
    this.rightDragLastAngle = currentAngle;

    while (this.rightDragAngleAccumulator >= InputManager.ROTATE_ANGLE_THRESHOLD) {
      this.onRotateCallback?.(45);
      this.rightDragAngleAccumulator -= InputManager.ROTATE_ANGLE_THRESHOLD;
    }
    while (this.rightDragAngleAccumulator <= -InputManager.ROTATE_ANGLE_THRESHOLD) {
      this.onRotateCallback?.(-45);
      this.rightDragAngleAccumulator += InputManager.ROTATE_ANGLE_THRESHOLD;
    }
  }

  private pointerAngleIfStable(e: PointerEvent): number | null {
    const point = this.mapPointer(e);
    const dx = point.x - this.centerX;
    const dy = point.y - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < InputManager.RIGHT_DRAG_MIN_RADIUS) return null;
    return Math.atan2(dy, dx) * 180 / Math.PI;
  }

  private emitHoverSector(): void {
    this.onHoverSectorChangedCallback?.({
      sector: this.currentSector,
      x: this.lastClientX,
      y: this.lastClientY,
      outsideOctagon: this.currentPointerOutsideOctagon,
    });
  }

  private canStartHoldConfirm(): boolean {
    return this.enabled && Boolean(this.holdConfirmEnabledProvider?.());
  }

  private startHoldConfirm(e: PointerEvent): void {
    this.cancelHoldConfirm(false);
    this.holdConfirmActive = true;
    this.holdConfirmCompletedPointerId = null;
    this.holdConfirmPointerId = e.pointerId ?? null;
    this.holdConfirmStartedAt = this.now();
    const point = this.mapPointer(e);
    this.holdConfirmX = point.x;
    this.holdConfirmY = point.y;
    this.emitHoldConfirmProgress(this.currentHoldConfirmProgress());
    this.scheduleHoldConfirmTick();
  }

  private scheduleHoldConfirmTick(): void {
    this.clearHoldConfirmTimer();
    if (typeof requestAnimationFrame === 'function') {
      this.holdConfirmTimerIsRaf = true;
      this.holdConfirmTimer = requestAnimationFrame(() => this.updateHoldConfirm());
      return;
    }
    this.holdConfirmTimerIsRaf = false;
    this.holdConfirmTimer = setTimeout(() => this.updateHoldConfirm(), 16);
  }

  private updateHoldConfirm(now: number = this.now()): void {
    this.holdConfirmTimer = null;
    if (!this.holdConfirmActive) return;
    if (!this.canStartHoldConfirm()) {
      this.cancelHoldConfirm();
      return;
    }

    const progress = this.currentHoldConfirmProgress(now);
    this.emitHoldConfirmProgress(progress);
    if (progress.progress < 1) {
      this.scheduleHoldConfirmTick();
      return;
    }

    this.holdConfirmActive = false;
    this.holdConfirmCompletedPointerId = this.holdConfirmPointerId;
    this.holdConfirmPointerId = null;
    this.emitHoldConfirmProgress({ visible: false, progress: 0, x: this.holdConfirmX, y: this.holdConfirmY, text: '结束回合' });
    this.onConfirmCallback?.();
  }

  private cancelHoldConfirm(emitHidden = true): void {
    const wasActive = this.holdConfirmActive;
    this.clearHoldConfirmTimer();
    this.holdConfirmActive = false;
    this.holdConfirmPointerId = null;
    if (emitHidden && wasActive) {
      this.emitHoldConfirmProgress({ visible: false, progress: 0, x: this.holdConfirmX, y: this.holdConfirmY, text: '结束回合' });
    }
  }

  private clearHoldConfirmTimer(): void {
    if (this.holdConfirmTimer === null) return;
    if (this.holdConfirmTimerIsRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.holdConfirmTimer as number);
    } else {
      clearTimeout(this.holdConfirmTimer as ReturnType<typeof setTimeout>);
    }
    this.holdConfirmTimer = null;
  }

  private currentHoldConfirmProgress(now: number = this.now()): HoldConfirmProgress {
    const elapsed = Math.max(0, now - this.holdConfirmStartedAt);
    return {
      visible: true,
      progress: Math.min(1, elapsed / InputManager.HOLD_CONFIRM_MS),
      x: this.holdConfirmX,
      y: this.holdConfirmY,
      text: '结束回合',
    };
  }

  private emitHoldConfirmProgress(progress: HoldConfirmProgress): void {
    this.onHoldConfirmProgressCallback?.(progress);
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private mapPointer(e: PointerEvent): { x: number; y: number } {
    return this.coordinateMapper?.(e.clientX, e.clientY) ?? { x: e.clientX, y: e.clientY };
  }
}

function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}
