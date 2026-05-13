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

export class InputManager {
  private onConfirmCallback: (() => void) | null = null;
  private onRotateCallback: ((delta: number) => void) | null = null;
  private onViewModeChangedCallback: ((enabled: boolean) => void) | null = null;
  private onHoverSectorChangedCallback: ((info: HoverSectorInfo) => void) | null = null;
  private canToggleViewModeCallback: ((nextMode: boolean) => boolean) | null = null;
  private enabled = false;
  private viewMode = false;
  private lastX = 0;
  private lastY = 0;
  private lastClientX = 0;
  private lastClientY = 0;
  private centerX = 0;
  private centerY = 0;
  private dragThreshold = 450;
  private accumDist = 0;
  private gestureDist = 0;
  private currentSector: number | null = null;
  private currentPointerOutsideOctagon = false;
  private suppressPointerId: number | null = null;
  private suppressNextConfirm = false;
  private rotationDeg = 0;

  private boundMove: (e: PointerEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private boundUp: (e: PointerEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;

  constructor() {
    this.boundMove = this.onPointerMove.bind(this);
    this.boundDown = this.onPointerDown.bind(this);
    this.boundUp = this.onPointerUp.bind(this);
    this.boundContextMenu = this.onContextMenu.bind(this);
  }

  private octagonRadius = 0;

  enable(canvas: HTMLCanvasElement, centerX: number, centerY: number, radius: number): void {
    if (this.enabled) return;
    this.enabled = true;
    this.centerX = centerX;
    this.centerY = centerY;
    this.octagonRadius = radius;
    canvas.addEventListener('pointerdown', this.boundDown);
    canvas.addEventListener('pointermove', this.boundMove);
    canvas.addEventListener('pointerup', this.boundUp);
    canvas.addEventListener('contextmenu', this.boundContextMenu);
  }

  disable(canvas: HTMLCanvasElement): void {
    this.enabled = false;
    canvas.removeEventListener('pointerdown', this.boundDown);
    canvas.removeEventListener('pointermove', this.boundMove);
    canvas.removeEventListener('pointerup', this.boundUp);
    canvas.removeEventListener('contextmenu', this.boundContextMenu);
  }

  onRotate(cb: (delta: number) => void): void { this.onRotateCallback = cb; }
  onConfirm(cb: () => void): void { this.onConfirmCallback = cb; }
  onViewModeChanged(cb: (enabled: boolean) => void): void { this.onViewModeChangedCallback = cb; }
  onHoverSectorChanged(cb: (info: HoverSectorInfo) => void): void { this.onHoverSectorChangedCallback = cb; }
  canToggleViewMode(cb: (nextMode: boolean) => boolean): void { this.canToggleViewModeCallback = cb; }
  getCurrentSector(): number | null { return this.currentSector; }
  isCurrentPointerOutsideOctagon(): boolean { return this.currentPointerOutsideOctagon; }
  isViewMode(): boolean { return this.viewMode; }
  setRotationAngle(deg: number): void { this.rotationDeg = deg; }
  setViewMode(enabled: boolean, force: boolean = false): boolean {
    if (!force && this.canToggleViewModeCallback && !this.canToggleViewModeCallback(enabled)) return false;
    if (this.viewMode === enabled) return true;
    this.viewMode = enabled;
    this.onViewModeChangedCallback?.(this.viewMode);
    this.emitHoverSector();
    return true;
  }
  suppressCurrentGesture(event?: PointerLike): void {
    if (event?.type === 'pointerup') return;
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
      this.setViewMode(!this.viewMode);
      return;
    }
    if (e.button !== 0) return;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.accumDist = 0;
    this.gestureDist = 0;
    this.updateCurrentSector(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled) return;
    this.updateCurrentSector(e);
    if (this.viewMode) return;
    const dxc = e.clientX - this.centerX;
    const dyc = e.clientY - this.centerY;
    const distToCenter = Math.sqrt(dxc * dxc + dyc * dyc);
    if (distToCenter > this.octagonRadius) return;

    const cx = e.clientX;
    const cy = e.clientY;
    const dx = cx - this.lastX;
    const dy = cy - this.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.accumDist += dist;
    this.gestureDist += dist;
    if (this.accumDist < this.dragThreshold) return; // don't update lastX/Y until threshold met
    this.accumDist = 0;

    // Cross product: (prev-center) x (curr-center) determines rotation direction
    const px = this.lastX - this.centerX;
    const py = this.lastY - this.centerY;
    const ncx = cx - this.centerX;
    const ncy = cy - this.centerY;
    const cross = px * ncy - py * ncx;
    const delta = cross > 0 ? 45 : -45;

    this.lastX = cx;
    this.lastY = cy;
    this.onRotateCallback?.(delta);
  }

  private updateCurrentSector(e: PointerEvent): void {
    this.lastClientX = e.clientX;
    this.lastClientY = e.clientY;
    const dxc = e.clientX - this.centerX;
    const dyc = e.clientY - this.centerY;
    const distToCenter = Math.sqrt(dxc * dxc + dyc * dyc);
    this.currentPointerOutsideOctagon = !this.isInsideOctagon(dxc, dyc);
    if (this.currentPointerOutsideOctagon || distToCenter < 15) this.currentSector = null;
    else this.currentSector = pixelToSector(dxc, dyc, this.rotationDeg);
    if (this.viewMode) this.emitHoverSector();
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
    if (this.suppressPointerId === e.pointerId) {
      this.suppressPointerId = null;
      this.suppressNextConfirm = false;
      return true;
    }
    if (this.suppressNextConfirm) {
      this.suppressNextConfirm = false;
      return true;
    }
    return false;
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.button === 2) {
      e.preventDefault();
      this.updateCurrentSector(e);
      return;
    }
    if (e.button !== 0) return;
    this.updateCurrentSector(e);
    if (this.viewMode) return;
    if (this.shouldSuppressConfirm(e)) return;
    if (this.gestureDist > 8) return;
    this.onConfirmCallback?.();
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
  }

  private emitHoverSector(): void {
    this.onHoverSectorChangedCallback?.({
      sector: this.currentSector,
      x: this.lastClientX,
      y: this.lastClientY,
      outsideOctagon: this.currentPointerOutsideOctagon,
    });
  }
}
