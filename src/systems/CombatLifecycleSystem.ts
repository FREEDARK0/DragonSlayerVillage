import { DragonAI, DragonDecision } from '../ai/DragonAI';
import { EffectContext } from '../effects/EffectContext';
import {
  runBlockTurnStartSequenced,
  runFriendlyAttacksSequenced,
} from '../effects/BlockEffectRegistry';
import { getCombatEffectContributors } from './CombatEffectRegistry';
import { CombatEffectPhase, CombatSimulationPolicy } from './CombatSimulationTypes';
import { RelicSystem } from './RelicSystem';

export interface CombatLifecycleResult {
  dragonDecisions: DragonDecision[];
}

export class CombatLifecycleSystem {
  private dragonAI = new DragonAI();

  async executeCombatSegment(ctx: EffectContext, rotationDeg: number = ctx.state.rotationAngle, policy: CombatSimulationPolicy = ctx.simulationPolicy ?? {}): Promise<CombatLifecycleResult> {
    this.runPhase('turnStartSupport', ctx, policy);
    RelicSystem.applyCombatTurnStart(ctx);
    await runBlockTurnStartSequenced(ctx, policy);

    this.runPhase('friendlyOffense', ctx, policy);
    await runFriendlyAttacksSequenced(ctx, policy);

    const dragonDecisions = await this.dragonAI.executeTurn(ctx.state, rotationDeg, ctx, policy);

    this.runPhase('postCombat', ctx, policy);
    return { dragonDecisions };
  }

  private runPhase(phase: CombatEffectPhase, ctx: EffectContext, policy: CombatSimulationPolicy): void {
    for (const contributor of getCombatEffectContributors()) {
      if (!contributor.phases.includes(phase)) continue;
      contributor.apply(phase, ctx);
      policy.trace?.({ phase, source: contributor.id, message: 'combat contributor applied' });
    }
  }
}
