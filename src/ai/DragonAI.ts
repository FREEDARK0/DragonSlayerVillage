import { DragonState, dragonTakeDamage } from '../models/Dragon';
import { OctagonBoard } from '../core/OctagonBoard';
import { DragonPersonalityType } from '../config/dragonTypes';
import { DragonPersonality, TurnContext } from './personalities/DragonPersonality';
import { ArrogantPersonality } from './personalities/Arrogant';
import { GluttonousPersonality } from './personalities/Gluttonous';
import { DestructivePersonality } from './personalities/Destructive';
import { GoldPersonality } from './personalities/Gold';
import { BrutalPersonality } from './personalities/Brutal';
import { DragonActionType, DragonAction } from './actions/DragonAction';
import { BreathAttack } from './actions/BreathAttack';
import { BlockType, getVillageLevel } from '../config/blockTypes';
import { EventBus } from '../core/EventBus';
import { randInt } from '../utils/random';

export interface DragonDecision {
  dragon: DragonState; actionType: DragonActionType;
  targetSectors: number[]; description: string;
}

function getBreathPower(dragon: DragonState): number {
  switch (dragon.personality) {
    case DragonPersonalityType.ARROGANT: return dragon.turnCounter % 2 === 0 ? 3 : 2;
    case DragonPersonalityType.DESTRUCTIVE: return dragon.turnCounter % 2 === 0 ? 2 : 1;
    default: return 1;
  }
}

export class DragonAI {
  private personalities = new Map<string, DragonPersonality>();
  private actions = new Map<DragonActionType, DragonAction>();

  constructor() {
    this.personalities.set(DragonPersonalityType.ARROGANT, new ArrogantPersonality());
    this.personalities.set(DragonPersonalityType.GLUTTONOUS, new GluttonousPersonality());
    this.personalities.set(DragonPersonalityType.DESTRUCTIVE, new DestructivePersonality());
    this.personalities.set(DragonPersonalityType.GOLD, new GoldPersonality());
    this.personalities.set(DragonPersonalityType.BRUTAL, new BrutalPersonality());
    this.actions.set(DragonActionType.BREATH, new BreathAttack());
  }

  executeTurn(dragons: DragonState[], board: OctagonBoard, rotationDeg: number = 0): DragonDecision[] {
    const decisions: DragonDecision[] = [];
    const rotSteps = Math.round(rotationDeg / 45);

    for (const dragon of dragons) {
      if (!dragon.isAlive) continue;
      const personality = this.personalities.get(dragon.personality);
      if (!personality) continue;
      const action = this.actions.get(DragonActionType.BREATH)!;
      const logicalEdge = ((dragon.edgeIndex - rotSteps) % 8 + 8) % 8;
      const power = getBreathPower(dragon);
      const targetSectors = action.getAffectedSectors(logicalEdge, power);
      const decision: DragonDecision = { dragon, actionType: DragonActionType.BREATH, targetSectors, description: personality.describe(dragon, DragonActionType.BREATH, targetSectors) };
      decisions.push(decision);
      this.executeDecision(decision, board);
    }
    return decisions;
  }

  private executeDecision(dec: DragonDecision, board: OctagonBoard): void {
    const baseDmg = dec.dragon.attackDamage;

    for (const s of dec.targetSectors) {
      const block = board.getSector(s);

      // 给扇形附属性（始终，空格也附）
      board.setAttribute(s, dec.dragon.element);
      if (block) block.attribute = dec.dragon.element;

      if (!block) {
        board.villagePower -= baseDmg;
        continue;
      }

      let totalDmg = baseDmg;
      // 同属性加成
      if (block.attribute === dec.dragon.element) {
        totalDmg += Math.floor(block.power / 2);
      }

      block.value -= totalDmg;
      dec.dragon.damageDealt += totalDmg;

      // 村庄反击 × 不适用（村庄不在扇区中）

      if (block.value <= 0) {
        const wasType = block.type;
        board.removeBlock(s);
        EventBus.emit('blockDestroyed', { sector: s, blockType: wasType, value: block.value });
        if (dec.dragon.personality === DragonPersonalityType.GOLD) {
          board.setSector(s, { id: -1, type: BlockType.POWER_STONE, value: randInt(3, 8), power: randInt(3, 8), shielded: false, attribute: dec.dragon.element });
        }
        if (dec.dragon.personality === DragonPersonalityType.BRUTAL) {
          board.setSector(s, { id: -1, type: BlockType.WEAKNESS, value: 8, power: 0, shielded: false, attribute: dec.dragon.element });
        }
      }

      // 溢出伤村庄
      if (block.value < 0) {
        board.villagePower += block.value; // block.value is negative
      }
    }

    if (dec.dragon.personality === DragonPersonalityType.GLUTTONOUS) {
      dec.dragon.satiation = Math.min(100, dec.dragon.satiation + 5);
    }

    EventBus.emit('dragonAttacked', { dragonId: dec.dragon.id, sectors: dec.targetSectors, actionType: dec.actionType, edgeIndex: dec.dragon.edgeIndex });
  }

  handlePostTurn(dragons: DragonState[], board: OctagonBoard, villagePower: number): void {
    for (const d of dragons) {
      if (!d.isAlive) continue;
      if (d.personality === DragonPersonalityType.GOLD && board.findSector(b => b?.type === BlockType.POWER_STONE) === null) {
        d.isAlive = false;
      }
      if (d.personality === DragonPersonalityType.BRUTAL && d.combatPower < d.maxCombatPower * 0.5) {
        d.isAlive = false;
      }
    }
  }
}
