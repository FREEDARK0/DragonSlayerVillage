import { DragonState, markDragonDefeated, markDragonDeparted } from '../models/Dragon';
import { OctagonBoard } from '../core/OctagonBoard';
import { DragonActionType, DragonAction } from './actions/DragonAction';
import { BreathAttack } from './actions/BreathAttack';
import { EventBus } from '../core/EventBus';
import { createEffectContext, EffectContext } from '../effects/EffectContext';
import {
  applyBreathHit,
  attackDragonWithBlock,
  canBlockAttackDragon,
  createDragonFire,
  destroyBlockInContext,
  hasBlockTag,
  modifyIncomingBlockDamage,
} from '../effects/BlockEffectRegistry';
import { getDragonBehavior } from '../effects/DragonBehaviorRegistry';
import { GameState } from '../core/GameState';
import { DragonPersonalityType } from '../config/dragonTypes';
import { BlockTag, BlockType } from '../config/blockTypes';
import { BlockData } from '../models/Block';

export interface DragonDecision {
  dragon: DragonState; actionType: DragonActionType;
  targetSectors: number[]; description: string;
}

interface BreathHitVisual {
  sector: number;
  damage: number;
  targetType: 'block' | 'village';
  mode: 'damage' | 'increase';
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
    const dragons = state.aliveDragons;
    const ctx = createEffectContext(state);
    const decisions: DragonDecision[] = [];
    const rotSteps = Math.round(rotationDeg / 45);

    for (const dragon of dragons) {
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

        const destroyedBlock = await this.executeDecision(decision, board, dragons, ctx);
        if (dragon.personality !== DragonPersonalityType.DESTRUCTIVE || !destroyedBlock) break;

        dragon.edgeIndex = (dragon.edgeIndex + 1) % 8;
        chainCount++;
      }

      if (state.skipRemainingDragonActions) break;
      if (attacked && dragon.personality === DragonPersonalityType.GLUTTONOUS) {
        this.handleGluttonousAfterAttack(dragon, dragons, ctx);
      }
      behavior.afterAction?.(dragon, ctx);
    }
    return decisions;
  }

  private async executeDecision(dec: DragonDecision, board: OctagonBoard, allDragons: DragonState[], ctx: EffectContext): Promise<boolean> {
    const behavior = getDragonBehavior(dec.dragon.personality);
    const baseDmg = Math.round(dec.dragon.combatPower * dec.dragon.attackMultiplier);
    let destroyedBlock = false;
    const centerSector = dec.targetSectors[Math.floor(dec.targetSectors.length / 2)];

    const firstStrikeTriggered = this.triggerFirstStrike(dec, board, ctx, centerSector);
    if (firstStrikeTriggered) await waitForCombatAnimation(180);
    if (!dec.dragon.isAlive) return false;

    EventBus.emit('dragonAttackStarted', { dragonId: dec.dragon.id, sectors: dec.targetSectors, actionType: dec.actionType, edgeIndex: dec.dragon.edgeIndex });
    if (!firstStrikeTriggered) {
      EventBus.emit('dragonBreathShockwave', { dragonId: dec.dragon.id, sectors: dec.targetSectors, edgeIndex: dec.dragon.edgeIndex, sourceSector: centerSector });
      await waitForCombatAnimation(320);
    }

    for (const wave of buildSymmetricSectorWaves(dec.targetSectors)) {
      if (!dec.dragon.isAlive) break;

      const pendingHits: PendingBreathHit[] = [];
      for (const s of wave) {
        const block = board.getSector(s) ?? this.moveSensingWallIntoEmptyHit(s, board);

        if (!block) {
          pendingHits.push({ sector: s, damage: baseDmg, targetType: 'village', mode: 'damage', block: null });
          continue;
        }

        const mode = dec.dragon.personality === DragonPersonalityType.ARROGANT && s !== centerSector ? 'increase' : 'damage';
        const totalDmg = mode === 'damage'
          ? modifyIncomingBlockDamage({ dragon: dec.dragon, sector: s, block, damage: baseDmg, allDragons, mode }, ctx)
          : baseDmg;
        if (dec.dragon.personality === DragonPersonalityType.BRUTAL && block.type === BlockType.DRAGON_FIRE) {
          continue;
        }
        pendingHits.push({ sector: s, damage: totalDmg, targetType: 'block', mode, blockType: block.type, block });
      }

      if (pendingHits.length === 0) continue;
      EventBus.emit('breathSectorHitWave', { hits: pendingHits.map(toBreathHitVisual) });
      await waitForCombatAnimation(95);

      for (const hit of pendingHits) {
        if (!dec.dragon.isAlive) break;

        if (!hit.block) {
          ctx.state.applyVillagePowerDelta(-baseDmg, 'battle');
          behavior.onEmptySectorHit?.(dec.dragon, hit.sector, baseDmg, ctx);
          continue;
        }

        applyBreathHit({ dragon: dec.dragon, sector: hit.sector, block: hit.block, damage: hit.damage, allDragons, mode: hit.mode }, ctx);

        if (hit.mode === 'increase') {
          hit.block.combatPower += hit.damage;
        } else {
          const beforeDamage = hit.block.combatPower;
          hit.block.combatPower -= hit.damage;
          dec.dragon.damageDealt += hit.damage;

          if (hit.block.combatPower <= 0) {
            destroyBlockInContext(hit.block, hit.sector, ctx, beforeDamage);
            behavior.afterBlockDestroyed?.(dec.dragon, hit.sector, ctx);
            destroyedBlock = true;
          }

          if (hit.block.combatPower < 0) {
            ctx.state.applyVillagePowerDelta(hit.block.combatPower, 'battle');
          }
        }
      }
    }

    if (dec.dragon.personality === DragonPersonalityType.BRUTAL) {
      this.applyBrutalDragonFire(dec.targetSectors, board);
    }

    return destroyedBlock;
  }

  private triggerFirstStrike(dec: DragonDecision, board: OctagonBoard, ctx: EffectContext, centerSector: number): boolean {
    const block = board.getSector(centerSector);
    if (!block || !hasBlockTag(block, BlockTag.FIRST_STRIKE) || !canBlockAttackDragon(block)) return false;
    return attackDragonWithBlock(block, centerSector, dec.dragon, ctx, 'first_strike').attacked;
  }

  private moveSensingWallIntoEmptyHit(targetSector: number, board: OctagonBoard) {
    const wallSectors = board.findAllSectors(block => block?.type === BlockType.SENSING_WALL);
    if (wallSectors.length === 0) return null;
    const sourceSector = wallSectors.sort((a, b) => {
      const da = circularDistance(a, targetSector);
      const db = circularDistance(b, targetSector);
      return da === db ? a - b : da - db;
    })[0];
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
        block.combatPower += 10;
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

    const gainedPower = target.combatPower;
    markDragonDefeated(target, ctx.state.turnNumber + 6);
    dragon.combatPower += gainedPower;
    dragon.maxCombatPower += gainedPower;
    dragon.edgeIndex = target.edgeIndex;

    ctx.events.emit('dragonDied', {
      dragonId: target.id,
      sourceDragonId: dragon.id,
      reason: 'gluttonous_consume',
    });
    ctx.addMessage(`${dragon.name}吞噬了${target.name}，战力 +${gainedPower}`);
  }

  handlePostTurn(state: GameState): void {
    const ctx = createEffectContext(state);
    for (const dragon of state.dragons) {
      if (!dragon.isAlive) continue;
      const behavior = getDragonBehavior(dragon.personality);
      if (behavior.shouldLeaveAfterTurn?.(dragon, ctx)) markDragonDeparted(dragon);
    }
  }
}

function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 8 - diff);
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
    mode: hit.mode,
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
