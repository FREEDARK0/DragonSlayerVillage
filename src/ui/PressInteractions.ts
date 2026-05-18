export const TOUCH_LONG_PRESS_MS = 550;

type PointerUiEvent = {
  pointerId?: number;
  pointerType?: string;
  button?: number;
  type?: string;
  global?: { x: number; y: number };
};

interface PressableOptions {
  onPress?: (event: PointerUiEvent) => void;
  onLongPress?: (event: PointerUiEvent) => void;
  onPointerActivity?: (event: PointerUiEvent) => void;
  onHoverStart?: (event: PointerUiEvent) => void;
  onHoverEnd?: (event: PointerUiEvent) => void;
  longPressMs?: number;
  moveTolerance?: number;
}

export function bindPressable(target: any, options: PressableOptions): void {
  const longPressMs = options.longPressMs ?? TOUCH_LONG_PRESS_MS;
  const moveTolerance = options.moveTolerance ?? 12;
  let activePointerId: number | null = null;
  let downPoint: { x: number; y: number } | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  let longPressEvent: PointerUiEvent | null = null;

  const clearLongPressTimer = () => {
    if (longPressTimer === null) return;
    clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  const clearTouchState = () => {
    clearLongPressTimer();
    activePointerId = null;
    downPoint = null;
    longPressEvent = null;
    longPressed = false;
  };

  target.on('pointerover', (event: PointerUiEvent) => {
    if (isMouseEvent(event)) options.onHoverStart?.(event);
  });
  target.on('pointerout', (event: PointerUiEvent) => {
    if (isMouseEvent(event)) options.onHoverEnd?.(event);
  });
  target.on('pointerdown', (event: PointerUiEvent) => {
    if (!isPrimaryPointer(event)) return;
    options.onPointerActivity?.(event);
    if (isMouseEvent(event) || !options.onLongPress) {
      options.onPress?.(event);
      return;
    }

    clearTouchState();
    activePointerId = event.pointerId ?? null;
    downPoint = pointerPoint(event);
    longPressEvent = event;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressed = true;
      if (longPressEvent) options.onLongPress?.(longPressEvent);
    }, longPressMs);
  });
  target.on('pointermove', (event: PointerUiEvent) => {
    if (!isActiveTouch(event, activePointerId) || !downPoint) return;
    const point = pointerPoint(event);
    const dx = point.x - downPoint.x;
    const dy = point.y - downPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) > moveTolerance) clearLongPressTimer();
  });
  target.on('pointerup', (event: PointerUiEvent) => {
    if (!isActiveTouch(event, activePointerId)) return;
    const shouldPress = !longPressed;
    clearLongPressTimer();
    activePointerId = null;
    downPoint = null;
    longPressEvent = null;
    const wasLongPressed = longPressed;
    longPressed = false;
    if (shouldPress && !wasLongPressed) options.onPress?.(event);
  });
  target.on('pointerupoutside', (event: PointerUiEvent) => {
    if (isActiveTouch(event, activePointerId)) clearTouchState();
  });
  target.on('pointercancel', (event: PointerUiEvent) => {
    if (isActiveTouch(event, activePointerId)) clearTouchState();
  });
}

function isPrimaryPointer(event: PointerUiEvent): boolean {
  return event.button === undefined || event.button === 0;
}

function isMouseEvent(event: PointerUiEvent): boolean {
  return (event.pointerType ?? 'mouse') === 'mouse';
}

function isActiveTouch(event: PointerUiEvent, activePointerId: number | null): boolean {
  if (activePointerId === null) return false;
  return event.pointerId === activePointerId;
}

function pointerPoint(event: PointerUiEvent): { x: number; y: number } {
  return {
    x: event.global?.x ?? 0,
    y: event.global?.y ?? 0,
  };
}
