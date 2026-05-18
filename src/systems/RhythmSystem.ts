import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { createBlock, createPowerStone } from '../models/Block';
import { markDragonDeparted } from '../models/Dragon';
import { defaultRandomSource, RandomSource, randomChance } from '../utils/random';
import { RelicSystem } from './RelicSystem';

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
  effectText?: string;
}

const ROUND_LENGTHS = [5, 6, 7, 9, 15];

export class RhythmSystem {
  constructor(private random: RandomSource = defaultRandomSource) {}

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
      const fallbackNode: RhythmNode = { id: 'legacy-normal', type: 'normal', triggered: true };
      state.addMessage('节奏节点：平静');
      return { node: fallbackNode, index: 0, completedRound: false };
    }

    const rhythm = state.rhythm;
    const index = Math.min(rhythm.nodeIndex, rhythm.nodes.length - 1);
    const node = rhythm.nodes[index];
    node.triggered = true;
    rhythm.lastTriggeredIndex = index;
    const effectText = this.applyNodeEffect(node, state);

    const completedRound = index >= rhythm.nodes.length - 1;
    if (!completedRound) {
      rhythm.nodeIndex = index + 1;
    }

    EventBus.emit('rhythmNodeTriggered', { node, index, completedRound, effectText });
    return { node, index, completedRound, effectText };
  }

  private createRound(round: number): RhythmState {
    const roundLength = roundLengthFor(round);
    const nodes: RhythmNode[] = [];
    for (let i = 0; i < roundLength - 1; i++) {
      const type: RhythmNodeType = randomChance(0.65, this.random) ? 'normal' : 'event';
      nodes.push({ id: `r${round}-n${i}`, type, triggered: false });
    }

    if (nodes.length > 0 && randomChance(0.05, this.random)) {
      const index = this.random.int(0, nodes.length - 1);
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

  private applyNodeEffect(node: RhythmNode, state: GameState): string | undefined {
    if (node.type === 'normal') {
      state.addMessage('节奏节点：平静');
      return undefined;
    }

    if (node.type === 'departure') {
      const departing = state.aliveDragons;
      if (departing.length === 0) {
        state.addMessage('号角响起，但没有龙在场');
        return undefined;
      }
      for (const dragon of departing) {
        state.addMessage(`${dragon.name}听见号角后离开`);
        EventBus.emit('dragonDeparting', { dragonId: dragon.id, name: dragon.name });
      }
      for (const dragon of departing) markDragonDeparted(dragon);
      return undefined;
    }

    const eventKind: RhythmEventKind = randomChance(0.5, this.random) ? 'gold' : 'chest';
    node.eventKind = eventKind;
    if (eventKind === 'gold') {
      const gold = this.random.int(10, 40);
      const message = `事件：获得 ${gold} 金币`;
      state.applyVillageGoldDelta(gold);
      state.addMessage(message);
      return message;
    }

    return this.openChest(state);
  }

  private openChest(state: GameState): string {
    const empty = state.board.getEmptySectors();
    if (empty.length === 0) {
      const message = '事件：宝箱打开，但场上没有空位';
      state.addMessage(message);
      return message;
    }

    const sector = this.random.pick(empty);
    if (randomChance(0.8, this.random)) {
      state.board.setSector(sector, createPowerStone(this.random.int(1, 20)));
      const message = '事件：宝箱生成金矿';
      state.addMessage(message);
      EventBus.emit('blockCreated', { sector, blockType: BlockType.POWER_STONE });
      return message;
    }

    const candidates = Object.values(BLOCK_TYPE_TABLE)
      .filter(def => def.purchasable)
      .map(def => def.type);
    const type = this.random.pick(candidates);
    const block = createBlock(type);
    RelicSystem.applyGeneratedBlockModifiers(state, block);
    state.board.setSector(sector, block);
    const message = `事件：宝箱生成${BLOCK_TYPE_TABLE[type].label}`;
    state.addMessage(message);
    EventBus.emit('blockCreated', { sector, blockType: type });
    return message;
  }
}

export function roundLengthFor(round: number): number {
  return ROUND_LENGTHS[Math.min(round, ROUND_LENGTHS.length - 1)];
}
