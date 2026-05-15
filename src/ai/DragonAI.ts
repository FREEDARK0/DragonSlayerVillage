import { DragonState, markDragonDefeated, markDragonDeparted } from '../models/Dragon';
import { OctagonBoard } from '../core/OctagonBoard';
import { DragonActionType, DragonAction } from './actions/DragonAction';
import { BreathAttack } from './actions/BreathAttack';
import { EventBus } from '../core/EventBus';
import { createEffectContext, EffectContext } from '../effects/EffectContext';
import {
  applyBreathHit,
  createDragonFire,
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

  async executeTurn(state: GameState, rotationDeg: number = state.rotationAngle): Promise<DragonDecision[]> {
    const board = state.board;
    const ctx = createEffectContext(state);
    const decisions: DragonDecision[] = [];
    const rotSteps = Math.round(rotationDeg / 45);

    const actionQueue = [...state.aliveDragons].sort((a, b) => dragonActionOrder(a.edgeIndex) - dragonActionOrder(b.edgeIndex));
    for (const dragon of actionQueue) {
      if (state.skipRemainingDragonActions) break;
      if (!dragon.isAlive) continue;
      const behavior = getDragonBehavior(dragon.personality);
      const action = this.actions.get(DragonActionType.BREATH)!;
      let attacked = false;
      let chainCount = 0;

      while (dragon.isAlive && chainCount < 8 && !state.skipRemainingDragonActions) {
        const logicalEdge = ((dragon.edgeIndex - rotSteps) % 8 + 8) % 8;
        const power = behavior.breathPower(dragon);
        const targetSectors = action.getAffectedSectors(logicalEdge, power);
        const decision: DragonDecision = { dragon, actionType: DragonActionType.BREATH, targetSectors, description: behavior.describe(dragon, targetSectors) };
        decisions.push(decision);
        attacked = true;

        const destroyedBlock = await this.executeDecision(decision, board, state.aliveDragons, ctx);
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

  private async executeDecision(dec: DragonDecision, board: OctagonBoard, allDragons: DragonState[], ctx: EffectContext): Promise<boolean> {
    const behavior = getDragonBehavior(dec.dragon.personality);
    let destroyedBlock = false;
    const centerSector = dec.targetSectors[Math.floor(dec.targetSectors.length / 2)];

    EventBus.emit('dragonAttackStarted', { dragonId: dec.dragon.id, sectors: dec.targetSectors, actionType: dec.actionType, edgeIndex: dec.dragon.edgeIndex });
    EventBus.emit('dragonBreathShockwave', { dragonId: dec.dragon.id, sectors: dec.targetSectors, edgeIndex: dec.dragon.edgeIndex, sourceSector: centerSector });
    await waitForCombatAnimation(320);

    for (const wave of buildSymmetricSectorWaves(dec.targetSectors)) {
      if (!dec.dragon.isAlive) break;

      const pendingHits: PendingBreathHit[] = [];
      for (const sector of wave) {
        const block = board.getSector(sector) ?? this.moveSensingWallIntoEmptyHit(sector, board);
        if (!block) {
          pendingHits.push({ sector, damage: dec.dragon.attack, targetType: 'village', block: null });
          continue;
        }
        if (dec.dragon.personality === DragonPersonalityType.BRUTAL && block.type === BlockType.DRAGON_FIRE) continue;
        pendingHits.push({ sector, damage: dec.dragon.attack, targetType: 'block', blockType: block.type, block });
      }

      if (pendingHits.length === 0) continue;
      EventBus.emit('breathSectorHitWave', { hits: pendingHits.map(toBreathHitVisual) });
      await waitForCombatAnimation(95);

      for (const hit of pendingHits) {
        if (!dec.dragon.isAlive) break;
        if (!hit.block) {
          ctx.state.applyVillageHpDelta(-dec.dragon.attack);
          behavior.onEmptySectorHit?.(dec.dragon, hit.sector, dec.dragon.attack, ctx);
          continue;
        }

        applyBreathHit({ dragon: dec.dragon, sector: hit.sector, block: hit.block, damage: hit.damage, allDragons }, ctx);
        const result = damageBlockInContext(hit.block, hit.sector, hit.damage, ctx, { dragon: dec.dragon });
        dec.dragon.damageDealt += result.lostHp;
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
      this.applyBrutalDragonFire(dec.targetSectors, board);
    }

    return destroyedBlock;
  }

  private moveSensingWallIntoEmptyHit(targetSector: number, board: OctagonBoard) {
    const sourceSector = board.findSector(block => block?.type === BlockType.SENSING_WALL);
    if (sourceSector === null) return null;
    const wall = board.getSector(sourceSector);
    if (!wall) return null;
    board.removeBlock(sourceSector);
    board.setSector(targetSector, wall);
    EventBus.emit('blockMoved', { from: sourceSector, to: targetSector, blockType: wall.type });
    return wall;
  }

  private applyBrutalDragonFire(sectors: number[], board: OctagonBoard): void {
    for (const sector of sectors) {
      const block = board.getSector(sector);
      if (!block) {
        board.setSector(sector, createDragonFire(10));
      } else if (block.type === BlockType.DRAGON_FIRE) {
        block.hp += 10;
      }
    }
  }

  private handleGluttonousAfterAttack(dragon: DragonState, allDragons: DragonState[], ctx: EffectContext): void {
    dragon.attackCount++;
    if (!dragon.isAlive) return;

    const target = allDragons
      .filter(other => other.id !== dragon.id && other.isAlive && !ctx.isNight(other.edgeIndex))
      .sort((a, b) => {
        const da = circularDistance(a.edgeIndex, dragon.edgeIndex);
        const db = circularDistance(b.edgeIndex, dragon.edgeIndex);
        return da === db ? a.edgeIndex - b.edgeIndex : da - db;
      })[0];

    if (!target) return;

    const gainedHp = target.hp;
    const gainedAttack = target.attack;
    markDragonDefeated(target, ctx.state.turnNumber + 6);
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
    const edge = nearestFreeEdge(targetSector, ctx.state.aliveDragons, dragon);
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
