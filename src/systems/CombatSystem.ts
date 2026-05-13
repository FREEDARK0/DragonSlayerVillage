import { OctagonBoard } from '../core/OctagonBoard';
import { BlockType } from '../config/blockTypes';
import { EventBus } from '../core/EventBus';

export class CombatSystem {
  damageBlock(board: OctagonBoard, sector: number, damage: number): void {
    const block = board.getSector(sector);
    if (!block) return;
    block.combatPower -= damage;
    if (block.combatPower <= 0) {
      board.removeBlock(sector);
      EventBus.emit('blockDestroyed', { sector, blockType: block.type, combatPower: block.combatPower });
    }
  }
}
