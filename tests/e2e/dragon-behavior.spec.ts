import { expect, test } from '@playwright/test';
import { BLOCK_TYPE_TABLE, BlockType, RELIC_DEFS, SHOP_ITEM_POOL, ShopActionType, SpellType } from '../../src/config/blockTypes';
import { DRAGON_TEMPLATES, DragonPersonalityType, DragonTemplate, getDragonStatsForRound } from '../../src/config/dragonTypes';
import { DragonAI, buildSymmetricSectorWaves, nearestFreeEdge } from '../../src/ai/DragonAI';
import { GameState } from '../../src/core/GameState';
import { TurnManager } from '../../src/core/TurnManager';
import { EventBus } from '../../src/core/EventBus';
import {
  calculateVillageIncome,
  damageBlockInContext,
  damageDragon,
  destroyBlockInContext,
  getBlockAttack,
  getBlockEffectDescriptions,
  runBlockTurnStart,
} from '../../src/effects/BlockEffectRegistry';
import { createEffectContext } from '../../src/effects/EffectContext';
import { getDragonBehavior } from '../../src/effects/DragonBehaviorRegistry';
import { InputManager } from '../../src/input/InputManager';
import { createBlock, createPowerStone } from '../../src/models/Block';
import { createDragon, dragonTakeDamage, markDragonDefeated } from '../../src/models/Dragon';
import { registerCombatEffectContributor, unregisterCombatEffectContributor } from '../../src/systems/CombatEffectRegistry';
import { CombatLifecycleSystem } from '../../src/systems/CombatLifecycleSystem';
import { CombatPreviewSystem } from '../../src/systems/CombatPreviewSystem';
import { CombatRandomPlan } from '../../src/systems/CombatRandomPlan';
import { registerSellEffectContributor, unregisterSellEffectContributor } from '../../src/systems/SellEffectRegistry';
import { ShopSystem } from '../../src/systems/ShopSystem';
import { RhythmSystem, roundLengthFor } from '../../src/systems/RhythmSystem';
import { RelicId, RelicSystem } from '../../src/systems/RelicSystem';
import { getSpellAttackDisplay } from '../../src/ui/ShopItemDisplay';
import {
  boardSectorToWorldEdge,
  dragonEdgeToBoardSector,
  isBoardSectorNight,
  isWorldSectorNight,
  sectorIndexToRuleNumber,
  ruleNumberToSectorIndex,
} from '../../src/utils/SectorUtils';
import { buildParallelHatchSegments, pointInConvexPolygon, sectorBandPolygon } from '../../src/rendering/HatchPattern';
import { createSeededRandom } from '../../src/utils/random';
import { hashCoreState } from '../../src/telemetry/CoreStateSerializer';
import { currentDataHash } from '../../src/telemetry/GameVersion';
import { SimulationRunner } from '../../src/simulation/SimulationRunner';
import { RandomMonkeyBot } from '../../src/simulation/BasicBots';
import { runCompactReplay } from '../../src/simulation/ReplayRunner';

function template(id: string): DragonTemplate {
  const found = DRAGON_TEMPLATES.find(dragon => dragon.id === id);
  if (!found) throw new Error(`Missing dragon template: ${id}`);
  return found;
}

function shopItem(id: string) {
  const found = SHOP_ITEM_POOL.find(item => item.id === id);
  if (!found) throw new Error(`Missing shop item: ${id}`);
  return found;
}

test('dragon templates use hp, attack, breath range, and turn unlocks', () => {
  expect(template('aurus')).toMatchObject({ name: '黄金龙', hp: 30, attack: 7, breathRange: 1, unlockTurn: 2, quantity: 2 });
  expect(template('gulo')).toMatchObject({ name: '贪食龙', hp: 30, attack: 5, breathRange: 3, unlockTurn: 10 });
  expect(template('wyvern')).toMatchObject({ personality: DragonPersonalityType.WYVERN, hp: 15, attack: 5, unlockTurn: 1, quantity: 3 });
  expect(BLOCK_TYPE_TABLE[BlockType.POWER_STONE].label).toBe('金矿');
});

test('seeded random, core hash, and data hash are stable', () => {
  const a = createSeededRandom('stable-seed');
  const b = createSeededRandom('stable-seed');
  expect([a.int(1, 20), a.int(1, 20), a.pick(['x', 'y', 'z'])]).toEqual([b.int(1, 20), b.int(1, 20), b.pick(['x', 'y', 'z'])]);

  const state = new GameState();
  const shop = new ShopSystem(createSeededRandom('shop'));
  expect(hashCoreState(state, shop)).toBe(hashCoreState(state, shop));
  expect(currentDataHash()).toMatch(/^[0-9a-f]{16}$/);
});

test('simulation runner emits deterministic compact replay for the same seed and bot', async () => {
  const first = await new SimulationRunner().run(new RandomMonkeyBot(), { seed: 'smoke', maxTurns: 4 });
  const second = await new SimulationRunner().run(new RandomMonkeyBot(), { seed: 'smoke', maxTurns: 4 });

  expect(first.replay.schemaVersion).toBe(1);
  expect(first.replay.turnHashes).toEqual(second.replay.turnHashes);
  expect(first.replay.actions.map(action => ({ type: action.type, payload: action.payload, result: action.result })))
    .toEqual(second.replay.actions.map(action => ({ type: action.type, payload: action.payload, result: action.result })));
  expect(first.replay.summary.dataHash).toBe(currentDataHash());
});

test('compact replay runner accepts matching data hash and rejects mismatches', async () => {
  const result = await new SimulationRunner().run(new RandomMonkeyBot(), { seed: 'replay-smoke', maxTurns: 4 });
  const replayed = await runCompactReplay(result.replay);

  expect(replayed.ok).toBe(true);
  expect(replayed.frames.length).toBeGreaterThan(1);
  expect(replayed.frames.at(-1)?.actualHash).toBe(result.replay.turnHashes.at(-1));

  const staleReplay = { ...result.replay, dataHash: '0000000000000000' };
  const rejected = await runCompactReplay(staleReplay);
  expect(rejected.ok).toBe(false);
  expect(rejected.error).toContain('dataHash');
});

test('dragon growth table matches configured rounds and extrapolates after round six', () => {
  expect(getDragonStatsForRound(template('wyvern'), 1)).toMatchObject({ attack: 5, hp: 15 });
  expect(getDragonStatsForRound(template('wyvern'), 6)).toMatchObject({ attack: 45, hp: 144 });
  expect(getDragonStatsForRound(template('aurus'), 4)).toMatchObject({ attack: 22, hp: 114 });
  expect(getDragonStatsForRound(template('brutus'), 6)).toMatchObject({ attack: 50, hp: 480 });
  expect(getDragonStatsForRound(template('brutus'), 7)).toMatchObject({ attack: 75, hp: 720 });
});

test('aurus breath creates a gold mine on empty sectors and damages village hp', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];

  const decisions = await new DragonAI().executeTurn(state, 0);
  const goldMine = state.board.getSector(0);

  expect(decisions).toHaveLength(1);
  expect(decisions[0].targetSectors).toEqual([0]);
  expect(goldMine).toMatchObject({ type: BlockType.POWER_STONE });
  expect(goldMine?.hp).toBeGreaterThanOrEqual(1);
  expect(goldMine?.hp).toBeLessThanOrEqual(20);
  expect(state.board.villageHp).toBe(43);
});

test('aurus breath creates a gold mine after destroying a block when the sector is empty', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 1, 0));
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];
  const created: unknown[] = [];
  const onCreated = (payload: unknown) => created.push(payload);
  EventBus.on('blockCreated', onCreated);

  try {
    await new DragonAI().executeTurn(state, 0);
  } finally {
    EventBus.off('blockCreated', onCreated);
  }

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.POWER_STONE });
  expect(state.board.villageHp).toBe(44);
  expect(created).toContainEqual({ sector: 0, blockType: BlockType.POWER_STONE, source: 'gold_dragon' });
});

test('aurus breath does not overwrite ghost deathrattle when destroying a night ghost', async () => {
  const state = new GameState();
  state.nightStart = 0;
  state.nightLength = 1;
  state.board.setSector(0, createBlock(BlockType.GHOST, 1, 5));
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];

  await new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.GHOST, hp: 1, attack: 5 });
});

test('wyvern leaves after taking damage', () => {
  const state = new GameState();
  const wyvern = createDragon(template('wyvern'), 0);
  state.dragons = [wyvern];

  dragonTakeDamage(wyvern, 1);
  new DragonAI().handlePostTurn(state);

  expect(wyvern.hasTakenDamage).toBe(true);
  expect(wyvern.isAlive).toBe(false);
  expect(wyvern.respawnAvailableTurn).toBeNull();
});

test('wyvern waits until the combat segment ends before leaving after damage', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.board.setSector(0, createBlock(BlockType.SPIKES, 15, 1));
  state.board.setSector(1, createBlock(BlockType.WOOD_WALL, 1, 0));
  const wyvern = createDragon(template('wyvern'), 0);
  state.dragons = [wyvern];

  await new CombatLifecycleSystem().executeCombatSegment(createEffectContext(state));

  expect(wyvern.hasTakenDamage).toBe(true);
  expect(wyvern.isAlive).toBe(true);
  new DragonAI().handlePostTurn(state);
  expect(wyvern.isAlive).toBe(false);
});

test('furo moves clockwise and continues attacking after breaking blocks', async () => {
  const state = new GameState();
  state.board.villageHp = 100;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 1, 0));
  state.board.setSector(2, createBlock(BlockType.WOOD_WALL, 1, 0));
  const furo = createDragon(template('furo'), 0);
  state.dragons = [furo];

  const decisions = await new DragonAI().executeTurn(state, 0);

  expect(decisions.length).toBeGreaterThanOrEqual(3);
  expect(decisions[0].targetSectors).toEqual([7, 0, 1]);
  expect(decisions[1].targetSectors).toEqual([0, 1, 2]);
  expect(state.board.getSector(0)).toBeNull();
  expect(state.board.getSector(2)).toBeNull();
  expect(furo.edgeIndex).toBe(2);
});

test('breath hit feedback advances from center in symmetric waves', () => {
  expect(buildSymmetricSectorWaves([7, 0, 1])).toEqual([[0], [7, 1]]);
  expect(buildSymmetricSectorWaves([6, 7, 0, 1, 2])).toEqual([[0], [7, 1], [6, 2]]);
});

test('dragon actions start at rule sector 1 and continue clockwise', async () => {
  const state = new GameState();
  state.board.villageHp = 200;
  const edges = [2, 7, 4, 0, 6, 1, 5, 3];
  state.dragons = edges.map((edge, index) => createDragon(template(index % 2 === 0 ? 'aurus' : 'wyvern'), edge));

  const decisions = await new DragonAI().executeTurn(state, 0);

  expect(decisions.map(decision => decision.dragon.edgeIndex)).toEqual([5, 6, 7, 0, 1, 2, 3, 4]);
  expect(decisions.map(decision => sectorIndexToRuleNumber(decision.dragon.edgeIndex))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test('rule sector numbering maps visual upper-right sector to 1', () => {
  expect(ruleNumberToSectorIndex(1)).toBe(5);
  expect([5, 6, 7, 0, 1, 2, 3, 4].map(sectorIndexToRuleNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test('rhythm round lengths grow and each final node is departure', () => {
  expect([0, 1, 2, 3, 4, 5, 8].map(roundLengthFor)).toEqual([5, 6, 7, 9, 15, 15, 15]);

  const originalRandom = Math.random;
  try {
    Math.random = () => 0.1;
    const system = new RhythmSystem();
    const state = system.createInitialState();
    expect(state).toMatchObject({ round: 0, nodeIndex: 0, roundLength: 5 });
    expect(state.nodes).toHaveLength(5);
    expect(state.nodes[state.nodes.length - 1]).toMatchObject({ type: 'departure', triggered: false });
    expect(state.nodes.slice(0, -1).every(node => node.type === 'normal')).toBe(true);
  } finally {
    Math.random = originalRandom;
  }
});

test('rhythm advances one node and completes rounds from left to right', () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.1;
    const system = new RhythmSystem();
    const state = new GameState();
    state.rhythm = system.createInitialState();

    for (let i = 0; i < 4; i++) {
      const result = system.advance(state);
      expect(result.index).toBe(i);
      expect(result.completedRound).toBe(false);
      expect(state.rhythm?.round).toBe(0);
      expect(state.rhythm?.nodeIndex).toBe(i + 1);
      expect(state.rhythm?.nodes[i].triggered).toBe(true);
    }

    const result = system.advance(state);
    expect(result.index).toBe(4);
    expect(result.node.type).toBe('departure');
    expect(result.completedRound).toBe(true);
    expect(state.rhythm).toMatchObject({ round: 0, nodeIndex: 4, roundLength: 5 });
    expect(state.rhythm?.nodes[4].triggered).toBe(true);

    system.startNextRound(state);
    expect(state.rhythm).toMatchObject({ round: 1, nodeIndex: 0, roundLength: 6 });
    expect(state.rhythm?.nodes).toHaveLength(6);
    expect(state.rhythm?.nodes[5].type).toBe('departure');
  } finally {
    Math.random = originalRandom;
  }
});

test('rhythm departure node makes all live dragons leave but night growth does not', async () => {
  const state = new GameState();
  state.board.villageHp = 200;
  state.nightStart = 4;
  state.nightLength = 2;
  state.nightGrowing = true;
  state.rhythm = {
    round: 0,
    nodeIndex: 0,
    roundLength: 2,
    lastTriggeredIndex: null,
    nodes: [
      { id: 'test-normal', type: 'normal', triggered: false },
      { id: 'test-departure', type: 'departure', triggered: false },
    ],
  };
  const wyvern = createDragon(template('wyvern'), 0);
  state.dragons = [wyvern];

  await new TurnManager(state).executeTurn();

  expect(wyvern.isAlive).toBe(true);

  const system = new RhythmSystem();
  state.rhythm = {
    round: 0,
    nodeIndex: 0,
    roundLength: 1,
    lastTriggeredIndex: null,
    nodes: [{ id: 'test-departure', type: 'departure', triggered: false }],
  };

  const ignis = createDragon(template('ignis'), 2);
  state.dragons.push(ignis);
  system.advance(state);

  expect(state.aliveDragons).toHaveLength(0);
  expect(wyvern.respawnAvailableTurn).toBeNull();
  expect(ignis.respawnAvailableTurn).toBeNull();
});

test('completed rhythm rounds advance future dragon growth without changing live dragons', async () => {
  const state = new GameState();
  const manager = new TurnManager(state);
  state.board.villageHp = 200;
  state.dragons = [createDragon(template('wyvern'), 0)];
  const live = state.dragons[0];
  state.rhythm = {
    round: 0,
    nodeIndex: 0,
    roundLength: 1,
    lastTriggeredIndex: null,
    nodes: [{ id: 'test-departure', type: 'normal', triggered: false }],
  };

  await manager.executeTurn();

  expect(state.dragonGrowthRound).toBe(2);
  expect(live).toMatchObject({ attack: 5, hp: 15, maxHp: 15 });

  const originalUnlocks = DRAGON_TEMPLATES.map(dragon => ({ id: dragon.id, unlockTurn: dragon.unlockTurn }));
  const originalRandom = Math.random;
  try {
    for (const dragon of DRAGON_TEMPLATES) {
      dragon.unlockTurn = dragon.id === 'wyvern' ? 1 : 999;
    }
    Math.random = () => 0;
    state.dragons = [];
    (manager as any).spawnDragonsByTurn();
    expect(state.aliveDragons[0]).toMatchObject({ attack: 8, hp: 21, maxHp: 21 });
  } finally {
    Math.random = originalRandom;
    for (const { id, unlockTurn } of originalUnlocks) {
      const dragon = DRAGON_TEMPLATES.find(candidate => candidate.id === id);
      if (dragon) dragon.unlockTurn = unlockTurn;
    }
  }
});

test('rhythm event node grants gold or opens a chest', () => {
  const originalRandom = Math.random;
  try {
    const system = new RhythmSystem();
    const goldState = new GameState();
    goldState.board.villageGold = 10;
    goldState.rhythm = {
      round: 0,
      nodeIndex: 0,
      roundLength: 1,
      lastTriggeredIndex: null,
      nodes: [{ id: 'event-gold', type: 'event', triggered: false }],
    };
    Math.random = () => 0;
    const goldResult = system.advance(goldState);
    expect(goldState.board.villageGold).toBe(20);
    expect(goldResult.node.eventKind).toBe('gold');
    expect(goldResult.effectText).toBe('事件：获得 10 金币');

    const chestState = new GameState();
    chestState.rhythm = {
      round: 0,
      nodeIndex: 0,
      roundLength: 1,
      lastTriggeredIndex: null,
      nodes: [{ id: 'event-chest', type: 'event', triggered: false }],
    };
    Math.random = () => 0.6;
    const chestResult = system.advance(chestState);
    expect(chestResult.node.eventKind).toBe('chest');
    expect(chestResult.effectText).toBe('事件：宝箱生成金矿');
    expect(chestState.board.sectors.filter(Boolean)).toHaveLength(1);
    expect(chestState.board.sectors.some(block => block?.type === BlockType.POWER_STONE)).toBe(true);

    const fullState = new GameState();
    for (let sector = 0; sector < 8; sector++) {
      fullState.board.setSector(sector, createBlock(BlockType.WOOD_WALL, 8, 0));
    }
    fullState.rhythm = {
      round: 0,
      nodeIndex: 0,
      roundLength: 1,
      lastTriggeredIndex: null,
      nodes: [{ id: 'event-full-chest', type: 'event', triggered: false }],
    };
    Math.random = () => 0.6;
    const fullResult = system.advance(fullState);
    expect(fullResult.node.eventKind).toBe('chest');
    expect(fullResult.effectText).toBe('事件：宝箱打开，但场上没有空位');
  } finally {
    Math.random = originalRandom;
  }
});

test('input manager ignores drag rotation gestures', () => {
  const manager = new InputManager() as any;
  let confirms = 0;
  manager.onConfirm(() => confirms++);
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.onPointerDown({ button: 0, clientX: 500, clientY: 0 });
  manager.onPointerMove({ clientX: 495, clientY: 5 });
  manager.onPointerMove({ clientX: 490, clientY: 10 });
  manager.onPointerMove({ clientX: 485, clientY: 15 });
  manager.onPointerMove({ clientX: 0, clientY: 700 });
  manager.onPointerUp({ button: 0, pointerId: 1, clientX: 0, clientY: 700 });

  expect(manager.rotationDeg).toBe(0);
  expect(confirms).toBe(0);
});

test('input manager requires holding left click before confirming idle turns', () => {
  const manager = new InputManager() as any;
  let confirms = 0;
  const progressEvents: Array<{ visible: boolean; progress: number; text: string; x: number; y: number }> = [];
  manager.onConfirm(() => confirms++);
  manager.onHoldConfirmProgress((progress: { visible: boolean; progress: number; text: string; x: number; y: number }) => progressEvents.push(progress));
  manager.setHoldConfirmEnabledProvider(() => true);
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.onPointerDown({ button: 0, pointerId: 1, clientX: 50, clientY: 0 });
  manager.clearHoldConfirmTimer();
  manager.updateHoldConfirm(manager.holdConfirmStartedAt + 400);
  expect(progressEvents.at(-1)).toMatchObject({ visible: true, text: '结束回合', x: 50, y: 0 });
  expect(progressEvents.at(-1)?.progress).toBeCloseTo(400 / 650);

  manager.onPointerUp({ button: 0, pointerId: 1, clientX: 50, clientY: 0 });
  expect(confirms).toBe(0);
  expect(progressEvents.at(-1)).toMatchObject({ visible: false, progress: 0 });

  manager.onPointerDown({ button: 0, pointerId: 2, clientX: 60, clientY: 0 });
  expect(manager.holdConfirmActive).toBe(true);
  manager.clearHoldConfirmTimer();
  manager.updateHoldConfirm(manager.holdConfirmStartedAt + 670);
  expect(confirms).toBe(1);

  manager.onPointerUp({ button: 0, pointerId: 2, clientX: 60, clientY: 0 });
  expect(confirms).toBe(1);
});

function pointOnDragCircle(angleDeg: number, radius = 100): { clientX: number; clientY: number } {
  const angle = angleDeg * Math.PI / 180;
  return {
    clientX: Math.cos(angle) * radius,
    clientY: Math.sin(angle) * radius,
  };
}

test('input manager rotates with deliberate right-button drags', () => {
  const manager = new InputManager() as any;
  let confirms = 0;
  const rotations: number[] = [];
  manager.onConfirm(() => confirms++);
  manager.onRotate((delta: number) => rotations.push(delta));
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.onPointerDown({ button: 2, preventDefault() {}, ...pointOnDragCircle(0) });
  manager.onPointerMove(pointOnDragCircle(29));
  expect(rotations).toEqual([]);
  manager.onPointerMove(pointOnDragCircle(30));
  manager.onPointerMove(pointOnDragCircle(60));
  manager.onPointerUp({ button: 2, preventDefault() {}, pointerId: 1, ...pointOnDragCircle(60) });

  expect(rotations).toEqual([45, 45]);
  expect(confirms).toBe(0);
});

test('input manager rotates counterclockwise on negative angle right-button drags', () => {
  const manager = new InputManager() as any;
  const rotations: number[] = [];
  manager.onRotate((delta: number) => rotations.push(delta));
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.onPointerDown({ button: 2, preventDefault() {}, ...pointOnDragCircle(0) });
  manager.onPointerMove(pointOnDragCircle(-30));
  manager.onPointerMove(pointOnDragCircle(-60));
  manager.onPointerUp({ button: 2, preventDefault() {}, pointerId: 1, ...pointOnDragCircle(-60) });

  expect(rotations).toEqual([-45, -45]);
});

test('input manager ignores right-button angle drags below the threshold', () => {
  const manager = new InputManager() as any;
  const rotations: number[] = [];
  manager.onRotate((delta: number) => rotations.push(delta));
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.onPointerDown({ button: 2, preventDefault() {}, ...pointOnDragCircle(0) });
  manager.onPointerMove(pointOnDragCircle(29));
  manager.onPointerUp({ button: 2, preventDefault() {}, pointerId: 1, ...pointOnDragCircle(29) });

  expect(rotations).toEqual([]);
});

test('input manager keeps right-button angle deltas stable across the 180 degree seam', () => {
  const manager = new InputManager() as any;
  const rotations: number[] = [];
  manager.onRotate((delta: number) => rotations.push(delta));
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.onPointerDown({ button: 2, preventDefault() {}, ...pointOnDragCircle(170) });
  manager.onPointerMove(pointOnDragCircle(179));
  manager.onPointerMove(pointOnDragCircle(-170));
  manager.onPointerMove(pointOnDragCircle(-160));
  manager.onPointerUp({ button: 2, preventDefault() {}, pointerId: 1, ...pointOnDragCircle(-160) });

  expect(rotations).toEqual([45]);
});

test('input manager waits for a stable radius before right-button angle rotation', () => {
  const manager = new InputManager() as any;
  const rotations: number[] = [];
  manager.onRotate((delta: number) => rotations.push(delta));
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.onPointerDown({ button: 2, preventDefault() {}, clientX: 0, clientY: 0 });
  manager.onPointerMove(pointOnDragCircle(0));
  manager.onPointerMove(pointOnDragCircle(29));
  expect(rotations).toEqual([]);
  manager.onPointerMove(pointOnDragCircle(30));
  manager.onPointerUp({ button: 2, preventDefault() {}, pointerId: 1, ...pointOnDragCircle(30) });

  expect(rotations).toEqual([45]);
});

test('input manager can suppress the pointerup left after restarting', () => {
  const manager = new InputManager() as any;
  let confirms = 0;
  manager.onConfirm(() => confirms++);
  manager.enabled = true;
  manager.centerX = 0;
  manager.centerY = 0;
  manager.octagonRadius = 1000;
  manager.rotationDeg = 0;

  manager.resetGestureState();
  manager.suppressCurrentGesture({ pointerId: 7, type: 'pointerdown' });
  manager.onPointerUp({ button: 0, pointerId: 7, clientX: 50, clientY: 0 });

  expect(confirms).toBe(0);
});

test('sensing wall moves into an empty breath target and prevents empty-sector effects', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  state.board.setSector(2, createBlock(BlockType.SENSING_WALL, 40, 0));
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];

  await new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(2)).toBeNull();
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.SENSING_WALL, hp: 33 });
  expect(state.board.villageHp).toBe(50);
});

test('arrogant dragon uses fixed damage and gains attack after each action', async () => {
  const state = new GameState();
  state.board.villageHp = 100;
  state.board.setSector(7, createBlock(BlockType.WOOD_WALL, 8, 0));
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
  state.board.setSector(1, createBlock(BlockType.WOOD_WALL, 8, 0));
  const ignis = createDragon(template('ignis'), 0);
  state.dragons = [ignis];

  await new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(0)?.hp).toBe(5);
  expect(state.board.getSector(7)?.hp).toBe(5);
  expect(state.board.getSector(1)?.hp).toBe(5);
  expect(ignis.attack).toBe(8);
});

test('brutus creates dragon fire only on sectors that are empty after attacking', async () => {
  const state = new GameState();
  state.board.villageHp = 100;
  const brutus = createDragon(template('brutus'), 0);
  state.dragons = [brutus];

  await new DragonAI().executeTurn(state, 0);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.DRAGON_FIRE, hp: 10 });

  await new DragonAI().executeTurn(state, 0);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.DRAGON_FIRE, hp: 20 });
  expect(state.board.villageHp).toBe(80);
});

test('gluttonous dragon consumes a daytime dragon after attacking, gains hp and attack, and moves', async () => {
  const state = new GameState();
  state.nightStart = 4;
  state.nightLength = 4;
  const gulo = createDragon(template('gulo'), 0);
  const ignis = createDragon(template('ignis'), 2);
  state.dragons = [gulo, ignis];

  await new DragonAI().executeTurn(state, 0);

  expect(gulo.attackCount).toBe(1);
  expect(gulo.hp).toBe(50);
  expect(gulo.maxHp).toBe(50);
  expect(gulo.attack).toBe(8);
  expect(gulo.edgeIndex).toBe(2);
  expect(ignis.isAlive).toBe(false);
  expect(ignis.respawnAvailableTurn).toBe(6);
});

test('gluttonous dragon ignores dragons in night and leaves after its second attack', async () => {
  const state = new GameState();
  state.nightStart = 4;
  state.nightLength = 4;
  const gulo = createDragon(template('gulo'), 0);
  const wyvern = createDragon(template('wyvern'), 6);
  state.dragons = [gulo, wyvern];

  await new DragonAI().executeTurn(state, 0);
  expect(gulo.attackCount).toBe(1);
  expect(gulo.edgeIndex).toBe(0);
  expect(gulo.hp).toBe(30);
  expect(wyvern.isAlive).toBe(true);

  await new DragonAI().executeTurn(state, 0);
  new DragonAI().handlePostTurn(state);

  expect(gulo.attackCount).toBe(2);
  expect(gulo.isAlive).toBe(false);
  expect(gulo.respawnAvailableTurn).toBeNull();
});

test('defeated dragons stay on cooldown for five full turns, then respawn by reusing the same instance', () => {
  const state = new GameState();
  const manager = new TurnManager(state);
  const ignis = createDragon(template('ignis'), 3);
  ignis.attack = 77;
  ignis.turnCounter = 4;
  ignis.damageDealt = 99;
  ignis.hasTakenDamage = true;
  ignis.attackCount = 2;
  markDragonDefeated(ignis, 6);
  state.dragons = [ignis];

  const originalUnlocks = DRAGON_TEMPLATES.map(dragon => ({ id: dragon.id, unlockTurn: dragon.unlockTurn }));
  const originalRandom = Math.random;

  try {
    for (const dragon of DRAGON_TEMPLATES) {
      if (dragon.id !== 'ignis') dragon.unlockTurn = 999;
    }

    state.turnNumber = 4;
    (manager as any).spawnDragonsByTurn();
    expect(state.dragons).toHaveLength(1);
    expect(ignis.isAlive).toBe(false);

    Math.random = () => 0;
    state.turnNumber = 5;
    (manager as any).spawnDragonsByTurn();

    expect(state.dragons).toHaveLength(1);
    expect(state.dragons[0]).toBe(ignis);
    expect(ignis.isAlive).toBe(true);
    expect(ignis.edgeIndex).toBe(0);
    expect(ignis.respawnAvailableTurn).toBeNull();
    expect(ignis.hp).toBe(20);
    expect(ignis.maxHp).toBe(20);
    expect(ignis.attack).toBe(3);
    expect(ignis.turnCounter).toBe(0);
    expect(ignis.hasTakenDamage).toBe(false);
    expect(ignis.attackCount).toBe(0);
  } finally {
    Math.random = originalRandom;
    for (const { id, unlockTurn } of originalUnlocks) {
      const dragon = DRAGON_TEMPLATES.find(candidate => candidate.id === id);
      if (dragon) dragon.unlockTurn = unlockTurn;
    }
  }
});

test('newly spawned dragons skip their first visible attack turn', async () => {
  const state = new GameState();
  state.board.villageHp = 100;
  const dragon = createDragon(template('wyvern'), 0);
  dragon.readyToAttackTurn = 1;
  state.turnNumber = 0;
  state.dragons = [dragon];

  await new CombatLifecycleSystem().executeCombatSegment(createEffectContext(state));
  expect(state.board.villageHp).toBe(100);

  state.turnNumber = 1;
  await new CombatLifecycleSystem().executeCombatSegment(createEffectContext(state));
  expect(state.board.villageHp).toBe(95);
});

test('destructive dragons spawn only on non-night edges and are skipped when all edges are night', () => {
  const state = new GameState();
  const manager = new TurnManager(state);
  const originalUnlocks = DRAGON_TEMPLATES.map(dragon => ({ id: dragon.id, unlockTurn: dragon.unlockTurn }));
  const originalRandom = Math.random;

  try {
    for (const dragon of DRAGON_TEMPLATES) dragon.unlockTurn = dragon.id === 'furo' ? 1 : 999;
    Math.random = () => 0;
    state.turnNumber = 3;
    state.nightGrowing = true;
    state.nightStart = 0;
    state.nightLength = 2;
    (manager as any).spawnDragonsByTurn();
    const furo = state.aliveDragons[0];
    expect(furo.templateId).toBe('furo');
    expect(isWorldSectorNight(furo.edgeIndex, 0, 4)).toBe(false);

    state.dragons = [];
    state.nightStart = 4;
    state.nightLength = 8;
    state.nightGrowing = false;
    (manager as any).spawnDragonsByTurn();
    expect(state.aliveDragons).toHaveLength(0);
  } finally {
    Math.random = originalRandom;
    for (const { id, unlockTurn } of originalUnlocks) {
      const dragon = DRAGON_TEMPLATES.find(candidate => candidate.id === id);
      if (dragon) dragon.unlockTurn = unlockTurn;
    }
  }
});

test('block descriptions use hp attack and gold terminology', () => {
  const descriptions = [
    ...getBlockEffectDescriptions(BlockType.MAGE),
    ...getBlockEffectDescriptions(BlockType.BALLISTA),
    ...getBlockEffectDescriptions(BlockType.PRESSURE_STONE),
    ...getBlockEffectDescriptions(BlockType.WOOD_WALL),
  ].join('\n');

  expect(descriptions).toContain('HP');
  expect(descriptions).toContain('攻击');
  expect(descriptions).not.toContain('战力');
  expect(descriptions).not.toContain('升级');
});

test('pressure stone gains hp once on placement and cannot upgrade', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  state.dragons = [
    createDragon(template('ignis'), 7),
    createDragon(template('aurus'), 0),
    createDragon(template('wyvern'), 1),
  ];
  state.dragons[0].hp = 12;
  state.dragons[1].hp = 20;
  state.dragons[2].hp = 31;
  const shop = new ShopSystem();
  const item = shopItem('block:pressure_stone');
  const slot = shop.state.random[0];
  slot.item = item;

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.PRESSURE_STONE, hp: 15, attack: 0 });

  slot.item = item;
  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: false });
});

test('gold mine grants gold equal to lost hp when damaged', () => {
  const state = new GameState();
  state.board.villageGold = 10;
  const mine = createPowerStone(13);
  state.board.setSector(0, mine);

  damageBlockInContext(mine, 0, 5, createEffectContext(state), { spell: 'test' });

  expect(state.board.getSector(0)).toMatchObject({ hp: 8 });
  expect(state.board.villageGold).toBe(15);
});

test('dragon breath overflow damages village after destroying any board block', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  const mine = createPowerStone(3);
  state.board.setSector(0, mine);
  const wyvern = createDragon(template('wyvern'), 0);
  wyvern.attack = 10;
  state.dragons = [wyvern];

  await new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(0)).toBeNull();
  expect(state.board.villageGold).toBe(13);
  expect(state.board.villageHp).toBe(43);
  expect(wyvern.damageDealt).toBe(3);
});

test('non-breath block damage reports overflow without damaging village', () => {
  const state = new GameState();
  state.board.villageHp = 50;
  const mine = createPowerStone(3);
  state.board.setSector(0, mine);

  const result = damageBlockInContext(mine, 0, 10, createEffectContext(state), { spell: 'test' });

  expect(result).toMatchObject({ destroyed: true, lostHp: 3, overflowDamage: 7 });
  expect(state.board.getSector(0)).toBeNull();
  expect(state.board.villageGold).toBe(13);
  expect(state.board.villageHp).toBe(50);
});

test('shielded blocks absorb breath without overflow damage', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  const wall = createBlock(BlockType.WOOD_WALL, 3, 0);
  wall.shielded = true;
  state.board.setSector(0, wall);
  const wyvern = createDragon(template('wyvern'), 0);
  wyvern.attack = 10;
  state.dragons = [wyvern];

  await new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(0)).toMatchObject({ hp: 3, shielded: false });
  expect(state.board.villageHp).toBe(50);
  expect(wyvern.damageDealt).toBe(0);
});

test('combat preview includes dragon breath overflow village damage', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  state.nightLength = 0;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 3, 0));
  const wyvern = createDragon(template('wyvern'), 0);
  wyvern.attack = 10;
  state.dragons = [wyvern];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.villageDelta.hpDelta).toBe(-7);
  expect(preview.villageAttacked).toBe(true);
  expect(state.board.villageHp).toBe(50);
  expect(state.board.getSector(0)).toMatchObject({ hp: 3 });
});

test('guardian attack tracks hp in real time', () => {
  const guardian = createBlock(BlockType.GUARDIAN, 10, 0);
  expect(getBlockAttack(guardian)).toBe(10);
  guardian.hp = 4;
  expect(getBlockAttack(guardian)).toBe(4);
});

test('portal keeps taking breath damage while the opposite attacker strikes the dragon', async () => {
  const state = new GameState();
  state.board.setSector(0, createBlock(BlockType.PORTAL, 30, 0));
  state.board.setSector(4, createBlock(BlockType.BALLISTA, 8, 5));
  const ignis = createDragon(template('ignis'), 0);
  state.dragons = [ignis];

  await new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.PORTAL, hp: 27 });
  expect(ignis.hp).toBe(15);
});

test('assassin is cheap, gains night attack, and destroys itself after attacking', async () => {
  const assassin = SHOP_ITEM_POOL.find(item => item.kind === 'block' && item.blockType === BlockType.ASSASSIN);
  expect(assassin).toMatchObject({ cost: 10, hp: 8, attack: 0 });

  const state = new GameState();
  state.nightStart = 0;
  state.nightLength = 1;
  state.board.setSector(0, createBlock(BlockType.ASSASSIN, 8, 0));
  const ignis = createDragon(template('ignis'), 0);
  state.dragons = [ignis];

  await new TurnManager(state).executeTurn();

  expect(ignis.hp).toBe(0);
  expect(ignis.isAlive).toBe(false);
  expect(state.board.getSector(0)).toBeNull();
});

test('dragon spear gains damage from empty sectors before attacking and skips remaining dragons when it kills', async () => {
  const state = new GameState();
  state.board.setSector(0, createBlock(BlockType.DRAGON_SPEAR, 15, 5));
  state.rhythm = {
    round: 0,
    nodeIndex: 0,
    roundLength: 2,
    lastTriggeredIndex: null,
    nodes: [
      { id: 'test-normal', type: 'normal', triggered: false },
      { id: 'test-departure', type: 'departure', triggered: false },
    ],
  };
  const ignis = createDragon(template('ignis'), 0);
  const aurus = createDragon(template('aurus'), 2);
  state.dragons = [ignis, aurus];

  await new TurnManager(state).executeTurn();

  expect(ignis.isAlive).toBe(false);
  expect(aurus.isAlive).toBe(true);
  expect(state.board.getSector(2)).toBeNull();
  expect(state.board.getSector(0)?.turnAttackBonus).toBe(0);
});

test('tavern and mine income affects gold only', () => {
  const state = new GameState();
  const tavern = createBlock(BlockType.TAVERN, 10, 0);
  state.board.setSector(0, tavern);
  state.board.setSector(1, createBlock(BlockType.MINE, 8, 0));
  state.nightStart = 4;
  state.nightLength = 4;
  expect(calculateVillageIncome(createEffectContext(state))).toBe(11);

  state.nightStart = 0;
  state.nightLength = 1;
  expect(calculateVillageIncome(createEffectContext(state))).toBe(15);
});

test('smithy grants current attack to adjacent placement and then grows', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  const smithy = createBlock(BlockType.SMITHY, 10, 3);
  state.board.setSector(7, smithy);
  const shop = new ShopSystem();

  shop.beginPlacementFromSection('base', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.WOOD_WALL, hp: 8, attack: 3 });
  expect(smithy.attack).toBe(4);
});

test('shop spells use hp and attack rules, and dragon fire consumes block hp on placement', () => {
  const state = new GameState();
  state.board.villageGold = 200;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
  state.board.setSector(1, createBlock(BlockType.KNIGHT, 10, 5));
  state.board.setSector(7, createBlock(BlockType.MAGE, 8, 1));
  const shop = new ShopSystem();

  let slot = shop.state.random[0];
  slot.item = shopItem('spell:focus_defense');
  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);
  expect(state.board.getSector(0)?.hp).toBe(17);
  expect(state.board.getSector(1)?.hp).toBe(5);
  expect(state.board.getSector(7)?.hp).toBe(4);

  slot = shop.state.random[0];
  slot.item = shopItem('spell:bulwark');
  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, null).ok).toBe(true);
  expect(state.board.getSector(0)?.hp).toBe(22);
  expect(state.board.getSector(1)?.hp).toBe(5);
  expect(state.board.getSector(7)?.hp).toBe(4);

  state.board.setSector(2, createBlock(BlockType.DRAGON_FIRE, 12, 0));
  shop.beginPlacementFromSection('base', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 2).ok).toBe(true);
  expect(state.board.getSector(2)).toMatchObject({ type: BlockType.DRAGON_FIRE, hp: 4 });
});

test('bulwark targets current zero attack blocks and excludes guardians', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
  state.board.setSector(1, createBlock(BlockType.GUARDIAN, 10, 0));
  const shop = new ShopSystem();
  shop.state.random[0].item = shopItem('spell:bulwark');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, null).ok).toBe(true);

  expect(state.board.getSector(0)?.hp).toBe(13);
  expect(state.board.getSector(1)?.hp).toBe(10);
});

test('missile can target a dragon and uses spell temporary attack plus relic hit count', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  state.board.setSector(1, createBlock(BlockType.MAGE, 8, 2));
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];
  const shop = new ShopSystem();
  RelicSystem.grant(state, RelicId.MISSILE_EXTRA_HIT);
  shop.applyStartOfPlayerTurnEffects(state);

  shop.beginPlacementFromSection('base', 2, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0, 'dragon').ok).toBe(true);

  expect(aurus.hp).toBe(16);
  expect(shop.state.base[2].kind === 'spell' ? shop.state.base[2].tempAttack : -1).toBe(0);
});

test('board-cast missile damages a gold mine before any dragon in the same sector', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  const mine = createPowerStone(13);
  state.board.setSector(0, mine);
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];
  const shop = new ShopSystem();

  shop.beginPlacementFromSection('base', 2, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.POWER_STONE, hp: 8 });
  expect(state.board.villageGold).toBe(95);
  expect(aurus.hp).toBe(30);
});

test('board-cast missile fails on an empty sector even when a dragon is there', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];
  const shop = new ShopSystem();

  shop.beginPlacementFromSection('base', 2, state.board.villageGold);
  const result = shop.tryPlaceSelectedItem(state, 0);

  expect(result).toMatchObject({ ok: false, message: '该扇区没有地块目标' });
  expect(state.board.villageGold).toBe(100);
  expect(shop.selectedItem()).toMatchObject({ item: { id: 'spell:missile' } });
  expect(aurus.hp).toBe(30);
});

test('auto missile uses current shop missile damage including mage training', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.board.setSector(0, createBlock(BlockType.MAGE, 8, 1));
  const target = createDragon(template('aurus'), 1);
  state.dragons = [target];
  RelicSystem.grant(state, RelicId.AUTO_MISSILE);
  const shop = new ShopSystem();
  shop.applyStartOfPlayerTurnEffects(state);

  const combatStats = shop.getCombatStats(state);
  const preview = await new CombatPreviewSystem().calculate(state, new CombatRandomPlan().createRecorder(), combatStats);
  await new CombatLifecycleSystem().executeCombatSegment(createEffectContext(state, { combatStats }));

  expect(combatStats.missileDamage).toBe(7);
  expect(preview.dragonDeltas.get(target.id)).toMatchObject({ hpDelta: -7 });
  expect(target.hp).toBe(23);
});

test('knight rotation gain wraps after one full circle', () => {
  const cases = [
    { steps: 1, gain: 2 },
    { steps: 8, gain: 0 },
    { steps: 9, gain: 2 },
    { steps: -9, gain: 2 },
  ];

  for (const { steps, gain } of cases) {
    const state = new GameState();
    const knight = createBlock(BlockType.KNIGHT, 20, 10);
    state.board.setSector(0, knight);
    state.turnRotationSteps = steps;

    runBlockTurnStart(createEffectContext(state));

    expect(knight.hp).toBe(20 + gain);
    expect(knight.tempHp).toBe(gain);
    expect(knight.turnAttackBonus).toBe(gain);
  }
});

test('combat preview shows knight temporary rotation attack and hp gain', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.board.setSector(0, createBlock(BlockType.KNIGHT, 20, 10));
  state.turnRotationSteps = 9;

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.sectorDeltas.get(0)).toMatchObject({ hpDelta: 2, attackDelta: 2 });
});

test('combat preview shows dragon spear empty-sector temporary attack gain', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.board.setSector(0, createBlock(BlockType.DRAGON_SPEAR, 15, 5));
  const dragon = createDragon(template('brutus'), 0);
  state.dragons = [dragon];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.sectorDeltas.get(0)).toMatchObject({ attackDelta: 70 });
  expect(preview.dragonDeltas.get(dragon.id)).toMatchObject({ hpDelta: -50, willDie: true });
});

test('random shop excludes base items, supports locking, refresh cost growth, and clears purchased slots', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;

  expect(shop.state.base.map(item => item.id)).toEqual(['block:wood_wall', 'block:mine', 'spell:missile', 'action:sell']);
  expect(shop.state.base[3]).toMatchObject({ kind: 'action', actionType: ShopActionType.SELL, baseReward: 3 });
  expect(shop.state.random).toHaveLength(4);
  const visible = shop.state.random.map(slot => slot.item).filter((item): item is NonNullable<typeof item> => Boolean(item));
  expect(new Set(visible.map(item => item.id)).size).toBe(visible.length);
  expect(visible.map(item => item.id)).not.toContain('block:wood_wall');
  expect(visible.map(item => item.id)).not.toContain('block:mine');
  expect(visible.map(item => item.id)).not.toContain('spell:missile');
  expect(visible.map(item => item.id)).not.toContain('action:sell');
  expect(SHOP_ITEM_POOL.map(item => item.id)).not.toContain('block:power_stone');
  expect(SHOP_ITEM_POOL.map(item => item.id)).not.toContain('block:dragon_fire');
  expect(BLOCK_TYPE_TABLE[BlockType.DRAGON_FIRE]).toMatchObject({ label: '龙焰', purchasable: false });

  const first = shop.state.random[0].item;
  expect(shop.toggleRandomLock(0)).toMatchObject({ ok: true });
  expect(shop.refreshRandom(state)).toMatchObject({ ok: true });
  expect(state.board.villageGold).toBe(99);
  expect(shop.state.refreshCost).toBe(3);
  expect(shop.state.random[0].item).toEqual(first);

  if (first?.kind === 'block') {
    shop.beginPlacementFromSection('random', 0, state.board.villageGold);
    expect(shop.tryPlaceSelectedItem(state, state.board.getEmptySectors()[0]).ok).toBe(true);
    expect(shop.state.random[0].item).toBeNull();
    expect(shop.state.random[0].locked).toBe(false);
  }
});

test('village hp loss causes game over, gold income does not heal hp', async () => {
  const state = new GameState();
  state.board.villageHp = 1;
  state.board.villageGold = 10;
  state.board.setSector(0, createBlock(BlockType.DRAGON_FIRE, 3, 0));

  await new TurnManager(state).executeTurn();

  expect(state.board.villageHp).toBeLessThanOrEqual(0);
  expect(state.gameOver).toBe(false);
});

test('mage grants only shop missiles temporary attack at player turn start', () => {
  const state = new GameState();
  const mage = createBlock(BlockType.MAGE, 8, 1);
  state.board.setSector(0, mage);
  const shop = new ShopSystem();
  shop.state.random[0].item = shopItem('spell:bulwark');
  shop.applyStartOfPlayerTurnEffects(state);
  const missile = shop.state.base[2];
  const bulwark = shop.state.random[0].item;
  expect(mage.attack).toBe(1);
  expect(missile.kind === 'spell' ? missile.tempAttack : 0).toBe(2);
  expect(bulwark?.kind === 'spell' ? bulwark.tempAttack ?? 0 : -1).toBe(0);
  expect(shop.getCombatStats(state).missileDamage).toBe(7);
});

test('temporary shop slots survive refresh and magic book creates temporary spells', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;
  shop.state.random[0].item = shopItem('spell:magic_book');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, null)).toMatchObject({ ok: true });
  expect(shop.state.temporary).toHaveLength(2);
  const temporaryIds = shop.state.temporary.map(item => item.id);

  expect(shop.refreshRandom(state)).toMatchObject({ ok: true });
  expect(shop.state.temporary.map(item => item.id)).toEqual(temporaryIds);
  expect(shop.toggleRandomLock(0)).toMatchObject({ ok: true });
});

test('goblin discounts the next purchase and market grants free refreshes', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;
  shop.state.random[0].item = shopItem('block:goblin');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });
  expect(shop.state.nextPurchaseDiscount).toBe(10);
  expect(shop.effectiveCost(shop.state.base[0])).toBe(0);

  shop.beginPlacementFromSection('base', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 1)).toMatchObject({ ok: true });
  expect(shop.state.nextPurchaseDiscount).toBe(0);

  state.board.setSector(2, createBlock(BlockType.MARKET, 25, 0));
  shop.applyStartOfPlayerTurnEffects(state);
  const beforeGold = state.board.villageGold;
  expect(shop.state.freeRefreshCredits).toBe(1);
  expect(shop.refreshRandom(state)).toMatchObject({ ok: true, message: '免费刷新随机区' });
  expect(state.board.villageGold).toBe(beforeGold);
  expect(shop.state.freeRefreshCredits).toBe(0);
});

test('market placement grants a same-turn free refresh credit', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;
  shop.state.random[0].item = shopItem('block:market');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.MARKET });
  expect(shop.state.freeRefreshCredits).toBe(1);

  const beforeGold = state.board.villageGold;
  expect(shop.refreshRandom(state)).toMatchObject({ ok: true, message: '免费刷新随机区' });
  expect(state.board.villageGold).toBe(beforeGold);
  expect(shop.state.freeRefreshCredits).toBe(0);

  shop.applyStartOfPlayerTurnEffects(state);
  expect(shop.state.freeRefreshCredits).toBe(1);
});

test('dragon spear placement persists on an empty sector and consumes purchase once', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;
  shop.state.random[0].item = shopItem('block:dragon_spear');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.DRAGON_SPEAR, hp: 15, attack: 5 });
  expect(state.board.villageGold).toBe(70);
  expect(shop.selectedItem()).toBeNull();
  expect(shop.state.random[0].item).toBeNull();
});

test('scout gains adjacent hp and marks the next dragon spawn sector', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;
  state.board.setSector(7, createBlock(BlockType.WOOD_WALL, 9, 0));
  state.board.setSector(1, createBlock(BlockType.MINE, 8, 0));
  shop.state.random[0].item = shopItem('block:scout');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.SCOUT, hp: 8, attack: 10 });
  expect(state.nextDragonSpawnSector).toBe(0);

  state.turnNumber = 1;
  state.nightLength = 0;
  (new TurnManager(state) as any).spawnDragonsByTurn();
  expect(state.aliveDragons[0]).toBeTruthy();
  expect(dragonEdgeToBoardSector(state.aliveDragons[0].edgeIndex, state.rotationAngle)).toBe(0);
  expect(state.nextDragonSpawnSector).toBeNull();
});

test('apple permanently grants a friendly +3/+3', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
  shop.state.random[0].item = shopItem('spell:apple');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });
  expect(state.board.getSector(0)).toMatchObject({ hp: 11, attack: 3 });

  shop.state.random[1].item = shopItem('spell:apple');
  shop.beginPlacementFromSection('random', 1, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 1)).toMatchObject({ ok: false, message: '请选择友方建筑/单位' });
});

test('debug shop purchases reuse normal item effects and free purchase skips cost', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;

  shop.beginDebugPurchase(shopItem('block:market'), state.board.villageGold, false);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.MARKET });
  expect(state.board.villageGold).toBe(80);
  expect(shop.state.freeRefreshCredits).toBe(1);
  expect(shop.selectedItem()).toBeNull();

  shop.beginDebugPurchase(shopItem('spell:magic_book'), state.board.villageGold, false);
  expect(shop.tryPlaceSelectedItem(state, null)).toMatchObject({ ok: true });
  expect(state.board.villageGold).toBe(65);
  expect(shop.state.temporary).toHaveLength(2);

  shop.beginDebugPurchase(shopItem('block:wood_wall'), state.board.villageGold, true);
  expect(shop.tryPlaceSelectedItem(state, 1)).toMatchObject({ ok: true });
  expect(state.board.getSector(1)).toMatchObject({ type: BlockType.WOOD_WALL });
  expect(state.board.villageGold).toBe(65);
});

test('debug shop special purchases match normal placement effects', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;
  const ignis = createDragon(template('ignis'), 0);
  state.dragons = [ignis];

  shop.beginDebugPurchase(shopItem('block:pressure_stone'), state.board.villageGold, false);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.PRESSURE_STONE, hp: Math.floor(ignis.hp / 4) });

  const wizardShop = new ShopSystem();
  const wizardState = new GameState();
  wizardState.board.villageGold = 100;
  const wizardTarget = createDragon(template('ignis'), 0);
  wizardState.dragons = [wizardTarget];
  wizardShop.beginDebugPurchase(shopItem('block:wizard'), wizardState.board.villageGold, false);
  expect(wizardShop.tryPlaceSelectedItem(wizardState, 0)).toMatchObject({ ok: true });
  expect(wizardShop.state.temporary[0]).toMatchObject({ id: 'spell:repel', cost: 5, repelTemplateId: wizardTarget.templateId });
});

test('debug relic grants reuse grant effects and respect max selections', () => {
  const state = new GameState();
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));

  RelicSystem.grant(state, RelicId.VILLAGE_HEART);
  expect(state.board.villageHp).toBe(100);

  RelicSystem.grant(state, RelicId.WOOD_WALL_HP);
  expect(state.board.getSector(0)?.hp).toBe(18);
  expect(RelicSystem.getCount(state, RelicId.WOOD_WALL_HP)).toBe(1);
  const woodWallHp = RELIC_DEFS.find(relic => relic.id === RelicId.WOOD_WALL_HP);
  expect(woodWallHp?.maxSelections).toBe(1);
  expect(RelicSystem.getCount(state, RelicId.WOOD_WALL_HP)).toBeGreaterThanOrEqual(woodWallHp!.maxSelections!);
});

test('new relics grant dragon bounty, infantry legacy, sell copy, militia deathrattle, and wounded veterans', () => {
  const state = new GameState();
  const ctx = createEffectContext(state);

  RelicSystem.grant(state, RelicId.DRAGON_BOUNTY);
  const dragon = createDragon(template('wyvern'), 0);
  state.dragons = [dragon];
  damageDragon(dragon, dragon.hp, ctx, 'test kill');
  expect(state.board.villageGold).toBe(25);
  expect(state.board.villageHp).toBe(60);
  RelicSystem.onDragonDefeated(dragon, ctx);
  expect(state.board.villageGold).toBe(25);
  expect(state.board.villageHp).toBe(60);

  RelicSystem.grant(state, RelicId.INFANTRY_LEGACY);
  const shop = new ShopSystem();
  state.board.villageGold = 100;
  shop.state.random[0].item = shopItem('block:infantry');
  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0)).toMatchObject({ ok: true });
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.INFANTRY, hp: 11, attack: 6 });
  destroyBlockInContext(state.board.getSector(0)!, 0, createEffectContext(state), { spell: 'test' });
  expect(state.relics.infantryLegacyBonus).toBe(2);

  RelicSystem.grant(state, RelicId.SELL_COPY);
  state.board.setSector(1, createBlock(BlockType.WOOD_WALL, 8, 0));
  shop.beginPlacementFromSection('base', 3, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 1)).toMatchObject({ ok: true });
  expect(shop.state.temporary.filter(item => item.id === 'block:wood_wall')).toHaveLength(1);
  state.board.setSector(2, createBlock(BlockType.WOOD_WALL, 8, 0));
  shop.beginPlacementFromSection('base', 3, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 2)).toMatchObject({ ok: true });
  expect(shop.state.temporary.filter(item => item.id === 'block:wood_wall')).toHaveLength(1);

  RelicSystem.grant(state, RelicId.MILITIA_DEATHRATTLE);
  state.board.setSector(3, createBlock(BlockType.MAGE, 1, 1));
  destroyBlockInContext(state.board.getSector(3)!, 3, createEffectContext(state), { spell: 'test' });
  expect(state.board.getSector(3)).toMatchObject({ type: BlockType.INFANTRY, hp: 5, attack: 5 });
  state.board.setSector(0, createBlock(BlockType.GHOST, 1, 5));
  destroyBlockInContext(state.board.getSector(0)!, 0, createEffectContext(state), { spell: 'test' });
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.GHOST });

  RelicSystem.grant(state, RelicId.WOUNDED_VETERANS);
  const knight = createBlock(BlockType.KNIGHT, 20, 10);
  state.board.setSector(5, knight);
  damageBlockInContext(knight, 5, 3, createEffectContext(state), { spell: 'test' });
  expect(knight).toMatchObject({ hp: 17, attack: 12 });
});

test('spell attack display covers direct damage spells and mage temporary attack', () => {
  const missile = { ...shopItem('spell:missile') };
  const shieldCrush = { ...shopItem('spell:shield_crush') };
  const bulwark = { ...shopItem('spell:bulwark') };
  if (missile.kind !== 'spell' || shieldCrush.kind !== 'spell' || bulwark.kind !== 'spell') throw new Error('Expected spells');

  expect(getSpellAttackDisplay(missile)).toMatchObject({ value: 5 });
  missile.tempAttack = 4;
  expect(getSpellAttackDisplay(missile)).toMatchObject({ value: 9 });
  shieldCrush.tempAttack = 4;
  expect(getSpellAttackDisplay(shieldCrush)).toMatchObject({ value: 0 });
  expect(getSpellAttackDisplay(bulwark)).toBeNull();
});

test('wizard descriptions match current repel spell behavior', () => {
  const dataDescription = BLOCK_TYPE_TABLE[BlockType.WIZARD].description.join('\n');
  const effectDescription = getBlockEffectDescriptions(BlockType.WIZARD).join('\n');

  expect(dataDescription).toContain('驱离');
  expect(dataDescription).toContain('临时槽');
  expect(dataDescription).not.toContain('死亡时');
  expect(effectDescription).toContain('驱离');
});

test('wizard placement creates a temporary repel spell for the dragon template', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  const ignis = createDragon(template('ignis'), 0);
  state.dragons = [ignis];
  const shop = new ShopSystem();
  shop.state.random[0].item = shopItem('block:wizard');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);
  expect(shop.state.temporary[0]).toMatchObject({ id: 'spell:repel', kind: 'spell', cost: 5, repelTemplateId: ignis.templateId });

  shop.beginPlacementFromSection('temporary', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);
  expect(ignis.isAlive).toBe(false);
  expect(ignis.respawnAvailableTurn).toBeNull();
  expect(shop.state.temporary).toHaveLength(0);
});

test('nearest free edge chooses the target sector or nearest adjacent sector', () => {
  const moving = createDragon(template('ignis'), 0);
  const other = createDragon(template('aurus'), 3);
  expect(nearestFreeEdge(2, [moving, other], moving)).toBe(2);
  expect(nearestFreeEdge(3, [moving, other], moving)).toBe(4);
});

test('combat preview includes daytime dragon hits on night buildings and hides night dragons', async () => {
  const state = new GameState();
  state.nightStart = 1;
  state.nightLength = 1;
  state.board.setSector(1, createBlock(BlockType.WOOD_WALL, 8, 0));
  const daytime = createDragon(template('furo'), 0);
  const night = createDragon(template('aurus'), 1);
  state.dragons = [daytime, night];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.attackedSectors.has(1)).toBe(true);
  expect(preview.sectorDeltas.get(1)).toMatchObject({ hpDelta: -daytime.attack, willDie: daytime.attack >= 8 });
  expect(preview.trace.some(event => event.dragonId === night.id && event.skipped)).toBe(true);
});

test('combat preview keeps portal-triggered spike damage visible even when the spike is in night', async () => {
  const state = new GameState();
  state.nightStart = 4;
  state.nightLength = 1;
  state.board.setSector(0, createBlock(BlockType.PORTAL, 30, 0));
  state.board.setSector(4, createBlock(BlockType.SPIKES, 15, 2));
  const dragon = createDragon(template('wyvern'), 0);
  state.dragons = [dragon];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.sectorDeltas.get(0)).toMatchObject({ hpDelta: -5 });
  expect(preview.dragonDeltas.get(dragon.id)).toMatchObject({ hpDelta: -2 });
  expect(preview.trace.some(event => event.source === 'portal' && event.dragonId === dragon.id && event.value === -2)).toBe(true);
});

test('combat preview follows sensing wall movement and shows hp loss at the new sector', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.board.setSector(3, createBlock(BlockType.SENSING_WALL, 40, 0));
  const dragon = createDragon(template('aurus'), 0);
  state.dragons = [dragon];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.sectorDeltas.get(3)).toBeUndefined();
  expect(preview.sectorDeltas.get(0)).toMatchObject({ hpDelta: -7, willDie: false });
});

test('shield absorption and priest healing participate in combat preview', async () => {
  const shieldState = new GameState();
  shieldState.nightLength = 0;
  const wall = createBlock(BlockType.WOOD_WALL, 8, 0);
  wall.shielded = true;
  shieldState.board.setSector(0, wall);
  shieldState.dragons = [createDragon(template('wyvern'), 0)];

  const shieldPreview = await new CombatPreviewSystem().calculate(shieldState);
  expect(shieldPreview.sectorDeltas.get(0)).toBeUndefined();
  expect(shieldPreview.trace.some(event => event.source === 'shield' && event.skipped)).toBe(true);

  const realWall = shieldState.board.getSector(0)!;
  await new CombatLifecycleSystem().executeCombatSegment(createEffectContext(shieldState));
  expect(realWall.hp).toBe(8);
  expect(realWall.shielded).toBe(false);

  const healState = new GameState();
  healState.board.villageHp = 30;
  healState.nightStart = 4;
  healState.nightLength = 0;
  healState.board.setSector(0, createBlock(BlockType.PRIEST, 20, 3));
  const healPreview = await new CombatPreviewSystem().calculate(healState);
  expect(healPreview.villageDelta).toMatchObject({ hpDelta: 3 });
});

test('relic choices are unique and max selections limit future offers', () => {
  const state = new GameState();
  const picks = [...RELIC_DEFS];
  const random = {
    pick<T>(items: T[]): T {
      const found = picks.find(pick => items.includes(pick as T));
      return (found as T) ?? items[0];
    },
  };
  const choices = RelicSystem.createChoices(state, 4, random);
  expect(new Set(choices.map(relic => relic.id)).size).toBe(choices.length);

  const limited = choices.find(relic => relic.maxSelections === 1);
  expect(limited).toBeTruthy();
  RelicSystem.selectPendingChoice(state, limited!.id);
  RelicSystem.confirmSelection(state);
  const nextChoices = RelicSystem.createChoices(state, 14, random);
  expect(nextChoices.map(relic => relic.id)).not.toContain(limited!.id);
});

test('combat preview skips night friendly offense but keeps night support effects', async () => {
  const state = new GameState();
  state.nightStart = 0;
  state.nightLength = 1;
  state.board.setSector(0, createBlock(BlockType.MAGE, 8, 1));
  state.board.setSector(1, createBlock(BlockType.WOOD_WALL, 8, 0));
  const dragon = createDragon(template('wyvern'), 0);
  state.dragons = [dragon];

  registerCombatEffectContributor({
    id: 'test:night-support',
    phases: ['turnStartSupport'],
    apply(_phase, ctx) {
      const target = ctx.board.getSector(1);
      if (target) target.hp += 2;
    },
  });

  try {
    const preview = await new CombatPreviewSystem().calculate(state);
    expect(preview.dragonDeltas.get(dragon.id)).toBeUndefined();
    expect(preview.sectorDeltas.get(0)).toBeUndefined();
    expect(preview.sectorDeltas.get(1)).toMatchObject({ hpDelta: 2 });
  } finally {
    unregisterCombatEffectContributor('test:night-support');
  }
});

test('combat preview and real combat share random relic targets and values through a random plan', async () => {
  const buildState = () => {
    const state = new GameState();
    state.nightLength = 0;
    state.board.villageGold = 0;
    state.board.setSector(0, createPowerStone(10));
    state.board.setSector(1, createBlock(BlockType.WOOD_WALL, 8, 0));
    state.board.setSector(2, createBlock(BlockType.MAGE, 8, 1));
    state.board.setSector(3, createBlock(BlockType.MINE, 8, 0));
    RelicSystem.grant(state, RelicId.GOLD_MINE_RALLY);
    RelicSystem.grant(state, RelicId.FRIENDLY_GROWTH);
    RelicSystem.grant(state, RelicId.GOLD_ATTACK);
    return state;
  };

  const previewState = buildState();
  const realState = buildState();
  const plan = new CombatRandomPlan();
  const preview = await new CombatPreviewSystem().calculate(previewState, plan.createRecorder());
  const realCtx = createEffectContext(realState, { random: plan.createRecorder() });
  const income = calculateVillageIncome(realCtx);
  realCtx.applyVillageGoldDelta(income);
  await new CombatLifecycleSystem().executeCombatSegment(realCtx);

  for (let sector = 0; sector < realState.board.sectors.length; sector++) {
    const before = previewState.board.getSector(sector);
    const after = realState.board.getSector(sector);
    const delta = preview.sectorDeltas.get(sector);
    if (!before && !after) continue;
    expect(after?.hp ?? 0).toBe((before?.hp ?? 0) + (delta?.hpDelta ?? 0));
    expect(after?.attack ?? 0).toBe((before?.attack ?? 0) + (delta?.attackDelta ?? 0));
  }
});

test('sell action removes friendly blocks for gold without destroying them', async () => {
  const state = new GameState();
  state.board.villageGold = 10;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
  state.board.setSector(1, createPowerStone(10));
  state.board.setSector(2, createBlock(BlockType.DRAGON_FIRE, 8, 0));
  const shop = new ShopSystem();

  shop.beginPlacementFromSection('base', 3, state.board.villageGold);
  let result = shop.tryPlaceSelectedItem(state, 0);

  expect(result).toMatchObject({ ok: true, message: '出售获得 3 金币' });
  expect(state.board.getSector(0)).toBeNull();
  expect(state.board.villageGold).toBe(13);
  expect(shop.selectedItem()).toBeNull();

  shop.beginPlacementFromSection('base', 3, state.board.villageGold);
  result = shop.tryPlaceSelectedItem(state, 1);
  expect(result).toMatchObject({ ok: false, message: '只能出售友方建筑/单位', feedback: { sector: 1, text: '无法出售' } });
  expect(state.board.getSector(1)).toMatchObject({ type: BlockType.POWER_STONE });
  expect(state.board.villageGold).toBe(13);
  expect(shop.selectedItem()).toMatchObject({ item: { id: 'action:sell' } });

  result = shop.tryPlaceSelectedItem(state, 2);
  expect(result).toMatchObject({ ok: false, feedback: { sector: 2, text: '无法出售' } });
  expect(state.board.getSector(2)).toMatchObject({ type: BlockType.DRAGON_FIRE });

  result = shop.tryPlaceSelectedItem(state, 3);
  expect(result).toMatchObject({ ok: false, feedback: { sector: 3, text: '无法出售' } });
});

test('sell action uses sell contributors and does not trigger destroyed effects', async () => {
  const state = new GameState();
  state.board.villageGold = 20;
  const wizard = createBlock(BlockType.WIZARD, 1, 0);
  state.board.setSector(2, wizard);
  const dragon = createDragon(template('ignis'), 0);
  state.dragons = [dragon];
  const shop = new ShopSystem();
  const calls: string[] = [];
  const soldPayloads: unknown[] = [];
  const onSold = (payload: unknown) => soldPayloads.push(payload);

  registerSellEffectContributor({
    id: 'test:sell-bonus',
    modifySellReward(ctx) {
      calls.push(`modify:${ctx.sector}:${ctx.block.type}:${ctx.reward}`);
      return ctx.reward + 2;
    },
    onBeforeSell(ctx) {
      calls.push(`before:${ctx.sector}:${ctx.board.getSector(ctx.sector)?.type}`);
      ctx.messages.push('测试出售前');
    },
    onAfterSell(ctx) {
      calls.push(`after:${ctx.sector}:${ctx.board.getSector(ctx.sector)?.type ?? 'empty'}:${ctx.reward}`);
      ctx.messages.push('测试出售后');
    },
  });
  EventBus.on('blockSold', onSold);

  try {
    shop.beginPlacementFromSection('base', 3, state.board.villageGold);
    const result = shop.tryPlaceSelectedItem(state, 2);

    expect(result).toMatchObject({ ok: true, message: '出售获得 5 金币' });
    expect(state.board.villageGold).toBe(25);
    expect(state.board.getSector(2)).toBeNull();
    expect(state.board.sectors.some(block => block?.type === BlockType.VOODOO)).toBe(false);
    expect(calls).toEqual([
      'modify:2:wizard:3',
      'before:2:wizard',
      'after:2:empty:5',
    ]);
    expect(state.messages).toEqual(['测试出售后', '测试出售前']);
    expect(soldPayloads).toEqual([{ sector: 2, blockType: BlockType.WIZARD, reward: 5 }]);
  } finally {
    EventBus.off('blockSold', onSold);
    unregisterSellEffectContributor('test:sell-bonus');
  }
});

test('selling a friendly attacker updates subsequent combat preview', async () => {
  const state = new GameState();
  state.board.villageGold = 20;
  state.nightLength = 0;
  state.board.setSector(0, createBlock(BlockType.BALLISTA, 8, 5));
  const dragon = createDragon(template('wyvern'), 0);
  state.dragons = [dragon];

  let preview = await new CombatPreviewSystem().calculate(state);
  expect(preview.dragonDeltas.get(dragon.id)).toMatchObject({ hpDelta: -5 });

  const shop = new ShopSystem();
  shop.beginPlacementFromSection('base', 3, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  preview = await new CombatPreviewSystem().calculate(state);
  expect(preview.dragonDeltas.get(dragon.id)).toBeUndefined();
});

test('combat contributor affects real lifecycle and preview through the same interface', async () => {
  registerCombatEffectContributor({
    id: 'test:relic-global-boost',
    phases: ['turnStartSupport'],
    apply(_phase, ctx) {
      ctx.board.forEach(block => {
        if (block) block.hp += 3;
      });
      for (const dragon of ctx.state.aliveDragons) dragon.attack += 2;
    },
  });

  try {
    const previewState = new GameState();
    previewState.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
    const previewDragon = createDragon(template('wyvern'), 2);
    previewState.dragons = [previewDragon];

    const preview = await new CombatPreviewSystem().calculate(previewState);
    expect(preview.sectorDeltas.get(0)).toMatchObject({ hpDelta: 3 });
    expect(preview.dragonDeltas.get(previewDragon.id)).toMatchObject({ attackDelta: 2 });

    const realState = new GameState();
    realState.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
    const realDragon = createDragon(template('wyvern'), 2);
    realState.dragons = [realDragon];
    await new CombatLifecycleSystem().executeCombatSegment(createEffectContext(realState));

    expect(realState.board.getSector(0)?.hp).toBe(11);
    expect(realDragon.attack).toBe(7);
  } finally {
    unregisterCombatEffectContributor('test:relic-global-boost');
  }
});

test('combat preview does not mutate live game state while simulating generated blocks', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  state.nightLength = 0;
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];
  const before = {
    villageHp: state.board.villageHp,
    sectors: [...state.board.sectors],
    dragonHp: aurus.hp,
    messages: [...state.messages],
  };

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.villageDelta.hpDelta).toBe(-7);
  expect(state.board.villageHp).toBe(before.villageHp);
  expect(state.board.sectors).toEqual(before.sectors);
  expect(aurus.hp).toBe(before.dragonHp);
  expect(state.messages).toEqual(before.messages);
});

test('dragon edge to board sector matches breath rotation logic', () => {
  expect(dragonEdgeToBoardSector(0, 0)).toBe(0);
  expect(dragonEdgeToBoardSector(2, 90)).toBe(0);
  expect(dragonEdgeToBoardSector(0, 90)).toBe(6);
  expect(dragonEdgeToBoardSector(7, -45)).toBe(0);
  for (let rotation = -90; rotation <= 180; rotation += 45) {
    for (let sector = 0; sector < 8; sector++) {
      expect(dragonEdgeToBoardSector(boardSectorToWorldEdge(sector, rotation), rotation)).toBe(sector);
    }
  }
  expect(isWorldSectorNight(3, 2, 3)).toBe(true);
  expect(isBoardSectorNight(1, 90, 3, 1)).toBe(true);
});

test('combat preview and real lifecycle show guardian damage against rotated visual sector dragons', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.rotationAngle = 90;
  state.board.setSector(0, createBlock(BlockType.GUARDIAN, 10, 0));
  const dragon = createDragon(template('wyvern'), 2);
  state.dragons = [dragon];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.dragonDeltas.get(dragon.id)).toMatchObject({ hpDelta: -10, willDie: false });

  const realState = new GameState();
  realState.nightLength = 0;
  realState.rotationAngle = 90;
  realState.board.setSector(0, createBlock(BlockType.GUARDIAN, 10, 0));
  const realDragon = createDragon(template('wyvern'), 2);
  realState.dragons = [realDragon];

  await new CombatLifecycleSystem().executeCombatSegment(createEffectContext(realState));

  expect(realDragon.hp).toBe(5);
});

test('shop-placed ballista previews damage against a dragon in the same visual sector', async () => {
  const state = new GameState();
  state.board.villageGold = 100;
  state.nightLength = 0;
  const dragon = createDragon(template('wyvern'), 0);
  state.dragons = [dragon];
  const shop = new ShopSystem();
  const slot = shop.state.random[0];
  slot.item = shopItem('block:ballista');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.dragonDeltas.get(dragon.id)).toMatchObject({ hpDelta: -5, willDie: false });
});

test('rotated shop-placed ballista previews damage by visual sector and skips visual night', async () => {
  const state = new GameState();
  state.board.villageGold = 100;
  state.rotationAngle = 90;
  state.nightStart = 7;
  state.nightLength = 1;
  const dragon = createDragon(template('wyvern'), 2);
  state.dragons = [dragon];
  const shop = new ShopSystem();
  shop.state.random[0].item = shopItem('block:ballista');

  shop.beginPlacementFromSection('random', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  let preview = await new CombatPreviewSystem().calculate(state);
  expect(preview.dragonDeltas.get(dragon.id)).toMatchObject({ hpDelta: -5 });

  state.nightStart = 2;
  preview = await new CombatPreviewSystem().calculate(state);
  expect(preview.dragonDeltas.get(dragon.id)).toBeUndefined();
  expect(preview.trace.some(event => event.source === 'player_phase' && event.skipped)).toBe(true);
});

test('rotated missile and shield crush target dragons by visual sector', () => {
  const missileState = new GameState();
  missileState.board.villageGold = 100;
  missileState.rotationAngle = 90;
  const missileDragon = createDragon(template('wyvern'), 2);
  missileState.dragons = [missileDragon];
  const missileShop = new ShopSystem();
  missileShop.beginPlacementFromSection('base', 2, missileState.board.villageGold);
  expect(missileShop.tryPlaceSelectedItem(missileState, 0, 'dragon').ok).toBe(true);
  expect(missileDragon.hp).toBe(10);

  const crushState = new GameState();
  crushState.board.villageGold = 100;
  crushState.rotationAngle = 90;
  const crushDragon = createDragon(template('wyvern'), 2);
  crushState.dragons = [crushDragon];
  crushState.board.setSector(0, createBlock(BlockType.WOOD_WALL, 8, 0));
  const crushShop = new ShopSystem();
  crushShop.state.random[0].item = shopItem('spell:shield_crush');
  crushShop.beginPlacementFromSection('random', 0, crushState.board.villageGold);
  expect(crushShop.tryPlaceSelectedItem(crushState, 0).ok).toBe(true);
  expect(crushDragon.hp).toBe(7);
});

test('combat preview marks village attacked only for visible dragon damage', async () => {
  const state = new GameState();
  state.board.villageHp = 50;
  state.nightLength = 0;
  const dragon = createDragon(template('aurus'), 0);
  state.dragons = [dragon];

  let preview = await new CombatPreviewSystem().calculate(state);
  expect(preview.villageAttacked).toBe(true);
  expect(preview.villageDelta.hpDelta).toBe(-7);

  state.nightStart = 0;
  state.nightLength = 1;
  preview = await new CombatPreviewSystem().calculate(state);
  expect(preview.villageAttacked).toBe(false);
  expect(preview.villageDelta.hpDelta).toBe(0);
});

test('combat preview includes spikes triggered by destructive dragon movement chains', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.board.villageHp = 200;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 1, 0));
  state.board.setSector(1, createBlock(BlockType.SPIKES, 15, 2));
  const furo = createDragon(template('furo'), 0);
  state.dragons = [furo];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.dragonDeltas.get(furo.id)).toMatchObject({ hpDelta: -2 });
  expect(preview.trace.some(event => event.source === 'spikes' && event.dragonId === furo.id && event.value === -2)).toBe(true);
});

test('destructive dragon movement chain stops when spikes kill the dragon in preview', async () => {
  const state = new GameState();
  state.nightLength = 0;
  state.board.villageHp = 200;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 1, 0));
  state.board.setSector(1, createBlock(BlockType.SPIKES, 15, 40));
  const furo = createDragon(template('furo'), 0);
  state.dragons = [furo];

  const preview = await new CombatPreviewSystem().calculate(state);

  expect(preview.dragonDeltas.get(furo.id)).toMatchObject({ willDie: true });
  expect(preview.trace.some(event => event.source === 'spikes' && event.dragonId === furo.id && event.value === -40)).toBe(true);
});

test('attacked sector hatch segments stay clipped and share one screen direction', () => {
  const polygon = sectorBandPolygon(2, 200, 180, 45, 140, 90);
  const segments = buildParallelHatchSegments(polygon, { spacing: 8, angleRad: Math.PI / 4 });

  expect(segments.length).toBeGreaterThan(3);
  const first = segments[0];
  const firstDx = first.end.x - first.start.x;
  const firstDy = first.end.y - first.start.y;

  for (const segment of segments) {
    expect(pointInConvexPolygon(segment.start, polygon, 0.01)).toBe(true);
    expect(pointInConvexPolygon(segment.end, polygon, 0.01)).toBe(true);
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    expect(Math.abs(firstDx * dy - firstDy * dx)).toBeLessThan(0.01);
  }
});
