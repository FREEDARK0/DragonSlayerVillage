import { Container, Graphics } from 'pixi.js';
import { GameRenderer } from './GameRenderer';
import { VisionArc } from '../core/VisionArc';
import { sectorStartAngle, sectorEndAngle, SECTOR_COUNT } from '../utils/SectorUtils';

export class VisionArcRenderer {
  private container: Container;
  private fillGraphics: Graphics;
  private outlineGraphics: Graphics;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'VisionArcRenderer';
    this.fillGraphics = new Graphics();
    this.outlineGraphics = new Graphics();
    this.container.addChild(this.fillGraphics);
    this.container.addChild(this.outlineGraphics);
    renderer.getLayer(3).addChild(this.container);
  }

  render(arc: VisionArc | null): void {
    this.fillGraphics.clear();
    this.outlineGraphics.clear();
    if (!arc) return;

    const cx = this.renderer.octagonCenterX;
    const cy = this.renderer.octagonCenterY;
    const R = this.renderer.octagonRadius;
    const sectors = arc.getCoveredSectors();

    // Fill each sector
    for (const s of sectors) {
      const a1 = sectorStartAngle(s);
      const a2 = sectorEndAngle(s);
      this.fillGraphics.poly([cx, cy, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, cx + Math.cos(a2) * R, cy + Math.sin(a2) * R]);
      this.fillGraphics.fill({ color: 0x44aaff, alpha: 0.1 });
    }

    // Bold uniform black outline around the half-octagon arc
    const first = sectors[0];
    const last = sectors[sectors.length - 1];
    const startAngle = sectorStartAngle(first);
    const endAngle = sectorEndAngle(last);
    const SW = 4;

    // Outer boundary + two radial lines, all same thickness
    this.outlineGraphics.moveTo(cx, cy);
    this.outlineGraphics.lineTo(cx + Math.cos(startAngle) * R, cy + Math.sin(startAngle) * R);
    for (let i = 0; i < sectors.length; i++) {
      const a = sectorEndAngle(sectors[i]);
      this.outlineGraphics.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    this.outlineGraphics.lineTo(cx, cy);
    this.outlineGraphics.closePath();
    this.outlineGraphics.stroke({ width: SW, color: 0x000000, alpha: 1.0, join: 'round', cap: 'round' });
  }
}
