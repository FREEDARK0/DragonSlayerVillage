import { Grid } from '../models/Grid';
import { HeroState, createHero } from '../models/Hero';
import { DragonState, createDragon } from '../models/Dragon';
import { DragonTemplate, getAvailableDragons } from '../config/dragonTypes';
import { createRandomBlock } from '../models/Block';
import { GridPosition } from '../utils/GridPosition';
import { randInt, weightedPick } from '../utils/random';
import { randomDirection } from '../utils/Direction';
import { GAME_CONSTANTS } from '../config/constants';

export class SpawnSystem {
  /** 初始化地图：随机方块布满网格，玩家初始位置随机 */
  initMap(grid: Grid): { hero: HeroState; heroPos: GridPosition } {
    const hero = createHero(randomDirection());
    const heroPos = new GridPosition(
      randInt(0, grid.size - 1),
      randInt(0, grid.size - 1),
    );

    // Fill ALL cells with random blocks (no hero block)
    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
        const block = createRandomBlock();
        grid.setBlock(new GridPosition(r, c), block);
      }
    }

    return { hero, heroPos };
  }

  /** 补充方块（传入当前龙的ID和颜色列表，供剑方块绑定） */
  replenishBlock(grid: Grid, pos: GridPosition, dragonIds: string[], dragonColors: number[]): void {
    if (grid.isEmpty(pos)) {
      const block = createRandomBlock(dragonIds, dragonColors);
      grid.setBlock(pos, block);
    }
  }

  /** 生成龙 */
  spawnDragons(year: number, phase: string, countRange: [number, number], existingDragons: DragonState[]): DragonState[] {
    const newDragons: DragonState[] = [];
    const available = getAvailableDragons(year);
    if (available.length === 0) return newDragons;

    const count = randInt(countRange[0], countRange[1]);
    const needed = count - existingDragons.filter(d => d.isAlive).length;
    if (needed <= 0) return newDragons;

    const weights = available.map(d => d.spawnWeight);
    for (let i = 0; i < needed; i++) {
      newDragons.push(createDragon(weightedPick(available, weights), year));
    }
    return newDragons;
  }

  checkDragonDepartures(dragons: DragonState[], maxStayTurns: number): DragonState[] {
    return dragons.filter(d => d.isAlive && d.turnCounter >= maxStayTurns);
  }
}
