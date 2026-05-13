import { GameState, TurnState } from './GameState';
import { SpawnSystem } from '../systems/SpawnSystem';
import { DragonAI } from '../ai/DragonAI';
import { createDragon } from '../models/Dragon';
import { getAvailableDragons } from '../config/dragonTypes';
import { EventBus } from './EventBus';
import { weightedPick } from '../utils/random';
import { createEffectContext } from '../effects/EffectContext';
import { calculateVillageIncome, getBlockEffect } from '../effects/BlockEffectRegistry';

function getMaxDragons(turn: number): number {
  if (turn <= 3) return 2;
  if (turn <= 9) return 3;
  if (turn <= 15) return 5;
  return Number.POSITIVE_INFINITY;
}

export class TurnManager {
  private spawnSystem = new SpawnSystem();
  private dragonAI = new DragonAI();
  private prevVillagePower = 50;

  constructor(private state: GameState) {}

  initWorld(): void {
    const villageSector = this.spawnSystem.initMap(this.state.board);
    this.state.hero.heroSector = villageSector;
    this.prevVillagePower = 50;
  }

  executeTurn(): void {
    this.state.turnState = TurnState.EXECUTING_TURN;
    const ctx = createEffectContext(this.state);

    const gain = calculateVillageIncome(ctx);
    this.state.board.villagePower += gain;
    this.prevVillagePower = this.state.board.villagePower;

    this.state.board.forEach((block, sector) => {
      if (!block) return;
      getBlockEffect(block.type)?.onPlayerPhase?.(block, sector, ctx);
    });
    this.state.board.forEach((block, sector) => {
      if (!block) return;
      getBlockEffect(block.type)?.onCooldown?.(block, sector, ctx);
    });

    this.state.turnState = TurnState.ENEMY_TURN;
    EventBus.emit('enemyTurnStart', {});
    const decisions = this.dragonAI.executeTurn(this.state);
    for (const dec of decisions) this.state.addMessage(dec.description);
    this.dragonAI.handlePostTurn(this.state);

    // 村庄检查
    if (this.state.board.villagePower <= 0) {
      EventBus.emit('gameOver', { reason: 'village_destroyed' });
      return;
    }

    // 龙生成
    this.spawnDragonsByTurn();
    if (this.state.turnNumber > 0 && this.state.turnNumber % 30 === 0) this.state.year++;

    // 黑夜伸缩：每次减/增 2 个扇区
    if (!this.state.nightGrowing) {
      this.state.nightStart = (this.state.nightStart + 2) % 8;
      this.state.nightLength -= 2;
      if (this.state.nightLength <= 0) {
        this.state.nightGrowing = true;
        this.state.nightStart = 4;
        this.state.nightLength = 0;
      }
    } else {
      this.state.nightLength += 2;
      if (this.state.nightLength >= 8) {
        this.state.nightGrowing = false;
        this.state.nightStart = 4;
        this.state.nightLength = 8;
      }
    }

    for (const d of this.state.aliveDragons) d.turnCounter++;
    this.state.turnNumber++;
    this.state.turnRotationSteps = 0;
    this.state.turnState = TurnState.WAITING_FOR_INPUT;
    EventBus.emit('turnComplete', { turnNumber: this.state.turnNumber });
  }

  triggerBlockEffects(sectors: number[]): void {
    const ctx = createEffectContext(this.state);
    for (const sector of sectors) {
      const block = this.state.board.getSector(sector);
      if (!block) continue;
      getBlockEffect(block.type)?.onDestroyed?.(block, sector, ctx);
    }
  }

  private spawnDragonsByTurn(): void {
    const nextTurn = this.state.turnNumber + 1;
    const maxD = getMaxDragons(nextTurn);
    const alive = this.state.aliveDragons;
    if (alive.length >= maxD) return;

    const available = getAvailableDragons(this.state.year);
    if (available.length === 0) return;

    // Allow multiple copies up to each template's quantity limit.
    const liveByTemplate = new Map<string, number>();
    for (const dragon of alive) {
      liveByTemplate.set(dragon.templateId, (liveByTemplate.get(dragon.templateId) ?? 0) + 1);
    }
    const candidates = available.filter(t => (liveByTemplate.get(t.id) ?? 0) < t.quantity);
    if (candidates.length === 0) return;

    // 去除已被占用的边
    const usedEdges = new Set(alive.map(d => d.edgeIndex));
    const free = [0,1,2,3,4,5,6,7].filter(e => !usedEdges.has(e));
    if (free.length === 0) return;

    const edge = free[Math.floor(Math.random() * free.length)];
    const template = weightedPick(candidates, candidates.map(d => d.spawnWeight));
    const nd = createDragon(template, this.state.year, edge);
    this.state.dragons.push(nd);
    this.state.addMessage(`${nd.name} 出现了！`);
    EventBus.emit('dragonAppeared', { dragon: nd });
  }
}
