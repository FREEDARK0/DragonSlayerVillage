import type { CombatEffectContributor } from './CombatSimulationTypes';

const contributors: CombatEffectContributor[] = [];

export function registerCombatEffectContributor(contributor: CombatEffectContributor): void {
  if (contributors.some(existing => existing.id === contributor.id)) return;
  contributors.push(contributor);
}

export function unregisterCombatEffectContributor(id: string): void {
  const index = contributors.findIndex(contributor => contributor.id === id);
  if (index >= 0) contributors.splice(index, 1);
}

export function getCombatEffectContributors(): CombatEffectContributor[] {
  return [...contributors];
}
