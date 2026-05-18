import { createEffectContext, EventPort, RandomPort, BlockFactoryPort, CombatStats } from '../effects/EffectContext';
import { GameState, TurnState } from '../core/GameState';
import { OctagonBoard } from '../core/OctagonBoard';
import { createBlock, BlockData } from '../models/Block';
import { DragonState } from '../models/Dragon';
import { CombatLifecycleSystem } from './CombatLifecycleSystem';
import {
  CombatPreview,
  CombatSimulationPolicy,
  PreviewEntityDelta,
  SimulationTraceEvent,
} from './CombatSimulationTypes';
import { BlockType } from '../config/blockTypes';
import { calculateVillageIncome, getBlockAttack } from '../effects/BlockEffectRegistry';

export class CombatPreviewSystem {
  private lifecycle = new CombatLifecycleSystem();

  async calculate(state: GameState, random: RandomPort = createDeterministicRandom(), combatStats?: CombatStats): Promise<CombatPreview> {
    if (state.gameOver || state.turnState !== TurnState.WAITING_FOR_INPUT) return emptyPreview();

    const cloned = cloneGameStateForPreview(state);
    const trace: SimulationTraceEvent[] = [];
    const attackedSectors = new Set<number>();
    let villageAttacked = false;
    const originalSectors = captureSectorBaselines(state);
    const originalDragons = captureDragonBaselines(state);
    const originalVillage = { hp: state.board.villageHp, attack: 0 };
    const silentEvents = createTraceEventPort(trace);
    const previewFactory = createPreviewBlockFactory(random);
    const policy: CombatSimulationPolicy = {
      isPreview: true,
      waitForAnimations: false,
      trace: event => trace.push(event),
      canFriendlyOffense(check, ctx) {
        const allowed = check.source !== 'player_phase' || !ctx.isNight(check.sector);
        if (!allowed) {
          trace.push({
            phase: 'friendlyOffense',
            source: check.source,
            sector: check.sector,
            dragonId: check.target.id,
            skipped: true,
            message: 'night friendly offense hidden from preview',
          });
        }
        return allowed;
      },
      canDragonOffense(dragon, ctx) {
        const allowed = !ctx.isWorldNight(dragon.edgeIndex);
        if (!allowed) {
          trace.push({
            phase: 'dragonOffense',
            source: dragon.name,
            dragonId: dragon.id,
            skipped: true,
            message: 'night dragon offense hidden from preview',
          });
        }
        return allowed;
      },
      onDragonAttackTargets(_dragon, sectors) {
        for (const sector of sectors) attackedSectors.add(sector);
      },
    };
    const ctx = createEffectContext(cloned, {
      events: silentEvents,
      random,
      blockFactory: previewFactory,
      combatStats,
      simulationPolicy: policy,
    });
    ctx.addMessage = () => undefined;
    ctx.applyVillageHpDelta = delta => {
      cloned.board.villageHp += delta;
      if (delta !== 0) {
        if (delta < 0) villageAttacked = true;
        trace.push({ phase: 'dragonOffense', source: 'village', value: delta, message: `village hp ${delta}` });
      }
    };
    ctx.applyVillageGoldDelta = delta => {
      cloned.applyVillageGoldDelta(delta, random);
    };

    const income = calculateVillageIncome(ctx);
    ctx.applyVillageGoldDelta(income);
    await this.lifecycle.executeCombatSegment(ctx, cloned.rotationAngle, policy);

    return {
      sectorDeltas: buildSectorDeltas(originalSectors, cloned),
      dragonDeltas: buildDragonDeltas(originalDragons, cloned),
      villageDelta: buildDelta(originalVillage, { hp: cloned.board.villageHp, attack: 0 }, cloned.board.villageHp <= 0),
      villageAttacked,
      attackedSectors,
      trace,
    };
  }
}

function cloneGameStateForPreview(source: GameState): GameState {
  const clone = new GameState();
  clone.board = new OctagonBoard();
  clone.board.villageHp = source.board.villageHp;
  clone.board.villageGold = source.board.villageGold;
  clone.board.sectors = source.board.sectors.map(block => block ? cloneBlock(block) : null);
  clone.hero = { ...source.hero };
  clone.dragons = source.dragons.map(cloneDragon);
  clone.rotationAngle = source.rotationAngle;
  clone.turnRotationSteps = source.turnRotationSteps;
  clone.nightStart = source.nightStart;
  clone.nightLength = source.nightLength;
  clone.nightGrowing = source.nightGrowing;
  clone.turnState = source.turnState;
  clone.turnNumber = source.turnNumber;
  clone.year = source.year;
  clone.dragonGrowthRound = source.dragonGrowthRound;
  clone.skipRemainingDragonActions = source.skipRemainingDragonActions;
  clone.nextDragonSpawnSector = source.nextDragonSpawnSector;
  clone.rhythm = source.rhythm ? {
    ...source.rhythm,
    nodes: source.rhythm.nodes.map(node => ({ ...node })),
  } : null;
  clone.relics = {
    owned: source.relics.owned.map(relic => ({ ...relic })),
    pendingChoices: source.relics.pendingChoices.map(relic => ({ ...relic, description: [...relic.description] })),
    selectedChoiceId: source.relics.selectedChoiceId,
    goldCurseActiveThisTurn: source.relics.goldCurseActiveThisTurn,
    infantryLegacyBonus: source.relics.infantryLegacyBonus,
    rewardedDragonIds: [...source.relics.rewardedDragonIds],
  };
  clone.messages = [...source.messages];
  clone.gameOver = source.gameOver;
  clone.gameOverReason = source.gameOverReason;
  return clone;
}

function cloneBlock(block: BlockData): BlockData {
  return {
    ...block,
    tags: [...block.tags],
  };
}

function cloneDragon(dragon: DragonState): DragonState {
  return { ...dragon };
}

function captureSectorBaselines(state: GameState): Map<number, { id: number; hp: number; attack: number; sector: number }> {
  const result = new Map<number, { id: number; hp: number; attack: number; sector: number }>();
  const ctx = createEffectContext(state);
  state.board.forEach((block, sector) => {
    if (!block) return;
    result.set(block.id, { id: block.id, hp: block.hp, attack: getBlockAttack(block, ctx, sector), sector });
  });
  return result;
}

function captureDragonBaselines(state: GameState): Map<string, { hp: number; attack: number }> {
  const result = new Map<string, { hp: number; attack: number }>();
  for (const dragon of state.aliveDragons) {
    result.set(dragon.id, { hp: dragon.hp, attack: dragon.attack });
  }
  return result;
}

function buildSectorDeltas(original: Map<number, { id: number; hp: number; attack: number; sector: number }>, simulated: GameState): Map<number, PreviewEntityDelta> {
  const deltas = new Map<number, PreviewEntityDelta>();
  const ctx = createEffectContext(simulated);
  for (const before of original.values()) {
    const located = findBlockById(simulated, before.id);
    const after = located ? { hp: located.block.hp, attack: getBlockAttack(located.block, ctx, located.sector) } : { hp: 0, attack: before.attack };
    const willDie = !located || after.hp <= 0;
    const delta = buildDelta(before, after, willDie);
    if (shouldShowDelta(delta)) deltas.set(located?.sector ?? before.sector, delta);
  }
  return deltas;
}

function findBlockById(state: GameState, id: number): { sector: number; block: BlockData } | null {
  for (let sector = 0; sector < state.board.sectors.length; sector++) {
    const block = state.board.getSector(sector);
    if (block?.id === id) return { sector, block };
  }
  return null;
}

function buildDragonDeltas(original: Map<string, { hp: number; attack: number }>, simulated: GameState): Map<string, PreviewEntityDelta> {
  const deltas = new Map<string, PreviewEntityDelta>();
  for (const [id, before] of original) {
    const dragon = simulated.dragons.find(candidate => candidate.id === id);
    const after = dragon ? { hp: dragon.hp, attack: dragon.attack } : { hp: 0, attack: before.attack };
    const willDie = !dragon?.isAlive || after.hp <= 0;
    const delta = buildDelta(before, after, willDie);
    if (shouldShowDelta(delta)) deltas.set(id, delta);
  }
  return deltas;
}

function buildDelta(before: { hp: number; attack: number }, after: { hp: number; attack: number }, willDie: boolean): PreviewEntityDelta {
  return {
    hpDelta: after.hp - before.hp,
    attackDelta: after.attack - before.attack,
    willDie,
  };
}

function shouldShowDelta(delta: PreviewEntityDelta): boolean {
  return delta.willDie || delta.hpDelta !== 0 || delta.attackDelta !== 0;
}

function emptyPreview(): CombatPreview {
  return {
    sectorDeltas: new Map(),
    dragonDeltas: new Map(),
    villageDelta: { hpDelta: 0, attackDelta: 0, willDie: false },
    villageAttacked: false,
    attackedSectors: new Set(),
    trace: [],
  };
}

function createTraceEventPort(trace: SimulationTraceEvent[]): EventPort {
  return {
    emit(event, payload) {
      trace.push({ phase: 'postCombat', source: event, message: event, value: extractNumericValue(payload) });
    },
  };
}

function extractNumericValue(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const data = payload as Record<string, unknown>;
  const value = data.damage ?? data.hp;
  return typeof value === 'number' ? value : undefined;
}

function createDeterministicRandom(): RandomPort {
  return {
    int(min) {
      return min;
    },
    pick<T>(items: T[]): T {
      return items[0];
    },
  };
}

function createPreviewBlockFactory(random: RandomPort): BlockFactoryPort {
  let nextPreviewId = -1;
  const assignPreviewId = (block: BlockData): BlockData => {
    block.id = nextPreviewId--;
    return block;
  };

  return {
    createBlock(type: BlockType, hp?: number, attack?: number) {
      return assignPreviewId(createBlock(type, hp, attack));
    },
    createPowerStone(hp?: number) {
      return assignPreviewId(createBlock(BlockType.POWER_STONE, hp ?? random.int(1, 20), 0));
    },
    createDragonFire(hp?: number) {
      return assignPreviewId(createBlock(BlockType.DRAGON_FIRE, hp ?? 10, 0));
    },
    createVoodooDoll(target: { id: string; color: number }) {
      const block = assignPreviewId(createBlock(BlockType.VOODOO, 20, 0));
      block.targetDragonId = target.id;
      block.targetColor = target.color;
      return block;
    },
  };
}
