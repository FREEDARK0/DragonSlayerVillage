import { BlockData } from '../models/Block';
import { SECTOR_COUNT } from '../utils/SectorUtils';

export class OctagonBoard {
  sectors: (BlockData | null)[];
  /** 每个扇区的属性 (gold/strength/life/light/dark) */
  attributes: (string | null)[];
  /** 中心村庄战力 */
  villagePower: number = 50;

  constructor() {
    this.sectors = new Array(SECTOR_COUNT).fill(null);
    this.attributes = new Array(SECTOR_COUNT).fill(null);
  }

  getAttribute(sector: number): string | null {
    return this.attributes[sector] ?? null;
  }

  setAttribute(sector: number, attr: string | null): void {
    this.attributes[sector] = attr;
  }

  getSector(index: number): BlockData | null {
    if (index < 0 || index >= SECTOR_COUNT) return null;
    return this.sectors[index];
  }

  setSector(index: number, block: BlockData | null): void {
    if (index < 0 || index >= SECTOR_COUNT) return;
    this.sectors[index] = block;
  }

  removeBlock(index: number): void {
    if (index >= 0 && index < SECTOR_COUNT) {
      this.sectors[index] = null;
    }
  }

  isEmpty(index: number): boolean {
    return this.sectors[index] === null;
  }

  getEmptySectors(): number[] {
    const empty: number[] = [];
    for (let i = 0; i < SECTOR_COUNT; i++) {
      if (this.sectors[i] === null) empty.push(i);
    }
    return empty;
  }

  /** 遍历所有扇区 */
  forEach(fn: (block: BlockData | null, index: number) => void): void {
    for (let i = 0; i < SECTOR_COUNT; i++) {
      fn(this.sectors[i], i);
    }
  }

  /** 查找第一个匹配的扇区 */
  findSector(predicate: (block: BlockData | null, index: number) => boolean): number | null {
    for (let i = 0; i < SECTOR_COUNT; i++) {
      if (predicate(this.sectors[i], i)) return i;
    }
    return null;
  }

  /** 查找所有匹配的扇区 */
  findAllSectors(predicate: (block: BlockData | null, index: number) => boolean): number[] {
    const result: number[] = [];
    for (let i = 0; i < SECTOR_COUNT; i++) {
      if (predicate(this.sectors[i], i)) result.push(i);
    }
    return result;
  }
}
