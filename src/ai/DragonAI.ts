import { DragonState, markDragonDefeated, markDragonDeparted } from '../models/Dragon';
import { OctagonBoard } from '../core/OctagonBoard';
import { DragonActionType, DragonAction } from './actions/DragonAction';
import { BreathAttack } from './actions/BreathAttack';
import { createEffectContext, EffectContext } from '../effects/EffectContext';
import {
  applyBreathHit,
  damageBlockInContext,
  damageDragon,
  getBlockAttack,
  isFriendlyBlock,
  moveDragonStepwise,
} from '../effects/BlockEffectRegistry';
import { getDragonBehavior } from '../effects/DragonBehaviorRegistry';
import { GameState } from '../core/GameState';
import { DragonPersonalityType } from '../config/dragonTypes';
import { BlockType } from '../config/blockTypes';
import { BlockData } from '../models/Block';
import { CombatSimulationPolicy } from '../systems/CombatSimulationTypes';
import { boardSectorToWorldEdge } from '../utils/SectorUtils';
import { combatPacingMs, waitForCombatPacing } from '../systems/CombatPacing';
import { RelicSystem } from '../systems/RelicSystem';

export interface DragonDecision {
  dragon: DragonState;
  actionType: DragonActionType;
  targetSectors: number[];
  description: string;
}

interface BreathHitVisual {
  sector: number;
  damage: number;
  targetType: 'block' | 'village';
  blockType?: BlockType;
}

interface PendingBreathHit extends BreathHitVisual {
  block: BlockData | null;
}

export class DragonAI {
  private actions = new Map<DragonActionType, DragonAction>();

  constructor() {
    this.actions.set(DragonActionType.BREATH, new BreathAttack());
  }

  async executeTurn(state: GameState, rotationDeg: number = state.rotationAngle, ctx: EffectContext = createEffectContext(state), policy: CombatSimulationPolicy = ctx.simulationPolicy ?? {}): Promise<DragonDecision[]> {
    const board = state.board;
    const decisions: DragonDecision[] = [];
    const rotSteps = Math.round(rotationDeg / 45);

    const actionQueue = [...state.aliveDragons].sort((a, b) => dragonActionOrder(a.edgeIndex) - dragonActionOrder(b.edgeIndex));
    for (const dragon of actionQueue) {
      if (state.skipRemainingDragonActions) break;
      if (!dragon.isAlive) continue;
      if (dragon.readyToAttackTurn > state.turnNumber) {
        policy.trace?.({ phase: 'dragonOffense', source: dragon.name, dragonId: dragon.id, skipped: true, message: 'dragon waiting for first visible turn' });
        continue;
      }
      if (policy.canDragonOffense && !policy.canDragonOffense(dragon, ctx)) {
        policy.trace?.({ phase: 'dragonOffense', source: dragon.name, dragonId: dragon.id, skipped: true, message: 'dragon offense skipped by policy' });
        continue;
      }
      const behavior = getDragonBehavior(dragon.personality);
      const action = this.actions.get(DragonActionType.BREATH)!;
      let attacked = false;
      let chainCount = 0;

      while (dragon.isAlive && chainCount < 8 && !state.skipRemainingDragonActions) {
        await waitForCombatPacing(policy, 'dragonAction');
        const logicalEdge = ((dragon.edgeIndex - rotSteps) % 8 + 8) % 8;
        const power = behavior.breathPower(dragon);
        const targetSectors = action.getAffectedSectors(logicalEdge, power);
        policy.onDragonAttackTargets?.(dragon, targetSectors, ctx, DragonActionType.BREATH);
        const decision: DragonDecision = { dragon, actionType: DragonActionType.BREATH, targetSectors, description: behavior.describe(dragon, targetSectors) };
        decisions.push(decision);
        attacked = true;

        const destroyedBlock = await this.executeDecision(decision, board, state.aliveDragons, ctx, policy);
        if (dragon.personality !== DragonPersonalityType.DESTRUCTIVE || !destroyedBlock) break;

        moveDragonStepwise(dragon, 1, 1, ctx);
        chainCount++;
      }

      if (state.skipRemainingDragonActions) break;
      if (attacked && dragon.personality === DragonPersonalityType.GLUTTONOUS) {
        this.handleGluttonousAfterAttack(dragon, state.dragons, ctx);
      }
      behavior.afterAction?.(dragon, ctx);
    }
    return decisions;
  }

  private async executeDecision(dec: DragonDecision, board: OctagonBoard, allDragons: DragonState[], ctx: EffectContext, policy: CombatSimulationPolicy): Promise<boolean> {
    const behavior = getDragonBehavior(dec.dragon.personality);
    let destroyedBlock = false;
    const centerSector = dec.targetSectors[Math.floor(dec.targetSectors.length / 2)];

    ctx.events.emit('dragonAttackStarted', { dragonId: dec.dragon.id, sectors: dec.targetSectors, actionType: dec.actionType, edgeIndex: dec.dragon.edgeIndex });
    ctx.events.emit('dragonBreathShockwave', { dragonId: dec.dragon.id, sectors: dec.targetSectors, edgeIndex: dec.dragon.edgeIndex, sourceSector: centerSector });
    await waitForCombatAnimation(combatPacingMs(policy, 'dragonBreathStart'));

    for (const wave of buildSymmetricSectorWaves(dec.targetSectors)) {
      if (!dec.dragon.isAlive) break;

      const pendingHits: PendingBreathHit[] = [];
      for (const sector of wave) {
        const block = board.getSector(sector) ?? this.moveSensingWallIntoEmptyHit(sector, board, ctx);
        if (!block) {
          pendingHits.push({ sector, damage: dec.dragon.attack, targetType: 'village', block: null });
          continue;
        }
        pendingHits.push({ sector, damage: dec.dragon.attack, targetType: 'block', blockType: block.type, block });
      }

      if (pendingHits.length === 0) continue;
      ctx.events.emit('breathSectorHitWave', { hits: pendingHits.map(toBreathHitVisual) });
      await waitForCombatAnimation(combatPacingMs(policy, 'breathWave'));

      for (const hit of pendingHits) {
        if (!dec.dragon.isAlive) break;
        if (!hit.block) {
          ctx.applyVillageHpDelta(-dec.dragon.attack);
          behavior.onEmptySectorHit?.(dec.dragon, hit.sector, dec.dragon.attack, ctx);
          continue;
        }

        if (hit.block.type === BlockType.DRAGON_FIRE) {
          hit.block.hp += hit.damage;
          ctx.applyVillageHpDelta(-hit.damage);
          ctx.addMessage(`龙焰吸收吐息，HP +${hit.damage}`);
          ctx.simulationPolicy?.trace?.({
            phase: 'dragonOffense',
            source: dec.dragon.name,
            dragonId: dec.dragon.id,
            sector: hit.sector,
            value: hit.damage,
            message: `dragon fire gained ${hit.damage} hp and village took breath damage`,
          });
          continue;
        }

        applyBreathHit({ dragon: dec.dragon, sector: hit.sector, block: hit.block, damage: hit.damage, allDragons }, ctx);
        const result = damageBlockInContext(hit.block, hit.sector, hit.damage, ctx, { dragon: dec.dragon });
        dec.dragon.damageDealt += result.lostHp;
        if (result.destroyed && result.overflowDamage > 0) {
          ctx.applyVillageHpDelta(-result.overflowDamage);
          ctx.simulationPolicy?.trace?.({
            phase: 'dragonOffense',
            source: dec.dragon.name,
            dragonId: dec.dragon.id,
            sector: hit.sector,
            value: -result.overflowDamage,
            message: `breath overflow dealt ${result.overflowDamage} village damage`,
          });
        }
        if (result.destroyed) {
          behavior.afterBlockDestroyed?.(dec.dragon, hit.sector, ctx);
          destroyedBlock = true;
          if (dec.dragon.personality === DragonPersonalityType.ARROGANT) {
            this.retargetArrogantDragon(dec.dragon, ctx);
          }
        }
      }
    }

    if (dec.dragon.personality === DragonPersonalityType.BRUTAL) {
      this.applyBrutalDragonFire(dec.targetSectors, board, ctx);
    }

    return destroyedBlock;
  }

  private moveSensingWallIntoEmptyHit(targetSector: number, board: OctagonBoard, ctx: EffectContext) {
    const sourceSector = board.findSector(block => block?.type === BlockType.SENSING_WALL);
    if (sourceSector === null) return null;
    const wall = board.getSector(sourceSector);
    if (!wall) return null;
    board.removeBlock(sourceSector);
    board.setSector(targetSector, wall);
    ctx.events.emit('blockMoved', { from: sourceSector, to: targetSector, blockType: wall.type });
    return wall;
  }

  private applyBrutalDragonFire(sectors: number[], board: OctagonBoard, ctx: EffectContext): void {
    for (const sector of sectors) {
      const block = board.getSector(sector);
      if (!block) {
        board.setSector(sector, ctx.blockFactory.createDragonFire(10));
        ctx.events.emit('blockCreated', { sector, blockType: BlockType.DRAGON_FIRE, source: 'brutal_dragon' });
      }
    }
  }

  private handleGluttonousAfterAttack(dragon: DragonState, allDragons: DragonState[], ctx: EffectContext): void {
    dragon.attackCount++;
    if (!dragon.isAlive) return;

    const target = allDragons
      .filter(other => other.id !== dragon.id && other.isAlive && !ctx.isWorldNight(other.edgeIndex))
      .sort((a, b) => {
        const da = circularDistance(a.edgeIndex, dragon.edgeIndex);
        const db = circularDistance(b.edgeIndex, dragon.edgeIndex);
        return da === db ? a.edgeIndex - b.edgeIndex : da - db;
      })[0];

    if (!target) return;

    const gainedHp = target.hp;
    const gainedAttack = target.attack;
    markDragonDefeated(target, ctx.state.turnNumber + 6);
    RelicSystem.onDragonDefeated(target, ctx);
    dragon.hp += gainedHp;
    dragon.maxHp += gainedHp;
    dragon.attack += gainedAttack;
    dragon.edgeIndex = target.edgeIndex;

    ctx.events.emit('dragonDied', {
      dragonId: target.id,
      sourceDragonId: dragon.id,
      reason: 'gluttonous_consume',
    });
    ctx.addMessage(`${dragon.name}吞噬了${target.name}，HP +${gainedHp}，攻击 +${gainedAttack}`);
  }

  handlePostTurn(state: GameState): void {
    const ctx = createEffectContext(state);
    for (const dragon of state.dragons) {
      if (!dragon.isAlive) continue;
      const behavior = getDragonBehavior(dragon.personality);
      if (behavior.shouldLeaveAfterTurn?.(dragon, ctx)) markDragonDeparted(dragon);
    }
  }

  retargetArrogantDragon(dragon: DragonState, ctx: EffectContext): void {
    const targetSector = highestAttackFriendlySector(ctx);
    if (targetSector === null) return;
    const edge = nearestFreeEdge(boardSectorToWorldEdge(targetSector, ctx.state.rotationAngle), ctx.state.aliveDragons, dragon);
    if (edge !== null) dragon.edgeIndex = edge;
  }
}

export function highestAttackFriendlySector(ctx: EffectContext): number | null {
  let bestSector: number | null = null;
  let bestAttack = Number.NEGATIVE_INFINITY;
  ctx.board.forEach((block, sector) => {
    if (!block || !isFriendlyBlock(block)) return;
    const attack = getBlockAttack(block, ctx, sector);
    if (attack > bestAttack) {
      bestAttack = attack;
      bestSector = sector;
    }
  });
  return bestSector;
}

export function nearestFreeEdge(preferred: number, dragons: DragonState[], moving?: DragonState): number | null {
  const occupied = new Set(dragons.filter(d => d !== moving && d.isAlive).map(d => d.edgeIndex));
  if (!occupied.has(preferred)) return preferred;
  for (let distance = 1; distance < 8; distance++) {
    const cw = (preferred + distance) % 8;
    if (!occupied.has(cw)) return cw;
    const ccw = ((preferred - distance) % 8 + 8) % 8;
    if (!occupied.has(ccw)) return ccw;
  }
  return null;
}

function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 8 - diff);
}

function dragonActionOrder(edgeIndex: number): number {
  return ((edgeIndex - 5) % 8 + 8) % 8;
}

function waitForCombatAnimation(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function toBreathHitVisual(hit: PendingBreathHit): BreathHitVisual {
  return {
    sector: hit.sector,
    damage: hit.damage,
    targetType: hit.targetType,
    blockType: hit.blockType,
  };
}

export function buildSymmetricSectorWaves(sectors: number[]): number[][] {
  if (sectors.length === 0) return [];
  const center = Math.floor(sectors.length / 2);
  const waves: number[][] = [[sectors[center]]];
  for (let offset = 1; offset <= center; offset++) {
    const wave = [sectors[center - offset], sectors[center + offset]].filter((sector): sector is number => sector !== undefined);
    if (wave.length > 0) waves.push(wave);
  }
  return waves;
}
