import { sectorEndAngle, sectorStartAngle } from '../utils/SectorUtils';

export interface Point {
  x: number;
  y: number;
}

export interface HatchSegment {
  start: Point;
  end: Point;
}

export interface HatchOptions {
  spacing?: number;
  angleRad?: number;
  lineHalfLength?: number;
}

const DEFAULT_HATCH_SPACING = 9;
const DEFAULT_HATCH_ANGLE = Math.PI / 4;
const EPSILON = 0.000001;

export function sectorBandPolygon(sector: number, cx: number, cy: number, innerR: number, outerR: number, rotationDeg: number = 0): Point[] {
  const a1 = sectorStartAngle(sector, rotationDeg);
  const a2 = sectorEndAngle(sector, rotationDeg);
  return [
    { x: cx + Math.cos(a1) * outerR, y: cy + Math.sin(a1) * outerR },
    { x: cx + Math.cos(a2) * outerR, y: cy + Math.sin(a2) * outerR },
    { x: cx + Math.cos(a2) * innerR, y: cy + Math.sin(a2) * innerR },
    { x: cx + Math.cos(a1) * innerR, y: cy + Math.sin(a1) * innerR },
  ];
}

export function buildParallelHatchSegments(polygon: Point[], options: HatchOptions = {}): HatchSegment[] {
  if (polygon.length < 3) return [];
  const spacing = options.spacing ?? DEFAULT_HATCH_SPACING;
  const angleRad = options.angleRad ?? DEFAULT_HATCH_ANGLE;
  const dir = normalize({ x: Math.cos(angleRad), y: Math.sin(angleRad) });
  const normal = { x: -dir.y, y: dir.x };

  const normalProjections = polygon.map(point => dot(point, normal));
  const dirProjections = polygon.map(point => dot(point, dir));
  const minNormal = Math.min(...normalProjections);
  const maxNormal = Math.max(...normalProjections);
  const minDir = Math.min(...dirProjections);
  const maxDir = Math.max(...dirProjections);
  const midDir = (minDir + maxDir) / 2;
  const halfLength = options.lineHalfLength ?? Math.max(maxDir - minDir, maxNormal - minNormal) + spacing * 4;
  const segments: HatchSegment[] = [];
  const startOffset = Math.floor(minNormal / spacing) * spacing - spacing;
  const endOffset = Math.ceil(maxNormal / spacing) * spacing + spacing;

  for (let offset = startOffset; offset <= endOffset; offset += spacing) {
    const center = {
      x: normal.x * offset + dir.x * midDir,
      y: normal.y * offset + dir.y * midDir,
    };
    const start = {
      x: center.x - dir.x * halfLength,
      y: center.y - dir.y * halfLength,
    };
    const end = {
      x: center.x + dir.x * halfLength,
      y: center.y + dir.y * halfLength,
    };
    const clipped = clipSegmentToConvexPolygon(start, end, polygon);
    if (!clipped) continue;
    if (distance(clipped.start, clipped.end) <= 0.5) continue;
    segments.push(clipped);
  }

  return segments;
}

export function pointInConvexPolygon(point: Point, polygon: Point[], epsilon: number = EPSILON): boolean {
  if (polygon.length < 3) return false;
  const orientation = Math.sign(polygonSignedArea(polygon)) || 1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const side = cross(subtract(b, a), subtract(point, a));
    if (orientation > 0 && side < -epsilon) return false;
    if (orientation < 0 && side > epsilon) return false;
  }
  return true;
}

function clipSegmentToConvexPolygon(start: Point, end: Point, polygon: Point[]): HatchSegment | null {
  const orientation = Math.sign(polygonSignedArea(polygon)) || 1;
  const direction = subtract(end, start);
  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edge = subtract(b, a);
    const initial = orientation * cross(edge, subtract(start, a));
    const delta = orientation * cross(edge, direction);

    if (Math.abs(delta) < EPSILON) {
      if (initial < -EPSILON) return null;
      continue;
    }

    const t = -initial / delta;
    if (delta > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 - t1 > EPSILON) return null;
  }

  return {
    start: {
      x: start.x + direction.x * t0,
      y: start.y + direction.y * t0,
    },
    end: {
      x: start.x + direction.x * t1,
      y: start.y + direction.y * t1,
    },
  };
}

function polygonSignedArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  return length <= EPSILON ? { x: 1, y: 0 } : { x: point.x / length, y: point.y / length };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
