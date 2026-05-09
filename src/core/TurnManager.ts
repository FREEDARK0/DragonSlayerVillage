import { GameState, TurnState, GamePhase } from './GameState';
import { PhaseManager } from './PhaseManager';
import { VisionFrame } from '../models/VisionFrame';
import { MovementSystem } from '../systems/MovementSystem';
import { VisionSystem } from '../systems/VisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { WinLossSystem } from '../systems/WinLossSystem';
import { DragonAI } from '../ai/DragonAI';
import { DragonState, dragonShouldLeave } from '../models/Dragon';
import { getPhaseParams } from '../config/phaseConfig';
import { EventBus } from './EventBus';
import { Direction, ALL_DIRECTIONS, directionToDelta } from '../utils/Direction';
import { GridPosition } from '../utils/GridPosition';
import { BlockType } from '../config/blockTypes';

export class TurnManager {
  private movementSystem = new MovementSystem();
  private visionSystem = new VisionSystem();
  private combatSystem = new CombatSystem();
  private spawnSystem = new SpawnSystem();
  private winLossSystem = new WinLossSystem();
  private dragonAI = new DragonAI();

  constructor(
    private state: GameState,
    private phaseManager: PhaseManager,
  ) {}

  /** 初始化游戏世界 */
  initWorld(): void {
    const { hero, heroPos } = this.spawnSystem.initMap(this.state.grid);
    this.state.hero = hero;
    this.state.heroPos = heroPos;
    this.phaseManager.initPhase();
  }

  /** 玩家确认视野框后的完整回合执行 */
  executeTurn(frame: VisionFrame): void {
    this.state.turnState = TurnState.EXECUTING_TURN;
    this.state.visionFrame = frame;

    // 准备剑方块生成所需的龙信息
    const dragonIds = this.state.aliveDragons.map(d => d.id);
    const dragonColors = this.state.aliveDragons.map(d => d.color);

    // 1. 视野效果应用
    this.visionSystem.applyFrameEffects(frame, this.state.grid, this.state.heroPos);

    // 如果玩家在视野框内，吸收效果
    if (this.visionSystem.isHeroInFrame(frame, this.state.heroPos)) {
      const effectDetails = this.visionSystem.applyBlockEffectsToHero(
        frame, this.state.grid, this.state.hero, this.state.aliveDragons,
      );
      for (const d of effectDetails) {
        this.state.addMessage(d.message);
        EventBus.emit('visionEffectApplied', { position: d.position, message: d.message, color: d.color });
      }

      // 与小鬼交战
      const impDetails = this.visionSystem.fightImpsInFrame(frame, this.state.grid, this.state.hero);
      for (const d of impDetails) {
        this.state.addMessage(d.message);
        EventBus.emit('visionEffectApplied', { position: d.position, message: d.message, color: d.color });
      }
      // 与魔眼交战
      const eyeDetails = this.visionSystem.fightEvilEyesInFrame(frame, this.state.grid, this.state.hero);
      for (const d of eyeDetails) {
        this.state.addMessage(d.message);
        EventBus.emit('visionEffectApplied', { position: d.position, message: d.message, color: d.color });
      }
    }

    // 2. 玩家移动（按方向走1格，不依赖网格方块）
    this.moveHero();
    // 小鬼移动
    this.movementSystem.moveAllCharacters(this.state.grid, this.state.heroPos);

    // 移动后方向检查
    this.ensureValidDirections();

    // 魔眼每回合数值-1
    this.decayEvilEyes();

    // 3. 进入敌方回合
    this.state.turnState = TurnState.ENEMY_TURN;
    EventBus.emit('enemyTurnStart', {});

    // 4. 龙AI执行
    const params = getPhaseParams(this.state.year);
    const decisions = this.dragonAI.executeTurn(
      this.state.aliveDragons,
      this.state.grid,
      this.state.hero,
      this.state.heroPos,
    );

    for (const dec of decisions) {
      this.state.addMessage(dec.description);
    }

    // 5. 检查龙的离开
    const departing = this.state.dragons.filter(d =>
      d.isAlive && dragonShouldLeave(d, this.state.phase) && this.state.phase !== GamePhase.DECISIVE_BATTLE
    );
    for (const d of departing) {
      d.isAlive = false;
      this.state.addMessage(`${d.name} 离开了`);
    }

    // 6. 补充被销毁的方块
    for (let r = 0; r < this.state.grid.size; r++) {
      for (let c = 0; c < this.state.grid.size; c++) {
        const pos = new GridPosition(r, c);
        if (this.state.grid.isEmpty(pos)) {
          this.spawnSystem.replenishBlock(this.state.grid, pos, dragonIds, dragonColors);
          EventBus.emit('blockReplenished', { position: pos });
        }
      }
    }

    // 7. 检查阶段转换
    this.phaseManager.advanceTurn();

    // 检查决战期结束
    const battleResult = this.phaseManager.checkDecisiveBattleEnd();
    if (battleResult) {
      this.phaseManager.endDecisiveBattle(battleResult);
    }

    // 8. 检查游戏结束
    const gameOverReason = this.winLossSystem.checkGameOver(this.state.hero);
    if (gameOverReason) {
      this.phaseManager.triggerGameOver(gameOverReason);
      return;
    }

    // 9. 处理阶段特定的龙刷新
    this.handleDragonSpawning();

    // 10. 龙回合计数增加
    for (const d of this.state.aliveDragons) {
      d.turnCounter++;
    }

    this.state.turnNumber++;
    this.state.turnState = TurnState.WAITING_FOR_INPUT;
    EventBus.emit('turnComplete', { turnNumber: this.state.turnNumber });
  }

  /** 根据阶段生成或移除龙 */
  private handleDragonSpawning(): void {
    const params = getPhaseParams(this.state.year);

    switch (this.state.phase) {
      case GamePhase.CALM:
        // 平静期无龙或极少龙
        break;

      case GamePhase.HARASSMENT:
        // 骚扰期：可能新龙来，检查现有龙是否需要离开
        if (this.state.aliveDragons.length < params.dragonsInHarassment[1]) {
          if (Math.random() < 0.4) {
            const newDragons = this.spawnSystem.spawnDragons(
              this.state.year,
              'harassment',
              [1, 1],
              this.state.dragons.filter(d => d.isAlive),
            );
            for (const d of newDragons) {
              this.state.dragons.push(d);
              this.state.addMessage(`${d.name} 出现了！`);
              EventBus.emit('dragonAppeared', { dragon: d });
            }
          }
        }
        // 检查停留超时
        const departures = this.spawnSystem.checkDragonDepartures(
          this.state.aliveDragons,
          params.dragonMaxStayTurns,
        );
        for (const d of departures) {
          if (dragonShouldLeave(d, this.state.phase)) {
            d.isAlive = false;
            this.state.addMessage(`${d.name} 离开了`);
          }
        }
        break;

      case GamePhase.DECISIVE_BATTLE:
        // 决战期：确保有龙在场
        if (this.state.aliveDragons.length === 0) {
          const newDragons = this.spawnSystem.spawnDragons(
            this.state.year,
            'decisive_battle',
            params.dragonsInBattle,
            [],
          );
          for (const d of newDragons) {
            this.state.dragons.push(d);
            this.state.addMessage(`${d.name} 气势汹汹地袭来！`);
            EventBus.emit('dragonAppeared', { dragon: d });
          }
        }
        break;
    }
  }

  /** 处理新年过渡 */
  handleYearTransition(): void {
    this.phaseManager.advanceYear();
  }

  /** 玩家移动：按方向走1格（不占网格，自由移动） */
  private moveHero(): void {
    const delta = directionToDelta(this.state.hero.direction);
    const target = this.state.heroPos.add(delta.dr, delta.dc);
    if (this.state.grid.isInBounds(target)) {
      this.state.heroPos = target;
    } else {
      // 边缘换向并尝试移动
      const valid = ALL_DIRECTIONS.filter(d => {
        const dd = directionToDelta(d);
        return this.state.grid.isInBounds(this.state.heroPos.add(dd.dr, dd.dc));
      });
      if (valid.length > 0) {
        this.state.hero.direction = valid[Math.floor(Math.random() * valid.length)];
        const nd = directionToDelta(this.state.hero.direction);
        this.state.heroPos = this.state.heroPos.add(nd.dr, nd.dc);
      }
    }
  }

  /** 魔眼每回合数值-1，归零销毁 */
  private decayEvilEyes(): void {
    const eyes = this.state.grid.findAll(c => c.block?.type === BlockType.EVIL_EYE);
    for (const cell of eyes) {
      const block = cell.block!;
      block.value -= 1;
      if (block.value <= 0) {
        this.state.grid.removeBlock(cell.position);
        EventBus.emit('blockDestroyed', { position: cell.position, blockType: BlockType.EVIL_EYE, value: 0 });
      }
    }
  }

  /** 移动后检查：小鬼在边缘时换向，玩家方向在 moveHero 中处理 */
  private ensureValidDirections(): void {
    const grid = this.state.grid;
    const impCells = grid.findAll(c => c.block !== null && c.block.type === BlockType.IMP);
    for (const cell of impCells) {
      const imp = cell.block!;
      if (!imp.direction) continue;
      const iDelta = directionToDelta(imp.direction);
      const iNext = cell.position.add(iDelta.dr, iDelta.dc);
      if (!grid.isInBounds(iNext)) {
        const valid = ALL_DIRECTIONS.filter(d => {
          const dd = directionToDelta(d);
          const t = cell.position.add(dd.dr, dd.dc);
          if (!grid.isInBounds(t)) return false;
          const tc = grid.getCell(t);
          return tc && (tc.block === null || tc.block.type === BlockType.EMPTY);
        });
        if (valid.length > 0) {
          imp.direction = valid[Math.floor(Math.random() * valid.length)];
        }
      }
    }
  }
}
