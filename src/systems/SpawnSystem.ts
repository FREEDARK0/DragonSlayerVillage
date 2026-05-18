import { GameState } from '../core/GameState';
import { OctagonBoard } from '../core/OctagonBoard';
import { DragonState, createDragon, resetDragonForSpawn } from '../models/Dragon';
import { DragonTemplate, getAvailableDragons } from '../config/dragonTypes';
import { createBlock, createPowerStone } from '../models/Block';
import { BlockType } from '../config/blockTypes';
import { defaultRandomSource, RandomSource, randomShuffle, randomWeightedPick } from '../utils/random';
import { RelicSystem } from './RelicSystem';

export class SpawnSystem {
  constructor(private random: RandomSource = defaultRandomSource) {}

  /** 初始布局：3金矿 + 2木墙 + 3空，村庄在中心 */
  initMap(board: OctagonBoard): number {
    const indices = randomShuffle([0,1,2,3,4,5,6,7], this.random);
    for (let i = 0; i < 3; i++) board.setSector(indices[i], createPowerStone(this.random.int(1, 20)));
    for (let i = 3; i < 5; i++) board.setSector(indices[i], createBlock(BlockType.WOOD_WALL));
    return 0;
  }

  replenishBlock(board: OctagonBoard, sector: number): void {
    if (board.isEmpty(sector)) {
      const types = [BlockType.KNIGHT, BlockType.MAGE, BlockType.WIZARD];
      board.setSector(sector, createBlock(this.random.pick(types)));
    }
  }

  spawnDragons(
    turnNumber: number,
    countRange: [number, number],
    existingDragons: DragonState[],
    nextTurn: number = 1,
    preferredEdge?: (template: DragonTemplate, usedEdges: Set<number>) => number | null,
  ): DragonState[] {
    const newDragons: DragonState[] = [];
    const available = getAvailableDragons(turnNumber);
    if (available.length === 0) return newDragons;
    const count = this.random.int(countRange[0], countRange[1]);
    const needed = count - existingDragons.filter(d => d.isAlive).length;
    if (needed <= 0) return newDragons;
    const usedEdges = new Set(existingDragons.filter(d => d.isAlive).map(d => d.edgeIndex));
    const { liveByTemplate, readyByTemplate } = buildRespawnPools(existingDragons, nextTurn);
    for (let i = 0; i < needed; i++) {
      const candidates = available.filter(t => (liveByTemplate.get(t.id) ?? 0) < t.quantity);
      if (candidates.length === 0) break;
      const free = [0,1,2,3,4,5,6,7].filter(e => !usedEdges.has(e));
      if (free.length === 0) break;
      const template = randomWeightedPick(candidates, candidates.map(d => d.spawnWeight), this.random);
      const preferred = preferredEdge?.(template, usedEdges);
      const edge = preferred !== null && preferred !== undefined && !usedEdges.has(preferred)
        ? preferred
        : this.random.pick(free);
      usedEdges.add(edge);
      liveByTemplate.set(template.id, (liveByTemplate.get(template.id) ?? 0) + 1);
      const reusable = readyByTemplate.get(template.id)?.shift();
      if (reusable) {
        resetDragonForSpawn(reusable, template, edge);
        newDragons.push(reusable);
      } else {
        newDragons.push(createDragon(template, edge));
      }
    }
    return newDragons;
  }

  checkDragonDepartures(dragons: DragonState[], maxStayTurns: number): DragonState[] {
    return dragons.filter(d => d.isAlive && d.turnCounter >= maxStayTurns);
  }
}

export function initMapForState(state: GameState, spawnSystem: SpawnSystem = new SpawnSystem()): number {
  const villageSector = spawnSystem.initMap(state.board);
  state.board.forEach(block => {
    if (block) RelicSystem.applyGeneratedBlockModifiers(state, block);
  });
  return villageSector;
}

export function buildRespawnPools(dragons: DragonState[], nextTurn: number): {
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
