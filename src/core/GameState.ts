import { OctagonBoard } from './OctagonBoard';
import { EventBus } from './EventBus';
import { HeroState } from '../models/Hero';
import { DragonState } from '../models/Dragon';
import type { RhythmState } from '../systems/RhythmSystem';

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
  nightStart: number = 0;
  nightLength: number = 4;
  nightGrowing: boolean = false;

  turnState: TurnState = TurnState.WAITING_FOR_INPUT;
  turnNumber: number = 0;
  year: number = 1;
  skipRemainingDragonActions: boolean = false;
  rhythm: RhythmState | null = null;

  messages: string[] = [];
  gameOver: boolean = false;
  gameOverReason: string = '';

  constructor() { this.board = new OctagonBoard(); }

  get aliveDragons(): DragonState[] { return this.dragons.filter(d => d.isAlive); }

  addMessage(msg: string): void {
    this.messages.unshift(msg);
    if (this.messages.length > 5) this.messages.length = 5;
  }

  applyVillageHpDelta(delta: number): void {
    this.board.villageHp += delta;
    if (delta < 0) {
      EventBus.emit('villageDamaged', { damage: -delta, hp: this.board.villageHp });
    }
  }

  applyVillageGoldDelta(delta: number): void {
    this.board.villageGold += delta;
  }
}
