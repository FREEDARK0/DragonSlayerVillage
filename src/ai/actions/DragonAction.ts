import { OctagonBoard } from '../../core/OctagonBoard';
import { SECTOR_COUNT } from '../../utils/SectorUtils';

export enum DragonActionType {
  BREATH = 'breath',
  SUMMON_IMP = 'summon_imp',
}

export interface DragonAction {
  readonly type: DragonActionType;
  getAffectedSectors(anchor: number, power?: number): number[];
  getValidAnchors(board: OctagonBoard): number[];
  calculateDamage(baseDamage: number, shielded: boolean, power?: number): number;
}
