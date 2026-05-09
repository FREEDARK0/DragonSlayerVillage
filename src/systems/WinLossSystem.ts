import { HeroState } from '../models/Hero';
import { DragonState, dragonIsDead } from '../models/Dragon';
import { EventBus } from '../core/EventBus';

export type GameEndReason = 'hero_died' | null;

export class WinLossSystem {
  checkGameOver(hero: HeroState): GameEndReason {
    if (!hero.isAlive) {
      EventBus.emit('gameOver', { reason: 'hero_died' });
      return 'hero_died';
    }
    return null;
  }

  checkAllDragonsDead(dragons: DragonState[]): boolean {
    return dragons.length > 0 && dragons.every(d => dragonIsDead(d));
  }

  checkDecisiveBattleEnd(
    dragons: DragonState[],
    survivalTurns: number,
    currentSurvivalTurns: number,
  ): 'all_dead' | 'survived' | null {
    if (this.checkAllDragonsDead(dragons)) {
      return 'all_dead';
    }
    if (currentSurvivalTurns >= survivalTurns) {
      return 'survived';
    }
    return null;
  }
}
