export const SECTOR_COUNT = 8;
export const SECTOR_ANGLE = (Math.PI * 2) / SECTOR_COUNT;
export const RULE_NUMBER_START_SECTOR = 5;
const DEG45 = Math.PI / 4;

/** 角度（弧度）转度数偏移（45°步进） */
export function radToRotationStep(rad: number): number {
  return Math.round(rad / DEG45) * 45;
}

/** 旋转度数 → 弧度偏移 */
export function rotationToRad(deg: number): number {
  return (deg % 360) * DEG45 / 45;
}

/** 扇形中心角度 (rad, 0=右, PI/2=下), rotationDeg 为旋转度数 */
export function sectorAngle(index: number, rotationDeg: number = 0): number {
  return rotationToRad(rotationDeg) + (index + 0.5) * SECTOR_ANGLE;
}

export function sectorStartAngle(index: number, rotationDeg: number = 0): number {
  return rotationToRad(rotationDeg) + index * SECTOR_ANGLE;
}

export function sectorEndAngle(index: number, rotationDeg: number = 0): number {
  return rotationToRad(rotationDeg) + (index + 1) * SECTOR_ANGLE;
}

export function sectorIndexToRuleNumber(index: number): number {
  return (((index - RULE_NUMBER_START_SECTOR) % SECTOR_COUNT + SECTOR_COUNT) % SECTOR_COUNT) + 1;
}

export function ruleNumberToSectorIndex(ruleNumber: number): number {
  const zeroBased = ((ruleNumber - 1) % SECTOR_COUNT + SECTOR_COUNT) % SECTOR_COUNT;
  return (RULE_NUMBER_START_SECTOR + zeroBased) % SECTOR_COUNT;
}

/** 屏幕角度 → 扇形索引 (考虑旋转) */
export function angleToSector(angle: number, rotationDeg: number = 0): number {
  let a = angle - rotationToRad(rotationDeg);
  if (a < 0) a += Math.PI * 2;
  return Math.floor(a / SECTOR_ANGLE) % SECTOR_COUNT;
}

export function pixelToSector(dx: number, dy: number, rotationDeg: number = 0): number {
  return angleToSector(Math.atan2(dy, dx), rotationDeg);
}

export function sectorCenterOffset(index: number, radius: number, rotationDeg: number = 0): { x: number; y: number } {
  const angle = sectorAngle(index, rotationDeg);
  const dist = radius * 0.55;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
}

export function sectorVertices(index: number, radius: number, rotationDeg: number = 0): [{ x: number; y: number }, { x: number; y: number }] {
  const a1 = sectorStartAngle(index, rotationDeg);
  const a2 = sectorEndAngle(index, rotationDeg);
  return [
    { x: Math.cos(a1) * radius, y: Math.sin(a1) * radius },
    { x: Math.cos(a2) * radius, y: Math.sin(a2) * radius },
  ];
}

// ─── 八边形顶点 ─────────────────────────

export function vertexAngle(v: number, rotationDeg: number = 0): number {
  return rotationToRad(rotationDeg) + v * SECTOR_ANGLE;
}

export function vertexPixel(v: number, cx: number, cy: number, radius: number, rotationDeg: number = 0): { x: number; y: number } {
  const a = vertexAngle(v, rotationDeg);
  return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
}

/** 从边扩散吐息：power=1/2/3 → 1/3/5 个扇形，以 edgeIndex 为中心 */
export function edgeBreathSectors(edgeIndex: number, power: number): number[] {
  const count = Math.min(power * 2 - 1, SECTOR_COUNT);
  const start = ((edgeIndex - power + 1) % SECTOR_COUNT + SECTOR_COUNT) % SECTOR_COUNT;
  const sectors: number[] = [];
  for (let i = 0; i < count; i++) sectors.push((start + i) % SECTOR_COUNT);
  return sectors;
}
