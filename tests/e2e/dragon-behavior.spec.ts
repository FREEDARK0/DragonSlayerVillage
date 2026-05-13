import { expect, test } from '@playwright/test';
import { BLOCK_TYPE_TABLE, BlockType, SpellType } from '../../src/config/blockTypes';
import { DRAGON_TEMPLATES, DragonPersonalityType, DragonTemplate } from '../../src/config/dragonTypes';
import { DragonAI } from '../../src/ai/DragonAI';
import { GameState } from '../../src/core/GameState';
import { TurnManager } from '../../src/core/TurnManager';
import {
  calculateVillageIncome,
  destroyBlockInContext,
  getBlockEffectDescriptions,
} from '../../src/effects/BlockEffectRegistry';
import { createEffectContext } from '../../src/effects/EffectContext';
import { getDragonBehavior } from '../../src/effects/DragonBehaviorRegistry';
import { createBlock, createPowerStone } from '../../src/models/Block';
import { createDragon, dragonTakeDamage, markDragonDefeated } from '../../src/models/Dragon';
import { ShopSystem } from '../../src/systems/ShopSystem';

function template(id: string): DragonTemplate {
  const found = DRAGON_TEMPLATES.find(dragon => dragon.id === id);
  if (!found) throw new Error(`Missing dragon template: ${id}`);
  return found;
}

test('dragon templates expose copy limits and gold mine naming', () => {
  expect(template('aurus')).toMatchObject({ name: '奥鲁斯', quantity: 2 });
  expect(template('gulo')).toMatchObject({ name: '古洛', baseCombatPower: 20 });
  expect(template('wyvern')).toMatchObject({
    name: '亚龙',
    personality: DragonPersonalityType.WYVERN,
    baseCombatPower: 15,
    minYear: 1,
    quantity: 3,
  });

  const regularTemplates = DRAGON_TEMPLATES.filter(dragon => dragon.id !== 'aurus' && dragon.id !== 'wyvern');
  expect(regularTemplates.every(dragon => dragon.quantity === 1)).toBe(true);
  expect(BLOCK_TYPE_TABLE[BlockType.POWER_STONE].label).toBe('金矿');
});

test('aurus breath creates a level one gold mine on empty sectors and still damages the village', () => {
  const state = new GameState();
  state.board.villagePower = 50;
  const aurus = createDragon(template('aurus'), 1, 0);
  state.dragons = [aurus];

  const decisions = new DragonAI().executeTurn(state, 0);
  const goldMine = state.board.getSector(0);

  expect(decisions).toHaveLength(1);
  expect(decisions[0].targetSectors).toEqual([0]);
  expect(goldMine).toMatchObject({ type: BlockType.POWER_STONE, level: 1 });
  expect(goldMine?.combatPower).toBeGreaterThanOrEqual(1);
  expect(goldMine?.combatPower).toBeLessThanOrEqual(20);
  expect(state.board.villagePower).toBe(50 - Math.round(aurus.combatPower * aurus.attackMultiplier));
});

test('wyvern leaves after taking damage', () => {
  const state = new GameState();
  const wyvern = createDragon(template('wyvern'), 1, 0);
  state.dragons = [wyvern];

  dragonTakeDamage(wyvern, 1);
  new DragonAI().handlePostTurn(state);

  expect(wyvern.hasTakenDamage).toBe(true);
  expect(wyvern.isAlive).toBe(false);
  expect(wyvern.respawnAvailableTurn).toBeNull();
});

test('furo moves clockwise and continues attacking after breaking blocks, then leaves below three blocks', () => {
  const state = new GameState();
  state.board.villagePower = 100;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 1));
  state.board.setSector(2, createBlock(BlockType.WOOD_WALL, 1));
  const furo = createDragon(template('furo'), 1, 0);
  state.dragons = [furo];

  const decisions = new DragonAI().executeTurn(state, 0);

  expect(decisions.length).toBeGreaterThanOrEqual(3);
  expect(decisions[0].targetSectors).toEqual([7, 0, 1]);
  expect(decisions[1].targetSectors).toEqual([0, 1, 2]);
  expect(state.board.getSector(0)).toBeNull();
  expect(state.board.getSector(2)).toBeNull();
  expect(furo.edgeIndex).toBe(2);

  new DragonAI().handlePostTurn(state);
  expect(furo.isAlive).toBe(false);
});

test('destructive dragon descriptions match its current alternating pursuit behavior', () => {
  const furo = createDragon(template('furo'), 1, 0);
  const behavior = getDragonBehavior(DragonPersonalityType.DESTRUCTIVE);
  const descriptions = behavior.effectDescriptions?.(furo) ?? [];

  expect(behavior.describe(furo, [0])).toContain('破坏吐息');
  expect(descriptions.join('\n')).toContain('吐息范围在 1 扇区与 3 扇区之间交替变化');
  expect(descriptions.join('\n')).toContain('击破地块后顺时针移动并继续攻击');
  expect(descriptions.join('\n')).not.toContain('已造成');
});

test('sensing wall moves into an empty breath target and prevents empty-sector effects', () => {
  const state = new GameState();
  state.board.villagePower = 50;
  state.board.setSector(2, createBlock(BlockType.SENSING_WALL, 20));
  const aurus = createDragon(template('aurus'), 1, 0);
  state.dragons = [aurus];

  new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(2)).toBeNull();
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.SENSING_WALL, combatPower: 15 });
  expect(state.board.villagePower).toBe(50);
});

test('arrogant dragon damages center, strengthens sides, and increases attack multiplier', () => {
  const state = new GameState();
  state.board.villagePower = 100;
  state.board.setSector(7, createBlock(BlockType.WOOD_WALL, 10));
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 10));
  state.board.setSector(1, createBlock(BlockType.WOOD_WALL, 10));
  const ignis = createDragon(template('ignis'), 1, 0);
  state.dragons = [ignis];

  new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(0)?.combatPower).toBe(4);
  expect(state.board.getSector(7)?.combatPower).toBe(16);
  expect(state.board.getSector(1)?.combatPower).toBe(16);
  expect(ignis.attackMultiplier).toBeCloseTo(0.33);
});

test('brutal dragon creates and stacks dragon fire after attacking', () => {
  const state = new GameState();
  state.board.villagePower = 100;
  const brutus = createDragon(template('brutus'), 1, 0);
  state.dragons = [brutus];

  new DragonAI().executeTurn(state, 0);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.DRAGON_FIRE, combatPower: 10 });

  new DragonAI().executeTurn(state, 0);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.DRAGON_FIRE, combatPower: 20 });
});

test('gluttonous dragon consumes a daytime dragon after attacking, gains its power, and moves to its edge', () => {
  const state = new GameState();
  state.board.villagePower = 100;
  state.nightStart = 4;
  state.nightLength = 4;
  const gulo = createDragon(template('gulo'), 1, 0);
  const ignis = createDragon(template('ignis'), 1, 2);
  state.dragons = [gulo, ignis];

  const decisions = new DragonAI().executeTurn(state, 0);

  expect(decisions).toHaveLength(1);
  expect(gulo.attackCount).toBe(1);
  expect(gulo.combatPower).toBe(40);
  expect(gulo.maxCombatPower).toBe(40);
  expect(gulo.edgeIndex).toBe(2);
  expect(ignis.isAlive).toBe(false);
  expect(ignis.respawnAvailableTurn).toBe(6);
});

test('gluttonous dragon ignores dragons in night and leaves after its second attack', () => {
  const state = new GameState();
  state.board.villagePower = 100;
  state.nightStart = 4;
  state.nightLength = 4;
  const gulo = createDragon(template('gulo'), 1, 0);
  const wyvern = createDragon(template('wyvern'), 1, 6);
  state.dragons = [gulo, wyvern];

  new DragonAI().executeTurn(state, 0);
  expect(gulo.attackCount).toBe(1);
  expect(gulo.edgeIndex).toBe(0);
  expect(gulo.combatPower).toBe(20);
  expect(wyvern.isAlive).toBe(true);

  new DragonAI().executeTurn(state, 0);
  new DragonAI().handlePostTurn(state);

  expect(gulo.attackCount).toBe(2);
  expect(gulo.isAlive).toBe(false);
  expect(gulo.respawnAvailableTurn).toBeNull();
});

test('defeated dragons stay on cooldown for five full turns, then respawn by reusing the same instance', () => {
  const state = new GameState();
  state.year = 1;
  const manager = new TurnManager(state);
  const ignis = createDragon(template('ignis'), 1, 3);
  ignis.attackMultiplier = 0.77;
  ignis.turnCounter = 4;
  ignis.satiation = 18;
  ignis.damageDealt = 99;
  ignis.hasTakenDamage = true;
  ignis.attackCount = 2;
  markDragonDefeated(ignis, 6);
  state.dragons = [ignis];

  const originalMinYears = DRAGON_TEMPLATES.map(dragon => ({ id: dragon.id, minYear: dragon.minYear }));
  const originalRandom = Math.random;

  try {
    for (const dragon of DRAGON_TEMPLATES) {
      if (dragon.id !== 'ignis') dragon.minYear = 999;
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
    expect(ignis.combatPower).toBe(20);
    expect(ignis.maxCombatPower).toBe(20);
    expect(ignis.attackMultiplier).toBeCloseTo(0.3);
    expect(ignis.turnCounter).toBe(0);
    expect(ignis.satiation).toBe(0);
    expect(ignis.damageDealt).toBe(0);
    expect(ignis.hasTakenDamage).toBe(false);
    expect(ignis.attackCount).toBe(0);
  } finally {
    Math.random = originalRandom;
    for (const { id, minYear } of originalMinYears) {
      const dragon = DRAGON_TEMPLATES.find(candidate => candidate.id === id);
      if (dragon) dragon.minYear = minYear;
    }
  }
});

test('block descriptions use only 战力 terminology', () => {
  const descriptions = [
    ...getBlockEffectDescriptions(BlockType.KNIGHT, 1),
    ...getBlockEffectDescriptions(BlockType.MAGE, 1),
    ...getBlockEffectDescriptions(BlockType.BALLISTA, 1),
    ...getBlockEffectDescriptions(BlockType.PRESSURE_STONE, 1),
    ...getBlockEffectDescriptions(BlockType.WOOD_WALL, 1),
  ].join('\n');

  expect(descriptions).toContain('战力');
  expect(descriptions).not.toContain('力量');
  expect(descriptions).not.toContain('耐久');
});

test('pressure stone gains combat power once on placement and does not recalculate on upgrade', () => {
  const state = new GameState();
  state.board.villagePower = 200;
  state.dragons = [
    createDragon(template('ignis'), 1, 7),
    createDragon(template('aurus'), 1, 0),
    createDragon(template('wyvern'), 1, 1),
  ];
  state.dragons[0].combatPower = 10;
  state.dragons[1].combatPower = 20;
  state.dragons[2].combatPower = 30;
  const shop = new ShopSystem();

  shop.state.lockedSlots[0] = { id: 'block:pressure_stone', kind: 'block', label: '压力石', cost: 40, tags: ['无法攻击'], blockType: BlockType.PRESSURE_STONE, combatPower: 0 };
  shop.beginPlacementFromLockedWithPower(0, state.board.villagePower);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.PRESSURE_STONE, level: 1, combatPower: 12 });

  state.dragons[0].combatPower = 100;
  state.dragons[1].combatPower = 100;
  state.dragons[2].combatPower = 100;

  shop.state.lockedSlots[0] = { id: 'block:pressure_stone', kind: 'block', label: '压力石', cost: 40, tags: ['无法攻击'], blockType: BlockType.PRESSURE_STONE, combatPower: 0 };
  shop.beginPlacementFromLockedWithPower(0, state.board.villagePower);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);
  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.PRESSURE_STONE, level: 2, combatPower: 12 });
});

test('gold mine reward uses generated combat power times level for any destruction', () => {
  const state = new GameState();
  state.board.villagePower = 50;
  const mine = createPowerStone(2, 13);
  state.board.setSector(0, mine);

  destroyBlockInContext(mine, 0, createEffectContext(state), mine.combatPower);

  expect(state.board.getSector(0)).toBeNull();
  expect(state.board.villagePower).toBe(76);
});

test('guardian gains power when any friendly block is destroyed and ignores incoming damage', () => {
  const state = new GameState();
  state.board.villagePower = 100;
  const guardian = createBlock(BlockType.GUARDIAN, 5);
  const wall = createBlock(BlockType.WOOD_WALL, 10);
  state.board.setSector(0, guardian);
  state.board.setSector(1, wall);

  destroyBlockInContext(wall, 1, createEffectContext(state), wall.combatPower);
  expect(guardian.combatPower).toBe(6);

  const aurus = createDragon(template('aurus'), 1, 0);
  state.dragons = [aurus];
  new DragonAI().executeTurn(state, 0);

  expect(state.board.getSector(0)?.combatPower).toBe(6);
});

test('tavern income is fixed in day and scales only in night', () => {
  const state = new GameState();
  const tavern = createBlock(BlockType.TAVERN, 10, 1);
  state.board.setSector(0, tavern);
  state.nightStart = 4;
  state.nightLength = 4;
  expect(calculateVillageIncome(createEffectContext(state))).toBe(11);

  state.nightStart = 0;
  state.nightLength = 1;
  expect(calculateVillageIncome(createEffectContext(state))).toBe(25);

  tavern.level = 2;
  expect(calculateVillageIncome(createEffectContext(state))).toBe(30);

  tavern.level = 3;
  expect(calculateVillageIncome(createEffectContext(state))).toBe(40);
});

test('smithy bonus carries over battle decrease events and counts the current purchase itself', () => {
  const state = new GameState();
  state.board.villagePower = 200;
  state.beginBattleVillagePowerTracking();
  state.applyVillagePowerDelta(-3, 'battle');
  state.applyVillagePowerDelta(-7, 'battle');
  state.finalizeBattleVillagePowerTracking();
  state.board.setSector(7, createBlock(BlockType.SMITHY, 15, 2));
  const shop = new ShopSystem();

  shop.state.lockedSlots[0] = { id: 'block:wood_wall', kind: 'block', label: '木墙', cost: 5, tags: ['无法攻击'], blockType: BlockType.WOOD_WALL, combatPower: 10 };
  shop.beginPlacementFromLockedWithPower(0, state.board.villagePower);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.WOOD_WALL, combatPower: 16, level: 1 });
  expect(state.villagePowerDecreaseEventsForPlacement).toBe(3);
});

test('smithy bonus applies to same-type upgrades and multiple adjacent smithies stack', () => {
  const state = new GameState();
  state.board.villagePower = 200;
  state.villagePowerDecreaseEventsForPlacement = 1;
  state.board.setSector(7, createBlock(BlockType.SMITHY, 10, 1));
  state.board.setSector(1, createBlock(BlockType.SMITHY, 20, 3));
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 10, 1));
  const shop = new ShopSystem();

  shop.state.lockedSlots[0] = { id: 'block:wood_wall', kind: 'block', label: '木墙', cost: 5, tags: ['无法攻击'], blockType: BlockType.WOOD_WALL, combatPower: 10 };
  shop.beginPlacementFromLockedWithPower(0, state.board.villagePower);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);

  expect(state.board.getSector(0)).toMatchObject({ type: BlockType.WOOD_WALL, level: 2, combatPower: 33 });
  expect(state.villagePowerDecreaseEventsForPlacement).toBe(2);
});

test('shop spells use friendly targets and dragon fire consumes block combat power', () => {
  const state = new GameState();
  state.board.villagePower = 200;
  state.board.setSector(0, createBlock(BlockType.WOOD_WALL, 10));
  state.board.setSector(1, createBlock(BlockType.KNIGHT, 9));
  state.board.setSector(7, createBlock(BlockType.MAGE, 8));
  const shop = new ShopSystem();

  shop.state.lockedSlots[0] = { id: 'spell:focus_field', kind: 'spell', label: '集中力场', cost: 40, tags: ['法术'], spellType: SpellType.FOCUS_FIELD };
  shop.beginPlacementFromLockedWithPower(0, state.board.villagePower);
  expect(shop.tryPlaceSelectedItem(state, 0).ok).toBe(true);
  expect(state.board.getSector(0)?.combatPower).toBe(18);
  expect(state.board.getSector(1)?.combatPower).toBe(5);
  expect(state.board.getSector(7)?.combatPower).toBe(4);

  shop.state.lockedSlots[0] = { id: 'spell:bulwark', kind: 'spell', label: '壁垒', cost: 30, tags: ['法术'], spellType: SpellType.BULWARK };
  shop.beginPlacementFromLockedWithPower(0, state.board.villagePower);
  expect(shop.tryPlaceSelectedItem(state, null).ok).toBe(true);
  expect(state.board.getSector(0)?.combatPower).toBe(23);
  expect(state.board.getSector(1)?.combatPower).toBe(5);

  state.board.setSector(2, createBlock(BlockType.DRAGON_FIRE, 12));
  shop.state.lockedSlots[0] = { id: 'block:wood_wall', kind: 'block', label: '木墙', cost: 5, tags: ['无法攻击'], blockType: BlockType.WOOD_WALL, combatPower: 10 };
  shop.beginPlacementFromLockedWithPower(0, state.board.villagePower);
  expect(shop.tryPlaceSelectedItem(state, 2).ok).toBe(true);
  expect(state.board.getSector(2)).toMatchObject({ type: BlockType.DRAGON_FIRE, combatPower: 2 });
});
