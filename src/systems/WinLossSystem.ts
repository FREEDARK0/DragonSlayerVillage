import { OctagonBoard } from '../core/OctagonBoard';
import { DragonState, dragonIsDead } from '../models/Dragon';
import { BlockType } from '../config/blockTypes';
import { EventBus } from '../core/EventBus';

export class WinLossSystem {
  /** 检查村庄是否存活 */
  checkVillageAlive(board: OctagonBoard): boolean {
    if (board.villagePower <= 0) {
      EventBus.emit('gameOver', { reason: 'village_destroyed' });
      return false;
    }
    return true;
  }

  checkAllDragonsDead(dragons: DragonState[]): boolean {
    return dragons.length > 0 && dragons.every(d => dragonIsDead(d));
  }

  checkDecisiveBattleEnd(dragons: DragonState[], survivalTurns: number, currentTurns: number): 'all_dead' | 'survived' | null {
    if (this.checkAllDragonsDead(dragons)) return 'all_dead';
    if (currentTurns >= survivalTurns) return 'survived';
    return null;
  }
}
