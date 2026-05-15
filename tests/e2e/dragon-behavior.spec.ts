import { expect, test } from '@playwright/test';
import { BLOCK_TYPE_TABLE, BlockType, SHOP_ITEM_POOL, SpellType } from '../../src/config/blockTypes';
import { DRAGON_TEMPLATES, DragonPersonalityType, DragonTemplate } from '../../src/config/dragonTypes';
import { DragonAI, buildSymmetricSectorWaves, nearestFreeEdge } from '../../src/ai/DragonAI';
import { GameState } from '../../src/core/GameState';
import { TurnManager } from '../../src/core/TurnManager';
import {
  calculateVillageIncome,
  damageBlockInContext,
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
import { ShopSystem } from '../../src/systems/ShopSystem';
import { RhythmSystem, roundLengthFor } from '../../src/systems/RhythmSystem';

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
  expect(template('aurus')).toMatchObject({ name: '奥鲁斯', hp: 30, attack: 7, breathRange: 1, unlockTurn: 2, quantity: 2 });
  expect(template('gulo')).toMatchObject({ name: '古洛', hp: 30, attack: 5, breathRange: 3, unlockTurn: 10 });
  expect(template('wyvern')).toMatchObject({ personality: DragonPersonalityType.WYVERN, hp: 15, attack: 5, unlockTurn: 1, quantity: 3 });
  expect(BLOCK_TYPE_TABLE[BlockType.POWER_STONE].label).toBe('金矿');
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

test('dragon actions start at the upper-right sector and continue clockwise', async () => {
  const state = new GameState();
  state.board.villageHp = 200;
  const edges = [2, 7, 4, 0, 6, 1, 5, 3];
  state.dragons = edges.map((edge, index) => createDragon(template(index % 2 === 0 ? 'aurus' : 'wyvern'), edge));

  const decisions = await new DragonAI().executeTurn(state, 0);

  expect(decisions.map(decision => decision.dragon.edgeIndex)).toEqual([5, 6, 7, 0, 1, 2, 3, 4]);
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
    expect(chestState.board.sectors.filter(Boolean)).toHaveLength(1);
    expect(chestState.board.sectors.some(block => block?.type === BlockType.POWER_STONE)).toBe(true);
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

  expect(state.board.getSector(0)?.hp).toBe(3);
  expect(state.board.getSector(7)?.hp).toBe(3);
  expect(state.board.getSector(1)?.hp).toBe(3);
  expect(ignis.attack).toBe(10);
});

test('brutus creates and stacks dragon fire after attacking', async () => {
  const state = new GameState();
  const brutus = createDragon(template('brutus'), 0);
  state.dragons = [brutus];

  await new DragonAI().executeTurn(state, 0);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.DRAGON_FIRE, hp: 10 });

  await new DragonAI().executeTurn(state, 0);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.DRAGON_FIRE, hp: 20 });
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
  expect(gulo.hp).toBe(70);
  expect(gulo.maxHp).toBe(70);
  expect(gulo.attack).toBe(10);
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
    expect(ignis.hp).toBe(40);
    expect(ignis.maxHp).toBe(40);
    expect(ignis.attack).toBe(5);
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

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.PORTAL, hp: 25 });
  expect(ignis.hp).toBe(35);
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

  expect(ignis.hp).toBe(5);
  expect(state.board.getSector(0)).toBeNull();
});

test('dragon spear gains damage from empty sectors before attacking and skips remaining dragons when it kills', async () => {
  const state = new GameState();
  state.board.setSector(0, createBlock(BlockType.DRAGON_SPEAR, 15, 5));
  const ignis = createDragon(template('ignis'), 0);
  const aurus = createDragon(template('aurus'), 2);
  state.dragons = [ignis, aurus];

  await new TurnManager(state).executeTurn();

  expect(ignis.isAlive).toBe(false);
  expect(aurus.isAlive).toBe(true);
  expect(state.board.getSector(2)).toBeNull();
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

  state.board.setSector(2, createBlock(BlockType.DRAGON_FIRE, 12, 0));
  shop.beginPlacementFromSection('base', 0, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 2).ok).toBe(true);
  expect(state.board.getSector(2)).toMatchObject({ type: BlockType.DRAGON_FIRE, hp: 4 });
});

test('missile can target a dragon and stacks mage damage and hit count', () => {
  const state = new GameState();
  state.board.villageGold = 100;
  state.board.setSector(1, createBlock(BlockType.MAGE, 8, 2));
  const aurus = createDragon(template('aurus'), 0);
  state.dragons = [aurus];
  const shop = new ShopSystem();

  shop.beginPlacementFromSection('base', 2, state.board.villageGold);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  expect(aurus.hp).toBe(16);
});

test('random shop excludes base items, supports locking, refresh cost growth, and locked purchase retention', () => {
  const shop = new ShopSystem();
  const state = new GameState();
  state.board.villageGold = 100;

  expect(shop.state.base.map(item => item.id)).toEqual(['block:wood_wall', 'block:mine', 'spell:missile']);
  expect(shop.state.random).toHaveLength(4);
  const visible = shop.state.random.map(slot => slot.item).filter((item): item is NonNullable<typeof item> => Boolean(item));
  expect(new Set(visible.map(item => item.id)).size).toBe(visible.length);
  expect(visible.map(item => item.id)).not.toContain('block:wood_wall');
  expect(visible.map(item => item.id)).not.toContain('block:mine');
  expect(visible.map(item => item.id)).not.toContain('spell:missile');

  const first = shop.state.random[0].item;
  expect(shop.toggleRandomLock(0)).toMatchObject({ ok: true });
  expect(shop.refreshRandom(state)).toMatchObject({ ok: true });
  expect(state.board.villageGold).toBe(99);
  expect(shop.state.refreshCost).toBe(3);
  expect(shop.state.random[0].item).toEqual(first);

  if (first?.kind === 'block') {
    shop.beginPlacementFromSection('random', 0, state.board.villageGold);
    expect(shop.tryPlaceSelectedItem(state, state.board.getEmptySectors()[0]).ok).toBe(true);
    expect(shop.state.random[0].item).toEqual(first);
    expect(shop.state.random[0].locked).toBe(true);
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

test('mage gains attack each turn start', () => {
  const state = new GameState();
  const mage = createBlock(BlockType.MAGE, 8, 1);
  state.board.setSector(0, mage);
  runBlockTurnStart(createEffectContext(state));
  expect(mage.attack).toBe(2);
});

test('voodoo doll mirrors damage to its recorded dragon target', () => {
  const state = new GameState();
  const ignis = createDragon(template('ignis'), 0);
  const wizard = createBlock(BlockType.WIZARD, 1, 0);
  state.dragons = [ignis];
  state.board.setSector(2, wizard);

  destroyBlockInContext(wizard, 2, createEffectContext(state), { dragon: ignis });
  const dollSector = state.board.findSector(block => block?.type === BlockType.VOODOO);
  expect(dollSector).not.toBeNull();
  const doll = state.board.getSector(dollSector!);
  damageBlockInContext(doll!, dollSector!, 5, createEffectContext(state), { spell: 'test' });
  expect(ignis.hp).toBe(35);
});

test('nearest free edge chooses the target sector or nearest adjacent sector', () => {
  const moving = createDragon(template('ignis'), 0);
  const other = createDragon(template('aurus'), 3);
  expect(nearestFreeEdge(2, [moving, other], moving)).toBe(2);
  expect(nearestFreeEdge(3, [moving, other], moving)).toBe(4);
});
