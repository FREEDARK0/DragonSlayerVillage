import { SECTOR_COUNT } from '../utils/SectorUtils';

export class VisionArc {
  startSector: number;
  readonly count: number;

  constructor(startSector: number, count: number = 4) {
    this.startSector = ((startSector % SECTOR_COUNT) + SECTOR_COUNT) % SECTOR_COUNT;
    this.count = count;
  }

  getCoveredSectors(): number[] {
    const sectors: number[] = [];
    for (let i = 0; i < this.count; i++) {
      sectors.push((this.startSector + i) % SECTOR_COUNT);
    }
    return sectors;
  }

  contains(sector: number): boolean {
    return this.getCoveredSectors().includes(sector);
  }
}
