import { TurnState } from '../core/GameState';
import { GameState } from '../core/GameState';
import { TurnManager } from '../core/TurnManager';
import { RelicSystem } from '../systems/RelicSystem';
import { ShopSystem } from '../systems/ShopSystem';
import { createSeededRandom, RandomSource } from '../utils/random';
import { resetBlockIdCounter } from '../models/Block';
import { resetDragonInstanceCounter } from '../models/Dragon';
import { COMPACT_REPLAY_SCHEMA_VERSION, CompactReplayV1, ActionV1, TurnMetricsV1, RunSummaryV1 } from '../telemetry/ReplaySchema';
import { currentDataHash, GAME_VERSION } from '../telemetry/GameVersion';
import { hashCoreState } from '../telemetry/CoreStateSerializer';
import { BotAction, BotPolicy } from './BotPolicy';

export interface SimulationOptions {
  seed: string | number;
  maxTurns?: number;
  gameVersion?: string;
  dataHash?: string;
}

export interface SimulationResult {
  replay: CompactReplayV1;
  state: GameState;
  shop: ShopSystem;
}

export class SimulationRunner {
  private seq = 0;

  async run(bot: BotPolicy, options: SimulationOptions): Promise<SimulationResult> {
    resetBlockIdCounter();
    resetDragonInstanceCounter();
    this.seq = 0;
    const random = createSeededRandom(options.seed);
    const botRandom = createSeededRandom(`${String(options.seed)}:bot`);
    const state = new GameState();
    const shop = new ShopSystem(random);
    const manager = new TurnManager(state, random);
    manager.onTurnStarted = () => shop.applyStartOfPlayerTurnEffects(state);
    manager.onRelicSelectionStarted = () => shop.cancelPlacement();
    manager.initWorld();
    shop.reset();

    const actions: ActionV1[] = [];
    const turnHashes: string[] = [hashCoreState(state, shop)];
    const turnMetrics: TurnMetricsV1[] = [];
    const maxTurns = options.maxTurns ?? 80;
    let actionBudget = maxTurns * 64;

    while (!state.gameOver && state.turnNumber < maxTurns && actionBudget-- > 0) {
      if (state.turnState === TurnState.RELIC_SELECTION) {
        const choice = state.relics.pendingChoices[0];
        if (choice) actions.push(await this.applyAction({ type: 'choose_relic', relicId: choice.id }, state, shop, manager, random));
        else break;
        turnHashes.push(hashCoreState(state, shop));
        continue;
      }

      const beforeTurn = snapshotTurnStart(state);
      const decided = bot.decide({ state, shop, random: botRandom });
      let endedTurn = false;
      let purchaseCount = 0;

      for (const action of decided) {
        const recorded = await this.applyAction(action, state, shop, manager, random);
        actions.push(recorded);
        if (recorded.type === 'place' || recorded.type === 'cast' || recorded.type === 'sell') {
          if (recorded.result?.ok) purchaseCount++;
        }
        if (recorded.type === 'end_turn') {
          endedTurn = true;
          break;
        }
        if (state.gameOver || isRelicSelection(state)) break;
      }

      if (!state.gameOver && !endedTurn && state.turnState === TurnState.WAITING_FOR_INPUT) {
        actions.push(await this.applyAction({ type: 'end_turn' }, state, shop, manager, random));
      }

      turnHashes.push(hashCoreState(state, shop));
      turnMetrics.push(buildTurnMetrics(state, beforeTurn, purchaseCount));
    }

    const summary = buildSummary(state, bot.id, String(options.seed), options.gameVersion ?? GAME_VERSION, options.dataHash ?? currentDataHash());
    const replay: CompactReplayV1 = {
      schemaVersion: COMPACT_REPLAY_SCHEMA_VERSION,
      runId: summary.runId,
      source: 'bot',
      botId: bot.id,
      gameVersion: summary.gameVersion,
      dataHash: summary.dataHash,
      seed: String(options.seed),
      actions,
      turnHashes,
      summary,
      turnMetrics,
    };
    return { replay, state, shop };
  }

  private async applyAction(action: BotAction, state: GameState, shop: ShopSystem, manager: TurnManager, random: RandomSource): Promise<ActionV1> {
    const base = { turn: state.turnNumber, seq: this.seq++, payload: {} as Record<string, unknown> };
    if (action.type === 'rotate') {
      if (state.turnState === TurnState.WAITING_FOR_INPUT && !shop.selectedItem()) {
        state.rotationAngle = ((state.rotationAngle + action.delta) % 360 + 360) % 360;
        state.turnRotationSteps += action.delta / 45;
      }
      return { ...base, type: 'rotate', payload: { delta: action.delta }, result: { ok: true } };
    }
    if (action.type === 'refresh') {
      const result = shop.refreshRandom(state);
      return { ...base, type: 'refresh', result: { ok: result.ok, message: result.message } };
    }
    if (action.type === 'lock') {
      const result = shop.toggleRandomLock(action.index);
      return { ...base, type: 'lock', payload: { index: action.index }, result: { ok: result.ok, message: result.message } };
    }
    if (action.type === 'buy') {
      const selected = shop.beginPlacementFromSection(action.section, action.index, state.board.villageGold);
      if (!selected.ok) {
        return { ...base, type: 'select_item', payload: { section: action.section, index: action.index }, result: { ok: false, message: selected.message } };
      }
      const item = shop.selectedItem()?.item;
      const result = shop.tryPlaceSelectedItem(state, action.sector, action.targetIntent ?? 'block');
      const type = item?.kind === 'action' ? 'sell' : item?.kind === 'spell' ? 'cast' : 'place';
      return {
        ...base,
        type,
        payload: { section: action.section, index: action.index, sector: action.sector, targetIntent: action.targetIntent ?? 'block' },
        result: { ok: result.ok, message: result.message },
      };
    }
    if (action.type === 'choose_relic') {
      const selected = RelicSystem.selectPendingChoice(state, action.relicId);
      if (selected) manager.completeRelicSelection();
      return { ...base, type: 'choose_relic', payload: { relicId: action.relicId }, result: { ok: selected } };
    }
    await manager.executeTurn(random, shop.getCombatStats(state));
    return { ...base, type: 'end_turn', result: { ok: true } };
  }
}

function snapshotTurnStart(state: GameState): { hp: number; gold: number; turn: number } {
  return { hp: state.board.villageHp, gold: state.board.villageGold, turn: state.turnNumber };
}

function isRelicSelection(state: GameState): boolean {
  return state.turnState === TurnState.RELIC_SELECTION;
}

function buildTurnMetrics(state: GameState, start: { hp: number; gold: number; turn: number }, purchaseCount: number): TurnMetricsV1 {
  return {
    turn: start.turn,
    hpStart: start.hp,
    hpEnd: state.board.villageHp,
    goldStart: start.gold,
    goldEnd: state.board.villageGold,
    income: Math.max(0, state.board.villageGold - start.gold),
    spend: Math.max(0, start.gold - state.board.villageGold),
    purchaseCount,
    aliveDragonCount: state.aliveDragons.length,
    nightStart: state.nightStart,
    nightLength: state.nightLength,
    rhythmNodeType: state.rhythm?.nodes[state.rhythm.lastTriggeredIndex ?? -1]?.type ?? null,
  };
}

function buildSummary(state: GameState, botId: string, seed: string, gameVersion: string, dataHash: string): RunSummaryV1 {
  return {
    runId: `${botId}-${seed}-${Date.now().toString(36)}`,
    source: 'bot',
    botId,
    seed,
    gameVersion,
    dataHash,
    survivalTurn: state.turnNumber,
    deathRound: state.gameOver ? state.rhythm?.round ?? null : null,
    finalHp: state.board.villageHp,
    finalGold: state.board.villageGold,
    killerDragonTemplateId: null,
    score: null,
  };
}
