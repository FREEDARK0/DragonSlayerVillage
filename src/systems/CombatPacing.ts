import type { CombatPacing, CombatSimulationPolicy } from './CombatSimulationTypes';

export const DEFAULT_COMBAT_PACING: CombatPacing = {
  dragonAction: 55,
  dragonBreathStart: 180,
  breathWave: 55,
  blockTurnStart: 24,
  friendlyAttack: 36,
  blockTurnEnd: 24,
};

export function combatPacingMs(policy: CombatSimulationPolicy | undefined, key: keyof CombatPacing): number {
  if (policy?.waitForAnimations === false || policy?.isPreview) return 0;
  return policy?.pacing?.[key] ?? DEFAULT_COMBAT_PACING[key];
}

export function waitForCombatPacing(policy: CombatSimulationPolicy | undefined, key: keyof CombatPacing): Promise<void> {
  const ms = combatPacingMs(policy, key);
  if (ms <= 0) return Promise.resolve();
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
