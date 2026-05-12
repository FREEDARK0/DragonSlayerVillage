import { GameState, TurnState } from './GameState';
import { SpawnSystem } from '../systems/SpawnSystem';
import { DragonAI } from '../ai/DragonAI';
import { dragonTakeDamage, createDragon } from '../models/Dragon';
import { getAvailableDragons } from '../config/dragonTypes';
import { EventBus } from './EventBus';
import { BlockType, getVillageLevel } from '../config/blockTypes';
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

    // 村庄 +5/回合 + 矿厂加成
    let gain = 5;
    this.state.board.forEach((b) => {
      if (b?.type === BlockType.MINE) {
        const level = getVillageLevel(this.state.board.villagePower);
        gain += level >= 2 ? 6 : level >= 1 ? 4 : 2;
      }
    });
    this.state.board.villagePower += gain;
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

    // ── 巨弩先攻 ──
    for (let i = 0; i < 8; i++) {
      const b = this.state.board.getSector(i);
      if (!b || b.type !== BlockType.BALLISTA || b.cooldown > 0) continue;
      const level = getVillageLevel(this.state.board.villagePower);
      const mult = level >= 1 ? 3 : 2;
      const dmg = b.power * mult;
      const dragon = this.state.aliveDragons.find(d => d.edgeIndex === i);
      if (dragon) {
        dragonTakeDamage(dragon, dmg);
        this.state.addMessage(`巨弩对 ${dragon.name} 造成 ${dmg} 伤害`);
        b.cooldown = level >= 2 ? 1 : 2;
        if (!dragon.isAlive) EventBus.emit('dragonDied', { dragonId: dragon.id });
      }
    }
    // CD -1 & 压力石更新
    for (let i = 0; i < 8; i++) {
      const b = this.state.board.getSector(i);
      if (b && b.cooldown > 0) b.cooldown--;
      if (b && b.type === BlockType.PRESSURE_STONE) {
        let total = 0;
        for (const si of [i, (i - 1 + 8) % 8, (i + 1) % 8]) {
          const dragon = this.state.aliveDragons.find(d => d.edgeIndex === si);
          if (dragon) total += dragon.combatPower;
        }
        b.power = Math.round(total * 0.2);
        b.value = b.power;
      }
    }

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

    // 黑夜伸缩：收缩从逆时针端移除，增长向顺时针端延伸
    if (!this.state.nightGrowing) {
      // 收缩：逆时针端前进，长度-1
      this.state.nightStart = (this.state.nightStart + 1) % 8;
      this.state.nightLength--;
      if (this.state.nightLength <= 0) {
        this.state.nightGrowing = true;
        this.state.nightStart = 4; // 从扇区4开始顺时针增长
      }
    } else {
      // 增长：顺时针端延伸，长度+1
      this.state.nightLength++;
      if (this.state.nightLength >= 8) {
        this.state.nightGrowing = false;
        this.state.nightStart = 4; // 从扇区4开始逆时针收缩
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
