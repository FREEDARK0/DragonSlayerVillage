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

  /** 村庄（中心小八边形，不在扇区中） */
  villagePower: number = 50;
  villageLevel: number = 0;

  /** 黑夜系统 */
  nightStartSector: number = 0;
  nightLength: number = 1;
  nightGrowing: boolean = true;

  turnState: TurnState = TurnState.WAITING_FOR_INPUT;
  turnNumber: number = 0;
  year: number = 1;

  messages: string[] = [];
  gameOver: boolean = false;
  gameOverReason: string = '';

  constructor() { this.board = new OctagonBoard(); }

  get aliveDragons(): DragonState[] { return this.dragons.filter(d => d.isAlive); }

  addMessage(msg: string): void {
    this.messages.unshift(msg);
    if (this.messages.length > 5) this.messages.length = 5;
  }
}
