import { expect, test } from '@playwright/test';
import { BLOCK_TYPE_TABLE, BlockType, SpellType } from '../../src/config/blockTypes';
import { DRAGON_TEMPLATES, DragonPersonalityType, DragonTemplate } from '../../src/config/dragonTypes';
import { DragonAI } from '../../src/ai/DragonAI';
import { GameState } from '../../src/core/GameState';
import { createBlock } from '../../src/models/Block';
import { createDragon, dragonTakeDamage } from '../../src/models/Dragon';
import { ShopSystem } from '../../src/systems/ShopSystem';

function template(id: string): DragonTemplate {
  const found = DRAGON_TEMPLATES.find(dragon => dragon.id === id);
  if (!found) throw new Error(`Missing dragon template: ${id}`);
  return found;
}

test('dragon templates expose copy limits and gold mine naming', () => {
  expect(template('aurus')).toMatchObject({ name: '奥鲁斯', quantity: 2 });
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
  expect(goldMine?.combatPower).toBeLessThanOrEqual(5);
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
