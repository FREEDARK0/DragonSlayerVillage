import type { BlockData } from '../models/Block';
import type { DragonState } from '../models/Dragon';
import type { EffectContext } from '../effects/EffectContext';
import type { DragonActionType } from '../ai/actions/DragonAction';

export type CombatEffectPhase =
  | 'turnStartSupport'
  | 'friendlyOffense'
  | 'dragonOffense'
  | 'postCombat';

export interface SimulationTraceEvent {
  phase: CombatEffectPhase;
  source: string;
  message: string;
  sector?: number;
  dragonId?: string;
  targetId?: string;
  value?: number;
  skipped?: boolean;
}

export interface FriendlyOffenseCheck {
  block: BlockData;
  sector: number;
  target: DragonState;
  source: string;
}

export interface CombatPacing {
  dragonAction: number;
  dragonBreathStart: number;
  breathWave: number;
  blockTurnStart: number;
  friendlyAttack: number;
  blockTurnEnd: number;
}

export interface CombatSimulationPolicy {
  isPreview?: boolean;
  waitForAnimations?: boolean;
  pacing?: Partial<CombatPacing>;
  trace?(event: SimulationTraceEvent): void;
  canFriendlyOffense?(check: FriendlyOffenseCheck, ctx: EffectContext): boolean;
  canDragonOffense?(dragon: DragonState, ctx: EffectContext): boolean;
  onDragonAttackTargets?(dragon: DragonState, sectors: number[], ctx: EffectContext, actionType: DragonActionType): void;
}

export interface CombatEffectContributor {
  id: string;
  phases: readonly CombatEffectPhase[];
  apply(phase: CombatEffectPhase, ctx: EffectContext): void;
}

export interface PreviewEntityDelta {
  hpDelta: number;
  attackDelta: number;
  willDie: boolean;
}

export interface CombatPreview {
  sectorDeltas: Map<number, PreviewEntityDelta>;
  dragonDeltas: Map<string, PreviewEntityDelta>;
  villageDelta: PreviewEntityDelta;
  villageAttacked: boolean;
  attackedSectors: Set<number>;
  trace: SimulationTraceEvent[];
}
