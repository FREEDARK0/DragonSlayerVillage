import { DragonAction, DragonActionType } from './DragonAction';
import { OctagonBoard } from '../../core/OctagonBoard';
import { SECTOR_COUNT, edgeBreathSectors } from '../../utils/SectorUtils';

/** 龙息从八边形边扩散，power=1/2/3 → 1/3/5 个扇形 */
export class BreathAttack implements DragonAction {
  readonly type = DragonActionType.BREATH;

  getAffectedSectors(anchor: number, power: number = 1): number[] {
    return edgeBreathSectors(anchor, power);
  }

  getValidAnchors(_board: OctagonBoard): number[] {
    return Array.from({ length: SECTOR_COUNT }, (_, i) => i); // all 8 vertices
  }

  calculateDamage(baseDamage: number, shielded: boolean, _power?: number): number {
    return shielded ? Math.max(1, Math.floor(baseDamage * 0.5)) : baseDamage;
  }
}
