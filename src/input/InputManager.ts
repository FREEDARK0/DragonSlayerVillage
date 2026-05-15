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
  private onHoverSectorChangedCallback: ((info: HoverSectorInfo) => void) | null = null;
  private enabled = false;
  private lastClientX = 0;
  private lastClientY = 0;
  private centerX = 0;
  private centerY = 0;
  private gestureDist = 0;
  private pointerDownActive = false;
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

  onConfirm(cb: () => void): void { this.onConfirmCallback = cb; }
  onHoverSectorChanged(cb: (info: HoverSectorInfo) => void): void { this.onHoverSectorChangedCallback = cb; }
  getCurrentSector(): number | null { return this.currentSector; }
  isCurrentPointerOutsideOctagon(): boolean { return this.currentPointerOutsideOctagon; }
  setRotationAngle(deg: number): void { this.rotationDeg = deg; }
  resetGestureState(): void {
    this.gestureDist = 0;
    this.pointerDownActive = false;
    this.suppressPointerId = null;
    this.suppressNextConfirm = false;
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
      return;
    }
    if (e.button !== 0) return;
    this.gestureDist = 0;
    this.pointerDownActive = true;
    this.updateCurrentSector(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled) return;
    const dx = e.clientX - this.lastClientX;
    const dy = e.clientY - this.lastClientY;
    this.updateCurrentSector(e);
    if (this.pointerDownActive) this.gestureDist += Math.sqrt(dx * dx + dy * dy);
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
    this.pointerDownActive = false;
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
