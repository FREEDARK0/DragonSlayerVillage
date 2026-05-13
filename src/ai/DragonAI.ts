import { DragonState, dragonTakeDamage } from '../models/Dragon';
import { OctagonBoard } from '../core/OctagonBoard';
import { DragonActionType, DragonAction } from './actions/DragonAction';
import { BreathAttack } from './actions/BreathAttack';
import { EventBus } from '../core/EventBus';
import { createEffectContext, EffectContext } from '../effects/EffectContext';
import { applyBlockDestroyed, applyBreathHit } from '../effects/BlockEffectRegistry';
import { getDragonBehavior } from '../effects/DragonBehaviorRegistry';
import { GameState } from '../core/GameState';
import { DragonPersonalityType } from '../config/dragonTypes';
import { BlockType } from '../config/blockTypes';
import { createDragonFire } from '../effects/BlockEffectRegistry';

export interface DragonDecision {
  dragon: DragonState; actionType: DragonActionType;
  targetSectors: number[]; description: string;
}

export class DragonAI {
  private actions = new Map<DragonActionType, DragonAction>();

  constructor() {
    this.actions.set(DragonActionType.BREATH, new BreathAttack());
  }

  executeTurn(state: GameState, rotationDeg: number = state.rotationAngle): DragonDecision[] {
    const board = state.board;
    const dragons = state.aliveDragons;
    const ctx = createEffectContext(state);
    const decisions: DragonDecision[] = [];
    const rotSteps = Math.round(rotationDeg / 45);

    for (const dragon of dragons) {
      if (!dragon.isAlive) continue;
      const behavior = getDragonBehavior(dragon.personality);
      const action = this.actions.get(DragonActionType.BREATH)!;

      let chainCount = 0;
      while (dragon.isAlive && chainCount < 8) {
        const logicalEdge = ((dragon.edgeIndex - rotSteps) % 8 + 8) % 8;
        const power = behavior.breathPower(dragon);
        const targetSectors = action.getAffectedSectors(logicalEdge, power);
        const decision: DragonDecision = { dragon, actionType: DragonActionType.BREATH, targetSectors, description: behavior.describe(dragon, targetSectors) };
        decisions.push(decision);

        const destroyedBlock = this.executeDecision(decision, board, dragons, ctx);
        if (dragon.personality !== DragonPersonalityType.DESTRUCTIVE || !destroyedBlock) break;

        dragon.edgeIndex = (dragon.edgeIndex + 1) % 8;
        chainCount++;
      }

      behavior.afterAction?.(dragon, ctx);
    }
    return decisions;
  }

  private executeDecision(dec: DragonDecision, board: OctagonBoard, allDragons: DragonState[], ctx: EffectContext): boolean {
    const behavior = getDragonBehavior(dec.dragon.personality);
    const baseDmg = Math.round(dec.dragon.combatPower * dec.dragon.attackMultiplier);
    let destroyedBlock = false;
    const centerSector = dec.targetSectors[Math.floor(dec.targetSectors.length / 2)];

    for (const s of dec.targetSectors) {
      const block = board.getSector(s) ?? this.moveSensingWallIntoEmptyHit(s, board);

      if (!block) {
        board.villagePower -= baseDmg;
        behavior.onEmptySectorHit?.(dec.dragon, s, baseDmg, ctx);
        continue;
      }

      const totalDmg = baseDmg;
      if (dec.dragon.personality === DragonPersonalityType.BRUTAL && block.type === BlockType.DRAGON_FIRE) {
        continue;
      }
      const mode = dec.dragon.personality === DragonPersonalityType.ARROGANT && s !== centerSector ? 'increase' : 'damage';
      applyBreathHit({ dragon: dec.dragon, sector: s, block, damage: totalDmg, allDragons, mode }, ctx);

      if (mode === 'increase') {
        block.combatPower += totalDmg;
      } else {
        const beforeDamage = block.combatPower;
        block.combatPower -= totalDmg;
        dec.dragon.damageDealt += totalDmg;

        if (block.combatPower <= 0) {
          const wasType = block.type;
          board.removeBlock(s);
          EventBus.emit('blockDestroyed', { sector: s, blockType: wasType, combatPower: block.combatPower });
          applyBlockDestroyed(block, s, ctx, beforeDamage);
          behavior.afterBlockDestroyed?.(dec.dragon, s, ctx);
          destroyedBlock = true;
        }

        if (block.combatPower < 0) {
          board.villagePower += block.combatPower;
        }
      }
    }

    if (dec.dragon.personality === DragonPersonalityType.BRUTAL) {
      this.applyBrutalDragonFire(dec.targetSectors, board);
    }

    EventBus.emit('dragonAttacked', { dragonId: dec.dragon.id, sectors: dec.targetSectors, actionType: dec.actionType, edgeIndex: dec.dragon.edgeIndex });
    return destroyedBlock;
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

  handlePostTurn(state: GameState): void {
    const ctx = createEffectContext(state);
    for (const dragon of state.dragons) {
      if (!dragon.isAlive) continue;
      const behavior = getDragonBehavior(dragon.personality);
      if (behavior.shouldLeaveAfterTurn?.(dragon, ctx)) dragon.isAlive = false;
    }
  }
}

function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 8 - diff);
}
