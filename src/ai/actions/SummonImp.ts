import { DragonAction, DragonActionType } from './DragonAction';
import { OctagonBoard } from '../../core/OctagonBoard';

export class SummonImp implements DragonAction {
  readonly type = DragonActionType.SUMMON_IMP;

  getAffectedSectors(anchor: number, _power?: number): number[] {
    return [anchor];
  }

  getValidAnchors(board: OctagonBoard): number[] {
    return board.getEmptySectors();
  }

  calculateDamage(_baseDamage: number, _shielded: boolean, _power?: number): number {
    return 0;
  }
}
