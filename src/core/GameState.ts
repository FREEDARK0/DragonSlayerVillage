import { Grid } from '../models/Grid';
import { HeroState, createHero } from '../models/Hero';
import { DragonState } from '../models/Dragon';
import { VisionFrame } from '../models/VisionFrame';
import { GridPosition } from '../utils/GridPosition';
import { GAME_CONSTANTS } from '../config/constants';

export enum GamePhase {
  CALM = 'calm',
  HARASSMENT = 'harassment',
  DECISIVE_BATTLE = 'decisive_battle',
  YEAR_TRANSITION = 'year_transition',
  GAME_OVER = 'game_over',
}

export enum TurnState {
  WAITING_FOR_INPUT = 'waiting_for_input',
  EXECUTING_TURN = 'executing_turn',
  ENEMY_TURN = 'enemy_turn',
}

export class GameState {
  grid: Grid;
  hero: HeroState;
  heroPos: GridPosition;
  dragons: DragonState[] = [];
  visionFrame: VisionFrame | null = null;

  phase: GamePhase = GamePhase.CALM;
  turnState: TurnState = TurnState.WAITING_FOR_INPUT;
  turnNumber: number = 0;
  turnsInPhase: number = 0;
  year: number = 1;
  decisiveBattleSurvivalTurns: number = 0;

  messages: string[] = [];
  lastPhaseMessage: string = '';

  gameOver: boolean = false;
  gameOverReason: string = '';

  constructor() {
    this.grid = new Grid(GAME_CONSTANTS.GRID_SIZE);
    this.hero = createHero();
    this.heroPos = new GridPosition(0, 0);
  }

  get aliveDragons(): DragonState[] {
    return this.dragons.filter(d => d.isAlive);
  }

  addMessage(msg: string): void {
    this.messages.unshift(msg);
    if (this.messages.length > 5) {
      this.messages.length = 5;
    }
  }
}
