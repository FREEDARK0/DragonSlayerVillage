import { OctagonBoard } from './OctagonBoard';
import { HeroState } from '../models/Hero';
import { DragonState } from '../models/Dragon';

export enum TurnState {
  WAITING_FOR_INPUT = 'waiting_for_input',
  EXECUTING_TURN = 'executing_turn',
  ENEMY_TURN = 'enemy_turn',
}

export class GameState {
  board: OctagonBoard;
  hero: HeroState = { heroSector: 0 };
  dragons: DragonState[] = [];
  rotationAngle: number = 0;
  turnRotationSteps: number = 0;

  /** 黑夜系统（外部楔形） */
  nightStart: number = 0;   // 黑夜起始扇形（X轴下方4个扇区0,1,2,3）
  nightLength: number = 4;  // 当前长度
  nightGrowing: boolean = false; // false=收缩, true=增长

  turnState: TurnState = TurnState.WAITING_FOR_INPUT;
  turnNumber: number = 0;
  year: number = 1;
  villagePowerDecreaseEventsInBattle: number = 0;
  villagePowerDecreaseEventsForPlacement: number = 0;
  skipRemainingDragonActions: boolean = false;

  messages: string[] = [];
  gameOver: boolean = false;
  gameOverReason: string = '';

  constructor() { this.board = new OctagonBoard(); }

  get aliveDragons(): DragonState[] { return this.dragons.filter(d => d.isAlive); }

  addMessage(msg: string): void {
    this.messages.unshift(msg);
    if (this.messages.length > 5) this.messages.length = 5;
  }

  applyVillagePowerDelta(delta: number, phase: 'battle' | 'placement'): void {
    this.board.villagePower += delta;
    if (delta >= 0) return;
    if (phase === 'battle') this.villagePowerDecreaseEventsInBattle++;
    else this.villagePowerDecreaseEventsForPlacement++;
  }

  beginBattleVillagePowerTracking(): void {
    this.villagePowerDecreaseEventsInBattle = 0;
  }

  finalizeBattleVillagePowerTracking(): void {
    this.villagePowerDecreaseEventsForPlacement = this.villagePowerDecreaseEventsInBattle;
    this.villagePowerDecreaseEventsInBattle = 0;
  }
}
