import { GameState, GamePhase } from './GameState';
import { getPhaseParams } from '../config/phaseConfig';
import { EventBus } from './EventBus';

export class PhaseManager {
  constructor(private state: GameState) {}

  /** 初始化第一年的平静期 */
  initPhase(): void {
    const params = getPhaseParams(this.state.year);
    this.state.turnsInPhase = 0;
    this.state.phase = GamePhase.CALM;
    EventBus.emit('phaseChanged', {
      phase: this.state.phase,
      year: this.state.year,
      message: '第 1 年 · 平静期 — 收集资源，准备迎战！',
    });
  }

  /** 推进回合并检查是否需要切换阶段 */
  advanceTurn(): boolean {
    this.state.turnsInPhase++;
    const params = getPhaseParams(this.state.year);
    let phaseChanged = false;

    switch (this.state.phase) {
      case GamePhase.CALM:
        if (this.state.turnsInPhase >= params.calmTurns) {
          this.transitionTo(GamePhase.HARASSMENT);
          phaseChanged = true;
        }
        break;

      case GamePhase.HARASSMENT:
        if (this.state.turnsInPhase >= params.harassmentTurns) {
          this.transitionTo(GamePhase.DECISIVE_BATTLE);
          phaseChanged = true;
        }
        break;

      case GamePhase.DECISIVE_BATTLE:
        this.state.decisiveBattleSurvivalTurns++;
        break;
    }

    return phaseChanged;
  }

  /** 检查决战期是否可以结束 */
  checkDecisiveBattleEnd(): 'all_dead' | 'survived' | null {
    if (this.state.phase !== GamePhase.DECISIVE_BATTLE) return null;

    const params = getPhaseParams(this.state.year);
    const allDead = this.state.aliveDragons.length === 0;

    if (allDead) return 'all_dead';
    if (this.state.decisiveBattleSurvivalTurns >= params.survivalTurnsForVictory) return 'survived';
    return null;
  }

  /** 结束决战期，进入新年过渡 */
  endDecisiveBattle(result: 'all_dead' | 'survived'): void {
    const msg = result === 'all_dead'
      ? '所有龙被击败！决战胜利！'
      : '成功撑过龙群袭击！';
    this.state.addMessage(msg);
    this.transitionTo(GamePhase.YEAR_TRANSITION);
  }

  /** 新年过渡后进入下一年平静期 */
  advanceYear(): void {
    this.state.year++;
    this.state.decisiveBattleSurvivalTurns = 0;
    this.state.turnsInPhase = 0;
    this.state.phase = GamePhase.CALM;
    EventBus.emit('yearChanged', { year: this.state.year });
    EventBus.emit('phaseChanged', {
      phase: GamePhase.CALM,
      year: this.state.year,
      message: `第 ${this.state.year} 年 · 平静期 — 龙群可能会更强...`,
    });
  }

  /** 触发游戏结束 */
  triggerGameOver(reason: string): void {
    this.state.gameOver = true;
    this.state.gameOverReason = reason;
    this.state.phase = GamePhase.GAME_OVER;
    EventBus.emit('gameOver', { reason });
  }

  private transitionTo(phase: GamePhase): void {
    this.state.phase = phase;
    this.state.turnsInPhase = 0;

    const phaseNames: Record<string, string> = {
      calm: '平静期',
      harassment: '骚扰期',
      decisive_battle: '决战期',
      year_transition: '新年',
      game_over: '游戏结束',
    };

    EventBus.emit('phaseChanged', {
      phase,
      year: this.state.year,
      message: `第 ${this.state.year} 年 · ${phaseNames[phase] || phase}`,
    });
  }
}
