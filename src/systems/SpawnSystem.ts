import { OctagonBoard } from '../core/OctagonBoard';
import { DragonState, createDragon, resetDragonForSpawn } from '../models/Dragon';
import { getAvailableDragons } from '../config/dragonTypes';
import { createBlock, createPowerStone, createRandomBlock } from '../models/Block';
import { BlockType } from '../config/blockTypes';
import { randInt, shuffle, weightedPick } from '../utils/random';

export class SpawnSystem {
  /** 初始布局：3金矿 + 2木墙 + 3空，村庄在中心 */
  initMap(board: OctagonBoard): number {
    const indices = shuffle([0,1,2,3,4,5,6,7]);
    for (let i = 0; i < 3; i++) board.setSector(indices[i], createPowerStone());
    for (let i = 3; i < 5; i++) board.setSector(indices[i], createBlock(BlockType.WOOD_WALL, 10));
    return 0;
  }

  replenishBlock(board: OctagonBoard, sector: number): void {
    if (board.isEmpty(sector)) {
      board.setSector(sector, createRandomBlock());
    }
  }

  spawnDragons(
    year: number,
    _phase: string,
    countRange: [number, number],
    existingDragons: DragonState[],
    nextTurn: number = 1,
  ): DragonState[] {
    const newDragons: DragonState[] = [];
    const available = getAvailableDragons(year);
    if (available.length === 0) return newDragons;
    const count = randInt(countRange[0], countRange[1]);
    const needed = count - existingDragons.filter(d => d.isAlive).length;
    if (needed <= 0) return newDragons;
    const usedEdges = new Set(existingDragons.filter(d => d.isAlive).map(d => d.edgeIndex));
    const { liveByTemplate, readyByTemplate } = buildRespawnPools(existingDragons, nextTurn);
    for (let i = 0; i < needed; i++) {
      const candidates = available.filter(t => (liveByTemplate.get(t.id) ?? 0) < t.quantity);
      if (candidates.length === 0) break;
      const free = [0,1,2,3,4,5,6,7].filter(e => !usedEdges.has(e));
      const edge = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : i % 8;
      usedEdges.add(edge);
      const template = weightedPick(candidates, candidates.map(d => d.spawnWeight));
      liveByTemplate.set(template.id, (liveByTemplate.get(template.id) ?? 0) + 1);
      const reusable = readyByTemplate.get(template.id)?.shift();
      if (reusable) {
        resetDragonForSpawn(reusable, template, year, edge);
        newDragons.push(reusable);
      } else {
        newDragons.push(createDragon(template, year, edge));
      }
    }
    return newDragons;
  }

  checkDragonDepartures(dragons: DragonState[], maxStayTurns: number): DragonState[] {
    return dragons.filter(d => d.isAlive && d.turnCounter >= maxStayTurns);
  }
}

function buildRespawnPools(dragons: DragonState[], nextTurn: number): {
  liveByTemplate: Map<string, number>;
  readyByTemplate: Map<string, DragonState[]>;
} {
  const liveByTemplate = new Map<string, number>();
  const readyByTemplate = new Map<string, DragonState[]>();

  for (const dragon of dragons) {
    if (dragon.isAlive || (dragon.respawnAvailableTurn !== null && dragon.respawnAvailableTurn > nextTurn)) {
      liveByTemplate.set(dragon.templateId, (liveByTemplate.get(dragon.templateId) ?? 0) + 1);
      continue;
    }
    if (dragon.respawnAvailableTurn !== null && dragon.respawnAvailableTurn <= nextTurn) {
      if (!readyByTemplate.has(dragon.templateId)) readyByTemplate.set(dragon.templateId, []);
      readyByTemplate.get(dragon.templateId)!.push(dragon);
    }
  }

  return { liveByTemplate, readyByTemplate };
}
