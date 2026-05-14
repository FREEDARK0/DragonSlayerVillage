import { GameState, TurnState } from './GameState';
import { SpawnSystem, buildRespawnPools } from '../systems/SpawnSystem';
import { DragonAI, highestAttackFriendlySector, nearestFreeEdge } from '../ai/DragonAI';
import { createDragon, markDragonDeparted, resetDragonForSpawn, DragonState } from '../models/Dragon';
import { getAvailableDragons, DragonPersonalityType } from '../config/dragonTypes';
import { EventBus } from './EventBus';
import { weightedPick } from '../utils/random';
import { createEffectContext } from '../effects/EffectContext';
import { calculateVillageIncome, runBlockTurnEnd, runBlockTurnStart, runFriendlyAttacks } from '../effects/BlockEffectRegistry';
import { DragonTemplate } from '../config/dragonTypes';
import { dragonBehaviorHasExplicitLeaveCondition } from '../effects/DragonBehaviorRegistry';

function getMaxDragons(turn: number): number {
  if (turn <= 3) return 2;
  if (turn <= 9) return 3;
  if (turn <= 15) return 5;
  return Number.POSITIVE_INFINITY;
}

export class TurnManager {
  private spawnSystem = new SpawnSystem();
  private dragonAI = new DragonAI();
  onTurnStarted: (() => void) | null = null;

  constructor(private state: GameState) {}

  initWorld(): void {
    const villageSector = this.spawnSystem.initMap(this.state.board);
    this.state.hero.heroSector = villageSector;
  }

  async executeTurn(): Promise<void> {
    this.state.turnState = TurnState.EXECUTING_TURN;
    this.state.skipRemainingDragonActions = false;
    const ctx = createEffectContext(this.state);

    const gain = calculateVillageIncome(ctx);
    this.state.applyVillageGoldDelta(gain);
    this.state.addMessage(`金币 +${gain}`);

    runBlockTurnStart(ctx);
    runFriendlyAttacks(ctx);

    this.state.turnState = TurnState.ENEMY_TURN;
    EventBus.emit('enemyTurnStart', {});
    const decisions = await this.dragonAI.executeTurn(this.state);
    for (const dec of decisions) this.state.addMessage(dec.description);
    this.dragonAI.handlePostTurn(this.state);

    if (this.state.board.villageHp <= 0) {
      EventBus.emit('gameOver', { reason: 'village_destroyed' });
      return;
    }

    this.spawnDragonsByTurn();
    if (this.state.turnNumber > 0 && this.state.turnNumber % 30 === 0) this.state.year++;

    const nextNight = this.previewNextNightState();
    await this.handleDefaultNightDepartures(nextNight);
    this.state.nightStart = nextNight.start;
    this.state.nightLength = nextNight.length;
    this.state.nightGrowing = nextNight.growing;

    for (const d of this.state.aliveDragons) d.turnCounter++;
    runBlockTurnEnd(ctx);
    this.state.skipRemainingDragonActions = false;
    this.state.turnNumber++;
    this.state.turnRotationSteps = 0;
    this.state.turnState = TurnState.WAITING_FOR_INPUT;
    this.onTurnStarted?.();
    EventBus.emit('turnComplete', { turnNumber: this.state.turnNumber });
  }

  private spawnDragonsByTurn(): void {
    const nextTurn = this.state.turnNumber + 1;
    const maxD = getMaxDragons(nextTurn);
    const alive = this.state.aliveDragons;
    if (alive.length >= maxD) return;

    const available = getAvailableDragons(nextTurn);
    if (available.length === 0) return;

    const { liveByTemplate, readyByTemplate } = buildRespawnPools(this.state.dragons, nextTurn);
    const candidates = available.filter(t => (liveByTemplate.get(t.id) ?? 0) < t.quantity);
    if (candidates.length === 0) return;

    const usedEdges = new Set(alive.map(d => d.edgeIndex));
    const free = [0,1,2,3,4,5,6,7].filter(e => !usedEdges.has(e));
    if (free.length === 0) return;

    const template = weightedPick(candidates, candidates.map(d => d.spawnWeight));
    const edge = this.chooseSpawnEdge(template, usedEdges, free);
    const nd = this.spawnOrReuseDragon(template, edge, readyByTemplate);
    this.state.addMessage(`${nd.name} 出现了！`);
    EventBus.emit('dragonAppeared', { dragon: nd });
  }

  private chooseSpawnEdge(template: DragonTemplate, usedEdges: Set<number>, free: number[]): number {
    if (template.personality === DragonPersonalityType.ARROGANT) {
      const ctx = createEffectContext(this.state);
      const targetSector = highestAttackFriendlySector(ctx);
      if (targetSector !== null) {
        const edge = nearestFreeEdge(targetSector, this.state.aliveDragons);
        if (edge !== null && !usedEdges.has(edge)) return edge;
      }
    }
    return free[Math.floor(Math.random() * free.length)];
  }

  private spawnOrReuseDragon(template: DragonTemplate, edgeIndex: number, readyByTemplate: Map<string, DragonState[]>): DragonState {
    const reusable = readyByTemplate.get(template.id)?.shift();
    if (reusable) {
      resetDragonForSpawn(reusable, template, edgeIndex);
      return reusable;
    }

    const dragon = createDragon(template, edgeIndex);
    this.state.dragons.push(dragon);
    return dragon;
  }

  private previewNextNightState(): { start: number; length: number; growing: boolean } {
    let start = this.state.nightStart;
    let length = this.state.nightLength;
    let growing = this.state.nightGrowing;

    if (!growing) {
      start = (start + 2) % 8;
      length -= 2;
      if (length <= 0) {
        growing = true;
        start = 4;
        length = 0;
      }
    } else {
      length += 2;
      if (length >= 8) {
        growing = false;
        start = 4;
        length = 8;
      }
    }

    return { start, length, growing };
  }

  private async handleDefaultNightDepartures(nextNight: { start: number; length: number }): Promise<void> {
    const departing = this.state.aliveDragons.filter(dragon => {
      if (dragonBehaviorHasExplicitLeaveCondition(dragon.personality)) return false;
      if (sectorInNight(dragon.edgeIndex, this.state.nightStart, this.state.nightLength)) return false;
      return sectorInNight(dragon.edgeIndex, nextNight.start, nextNight.length);
    });
    if (departing.length === 0) return;

    for (const dragon of departing) {
      this.state.addMessage(`${dragon.name}离开`);
      EventBus.emit('dragonDeparting', { dragonId: dragon.id, name: dragon.name });
    }
    await waitForTurnAnimation(260);
    for (const dragon of departing) markDragonDeparted(dragon);
  }
}

function sectorInNight(sector: number, start: number, length: number): boolean {
  for (let i = 0; i < length; i++) {
    if ((start + i) % 8 === sector) return true;
  }
  return false;
}

function waitForTurnAnimation(ms: number): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
