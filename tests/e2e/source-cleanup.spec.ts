import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('removed dragon attribute system has no source references', () => {
  const files = [
    'src/config/dragonTypes.ts',
    'src/models/Dragon.ts',
    'src/models/Block.ts',
    'src/core/OctagonBoard.ts',
    'src/ai/DragonAI.ts',
    'src/rendering/OctagonRenderer.ts',
  ];
  const source = files.map(file => readFileSync(join(root, file), 'utf8')).join('\n');
  expect(source).not.toContain('ELEMENT_COLORS');
  expect(source).not.toMatch(/\belement\b/);
  expect(source).not.toMatch(/\battribute\b/);
  expect(source).not.toContain('cannotAttack');
});

test('core gameplay source uses hp attack and gold instead of old power fields', () => {
  const files = [
    'src/models/Block.ts',
    'src/models/Dragon.ts',
    'src/core/OctagonBoard.ts',
    'src/effects/BlockEffectRegistry.ts',
    'src/ai/DragonAI.ts',
    'src/systems/ShopSystem.ts',
    'src/rendering/BlockRenderer.ts',
    'src/Game.ts',
  ];
  const source = files.map(file => readFileSync(join(root, file), 'utf8')).join('\n');
  expect(source).not.toMatch(/\bcombatPower\b/);
  expect(source).not.toMatch(/\bvillagePower\b/);
  expect(source).not.toMatch(/\battackMultiplier\b/);
  expect(source).not.toMatch(/\bmaxCombatPower\b/);
  expect(source).not.toMatch(/\bMAX_BLOCK_LEVEL\b/);
  expect(source).not.toMatch(/\brefreshBlockForLevel\b/);
  expect(source).toContain('hp');
  expect(source).toContain('attack');
  expect(source).toContain('villageGold');
});
