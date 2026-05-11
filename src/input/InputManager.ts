export class InputManager {
  private onConfirmCallback: (() => void) | null = null;
  private onRotateCallback: ((delta: number) => void) | null = null;
  private enabled = false;
  private lastX = 0;
  private lastY = 0;
  private centerX = 0;
  private centerY = 0;
  private dragThreshold = 450;
  private accumDist = 0;
  private currentSector: number | null = null;

  private boundMove: (e: PointerEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private boundUp: (e: PointerEvent) => void;

  constructor() {
    this.boundMove = this.onPointerMove.bind(this);
    this.boundDown = this.onPointerDown.bind(this);
    this.boundUp = this.onPointerUp.bind(this);
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
  }

  disable(canvas: HTMLCanvasElement): void {
    this.enabled = false;
    canvas.removeEventListener('pointerdown', this.boundDown);
    canvas.removeEventListener('pointermove', this.boundMove);
    canvas.removeEventListener('pointerup', this.boundUp);
  }

  onRotate(cb: (delta: number) => void): void { this.onRotateCallback = cb; }
  onConfirm(cb: () => void): void { this.onConfirmCallback = cb; }
  getCurrentSector(): number | null { return this.currentSector; }

  private onPointerDown(e: PointerEvent): void {
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.accumDist = 0;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled) return;
    // Track sector under mouse
    const dxc = e.clientX - this.centerX;
    const dyc = e.clientY - this.centerY;
    const distToCenter = Math.sqrt(dxc * dxc + dyc * dyc);
    if (distToCenter < 15) { this.currentSector = null; }
    else {
      const angle = Math.atan2(dyc, dxc);
      let a = angle;
      if (a < 0) a += Math.PI * 2;
      this.currentSector = Math.floor(a / (Math.PI / 4)) % 8;
    }
    if (distToCenter > this.octagonRadius) return;

    const cx = e.clientX;
    const cy = e.clientY;
    const dx = cx - this.lastX;
    const dy = cy - this.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.accumDist += dist;
    if (this.accumDist < this.dragThreshold) return; // don't update lastX/Y until threshold met
    this.accumDist = 0;

    // Cross product: (prev-center) × (curr-center) determines rotation direction
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

  private onPointerUp(_e: PointerEvent): void {
    if (!this.enabled) return;
    this.onConfirmCallback?.();
  }
}
