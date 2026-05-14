import { OctagonBoard } from '../core/OctagonBoard';
import { EventBus } from '../core/EventBus';

export class CombatSystem {
  damageBlock(board: OctagonBoard, sector: number, damage: number): void {
    const block = board.getSector(sector);
    if (!block || damage <= 0) return;
    block.hp = Math.max(0, block.hp - damage);
    if (block.hp <= 0) {
      board.removeBlock(sector);
      EventBus.emit('blockDestroyed', { sector, blockType: block.type, hp: block.hp });
    }
  }
}
