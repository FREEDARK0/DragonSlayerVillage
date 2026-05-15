import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { createBlock, createPowerStone } from '../models/Block';
import { markDragonDeparted } from '../models/Dragon';
import { chance, randInt } from '../utils/random';

export type RhythmNodeType = 'normal' | 'departure' | 'event';
export type RhythmEventKind = 'gold' | 'chest';

export interface RhythmNode {
  id: string;
  type: RhythmNodeType;
  triggered: boolean;
  eventKind?: RhythmEventKind;
}

export interface RhythmState {
  round: number;
  nodeIndex: number;
  roundLength: number;
  nodes: RhythmNode[];
  lastTriggeredIndex: number | null;
}

export interface RhythmTriggerResult {
  node: RhythmNode;
  index: number;
  completedRound: boolean;
}

const ROUND_LENGTHS = [5, 6, 7, 9, 15];

export class RhythmSystem {
  createInitialState(): RhythmState {
    return this.createRound(0);
  }

  startNextRound(state: GameState): RhythmState {
    const currentRound = state.rhythm?.round ?? 0;
    state.rhythm = this.createRound(currentRound + 1);
    return state.rhythm;
  }

  advance(state: GameState): RhythmTriggerResult {
    if (!state.rhythm || state.rhythm.nodes.length === 0) {
      state.rhythm = this.createInitialState();
    }

    const rhythm = state.rhythm;
    const index = Math.min(rhythm.nodeIndex, rhythm.nodes.length - 1);
    const node = rhythm.nodes[index];
    node.triggered = true;
    rhythm.lastTriggeredIndex = index;
    this.applyNodeEffect(node, state);

    const completedRound = index >= rhythm.nodes.length - 1;
    if (!completedRound) {
      rhythm.nodeIndex = index + 1;
    }

    EventBus.emit('rhythmNodeTriggered', { node, index, completedRound });
    return { node, index, completedRound };
  }

  private createRound(round: number): RhythmState {
    const roundLength = roundLengthFor(round);
    const nodes: RhythmNode[] = [];
    for (let i = 0; i < roundLength - 1; i++) {
      const type: RhythmNodeType = Math.random() < 0.65 ? 'normal' : 'event';
      nodes.push({ id: `r${round}-n${i}`, type, triggered: false });
    }

    if (nodes.length > 0 && chance(0.05)) {
      const index = randInt(0, nodes.length - 1);
      nodes[index] = { id: `r${round}-n${index}`, type: 'departure', triggered: false };
    }

    nodes.push({ id: `r${round}-n${roundLength - 1}`, type: 'departure', triggered: false });
    return {
      round,
      nodeIndex: 0,
      roundLength,
      nodes,
      lastTriggeredIndex: null,
    };
  }

  private applyNodeEffect(node: RhythmNode, state: GameState): void {
    if (node.type === 'normal') {
      state.addMessage('节奏节点：平静');
      return;
    }

    if (node.type === 'departure') {
      const departing = state.aliveDragons;
      if (departing.length === 0) {
        state.addMessage('号角响起，但没有龙在场');
        return;
      }
      for (const dragon of departing) {
        state.addMessage(`${dragon.name}听见号角后离开`);
        EventBus.emit('dragonDeparting', { dragonId: dragon.id, name: dragon.name });
      }
      for (const dragon of departing) markDragonDeparted(dragon);
      return;
    }

    const eventKind: RhythmEventKind = Math.random() < 0.5 ? 'gold' : 'chest';
    node.eventKind = eventKind;
    if (eventKind === 'gold') {
      const gold = randInt(10, 40);
      state.applyVillageGoldDelta(gold);
      state.addMessage(`事件：获得 ${gold} 金币`);
      return;
    }

    this.openChest(state);
  }

  private openChest(state: GameState): void {
    const empty = state.board.getEmptySectors();
    if (empty.length === 0) {
      state.addMessage('事件：宝箱打开，但场上没有空位');
      return;
    }

    const sector = empty[randInt(0, empty.length - 1)];
    if (Math.random() < 0.8) {
      state.board.setSector(sector, createPowerStone());
      state.addMessage(`事件：宝箱生成金矿`);
      EventBus.emit('blockCreated', { sector, blockType: BlockType.POWER_STONE });
      return;
    }

    const candidates = Object.values(BLOCK_TYPE_TABLE)
      .filter(def => def.purchasable)
      .map(def => def.type);
    const type = candidates[randInt(0, candidates.length - 1)];
    state.board.setSector(sector, createBlock(type));
    state.addMessage(`事件：宝箱生成${BLOCK_TYPE_TABLE[type].label}`);
    EventBus.emit('blockCreated', { sector, blockType: type });
  }
}

export function roundLengthFor(round: number): number {
  return ROUND_LENGTHS[Math.min(round, ROUND_LENGTHS.length - 1)];
}
