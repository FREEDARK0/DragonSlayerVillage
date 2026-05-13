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

test('block data uses a single combatPower field', () => {
  const files = [
    'src/models/Block.ts',
    'src/effects/BlockEffectRegistry.ts',
    'src/ai/DragonAI.ts',
    'src/rendering/BlockRenderer.ts',
    'src/Game.ts',
  ];
  const source = files.map(file => readFileSync(join(root, file), 'utf8')).join('\n');
  expect(source).not.toMatch(/\b(power|value)\s*:/);
  expect(source).not.toMatch(/block\.(power|value)\b/);
  expect(source).toContain('combatPower');
});
