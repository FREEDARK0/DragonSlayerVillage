import { GameState, TurnState } from './GameState';
import { SpawnSystem } from '../systems/SpawnSystem';
import { DragonAI } from '../ai/DragonAI';
import { dragonTakeDamage, createDragon } from '../models/Dragon';
import { getAvailableDragons } from '../config/dragonTypes';
import { EventBus } from './EventBus';
import { BlockType } from '../config/blockTypes';
import { SECTOR_COUNT } from '../utils/SectorUtils';
import { weightedPick } from '../utils/random';

function getMaxDragons(turn: number): number {
  if (turn <= 3) return 1;
  if (turn <= 10) return 2;
  return 3;
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
    const rotSteps = this.state.turnRotationSteps;

    // 村庄 +1 / 升级检测（村庄在中心小八边形）
    this.state.board.villagePower += 1;
    this.prevVillagePower = this.state.board.villagePower;

    // 骑士 + 法师
    this.state.board.forEach((b) => {
      if (b?.type === BlockType.KNIGHT) { b.power += Math.abs(rotSteps); b.value += Math.abs(rotSteps); }
    });
    this.state.board.forEach((b, i) => {
      if (b?.type !== BlockType.MAGE) return;
      const left = this.state.board.getSector((i - 1 + 8) % 8);
      const right = this.state.board.getSector((i + 1) % 8);
      const dmg = b.power + (left?.power ?? 0) + (right?.power ?? 0);
      for (const edgeIdx of [i, (i + 1) % 8]) {
        const dragon = this.state.aliveDragons.find(d => d.edgeIndex === edgeIdx);
        if (dragon) {
          dragonTakeDamage(dragon, dmg);
          this.state.addMessage(`法师对 ${dragon.name} 造成 ${dmg} 伤害`);
          if (!dragon.isAlive) EventBus.emit('dragonDied', { dragonId: dragon.id });
        }
      }
    });

    // 敌方回合
    this.state.turnState = TurnState.ENEMY_TURN;
    EventBus.emit('enemyTurnStart', {});
    const decisions = this.dragonAI.executeTurn(this.state.aliveDragons, this.state.board, this.state.rotationAngle);
    for (const dec of decisions) this.state.addMessage(dec.description);
    this.dragonAI.handlePostTurn(this.state.dragons, this.state.board, this.state.board.villagePower);

    // 村庄检查
    if (this.state.board.villagePower <= 0) {
      EventBus.emit('gameOver', { reason: 'village_destroyed' });
      return;
    }

    // 龙生成
    this.spawnDragonsByTurn();
    if (this.state.turnNumber > 0 && this.state.turnNumber % 30 === 0) this.state.year++;

    // 黑夜更新：旋转 + 每2回合变长
    this.state.nightStartSector = (this.state.nightStartSector + 1) % 8;
    if (this.state.turnNumber % 2 === 1) {
      if (this.state.nightGrowing) {
        this.state.nightLength++;
        if (this.state.nightLength >= 4) this.state.nightGrowing = false;
      } else {
        this.state.nightLength--;
        if (this.state.nightLength <= 1) this.state.nightGrowing = true;
      }
    }

    for (const d of this.state.aliveDragons) d.turnCounter++;
    this.state.turnNumber++;
    this.state.turnRotationSteps = 0;
    this.state.turnState = TurnState.WAITING_FOR_INPUT;
    EventBus.emit('turnComplete', { turnNumber: this.state.turnNumber });
  }

  triggerBlockEffects(sectors: number[]): void {
    for (const s of sectors) {
      const block = this.state.board.getSector(s);
      if (!block || block.type !== BlockType.POWER_STONE || block.value > 0) continue;
      this.state.board.villagePower += block.power;
      this.state.addMessage(`战力石 +${block.power} → 村庄`);
    }
  }

  private spawnDragonsByTurn(): void {
    const nextTurn = this.state.turnNumber + 1;
    const maxD = getMaxDragons(nextTurn);
    const alive = this.state.aliveDragons;
    if (alive.length >= maxD) return;

    const available = getAvailableDragons(this.state.year);
    if (available.length === 0) return;

    // 去除已有同名龙
    const existingNames = new Set(alive.map(d => d.name));
    const candidates = available.filter(t => !existingNames.has(t.name));
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
