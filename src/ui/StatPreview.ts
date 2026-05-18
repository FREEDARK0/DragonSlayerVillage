export interface StatPreviewDelta {
  hpDelta: number;
  attackDelta: number;
  willDie: boolean;
}

export const PREVIEW_POSITIVE_COLOR = 0x8cff3f;
export const PREVIEW_NEGATIVE_COLOR = 0xff0808;

export function formatStatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '';
}

export function statDeltaColor(value: number): number {
  return value >= 0 ? PREVIEW_POSITIVE_COLOR : PREVIEW_NEGATIVE_COLOR;
}
