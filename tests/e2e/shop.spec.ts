import { expect, test } from '@playwright/test';

type SectionKey = 'base' | 'random';

type SlotLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type RandomSlotLayout = SlotLayout & { lockButton: SlotLayout };

type Snapshot = {
  turnNumber: number;
  villageHp: number;
  villageGold: number;
  board: ({ type: string; hp: number; attack: number; tags: string[] } | null)[];
  dragons: {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    attack: number;
    screen: { x: number; y: number } | null;
  }[];
  shop: {
    base: ShopSnapshotItem[];
    random: { item: ShopSnapshotItem | null; locked: boolean }[];
    refreshCost: number;
    selectedItem: { area: SectionKey; index: number; item: ShopSnapshotItem } | null;
    layout: {
      sections: {
        base: { slots: SlotLayout[] };
        random: { slots: RandomSlotLayout[] };
      };
      refreshButton: SlotLayout;
    };
  };
  screen: {
    w: number;
    h: number;
    octagonCenterX: number;
    octagonCenterY: number;
    octagonRadius: number;
  };
  rotationAngle: number;
  turnRotationSteps: number;
  dragonTooltipVisible: boolean;
  shopTooltipVisible: boolean;
  shopTooltipLines: string[];
};

type ShopBlockSnapshotItem = {
  id: string;
  kind: 'block';
  type: string;
  label: string;
  cost: number;
  hp: number;
  attack: number;
  tags: string[];
};

type ShopSpellSnapshotItem = {
  id: string;
  kind: 'spell';
  spellType: string;
  label: string;
  cost: number;
  tags: string[];
};

type ShopSnapshotItem = ShopBlockSnapshotItem | ShopSpellSnapshotItem;

async function snapshot(page: import('@playwright/test').Page): Promise<Snapshot> {
  await page.waitForFunction(() => Boolean((window as any).__dragonSlayerGame));
  return page.evaluate(() => (window as any).__dragonSlayerGame.getSnapshot());
}

function slotCenter(state: Snapshot, section: SectionKey, index: number): { x: number; y: number } {
  const slot = state.shop.layout.sections[section].slots[index];
  return { x: slot.centerX, y: slot.centerY };
}

function randomLockCenter(state: Snapshot, index: number): { x: number; y: number } {
  const slot = state.shop.layout.sections.random.slots[index].lockButton;
  return { x: slot.centerX, y: slot.centerY };
}

function refreshCenter(state: Snapshot): { x: number; y: number } {
  const button = state.shop.layout.refreshButton;
  return { x: button.centerX, y: button.centerY };
}

function randomItems(state: Snapshot): (ShopSnapshotItem | null)[] {
  return state.shop.random.map(slot => slot.item);
}

async function findAffordableRandomBlock(page: import('@playwright/test').Page): Promise<{ state: Snapshot; index: number; item: ShopBlockSnapshotItem }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    const index = state.shop.random.findIndex(slot => slot.item?.kind === 'block' && slot.item.cost <= state.villageGold);
    if (index >= 0) return { state, index, item: state.shop.random[index].item as ShopBlockSnapshotItem };
    await page.reload();
    await expect.poll(async () => randomItems(await snapshot(page)).filter(Boolean).length).toBeGreaterThan(0);
  }
  throw new Error('Could not find an affordable random block');
}

function emptySectorPoint(state: Snapshot): { x: number; y: number; sector: number } {
  const sector = state.board.findIndex(block => block === null);
  if (sector < 0) throw new Error('No empty sector available');
  const angle = state.rotationAngle * Math.PI / 180 + (sector + 0.5) * Math.PI / 4;
  const radius = state.screen.octagonRadius * 0.55;
  return {
    sector,
    x: state.screen.octagonCenterX + Math.cos(angle) * radius,
    y: state.screen.octagonCenterY + Math.sin(angle) * radius,
  };
}

async function rotateBoardOneStep(page: import('@playwright/test').Page): Promise<Snapshot> {
  const before = await snapshot(page);
  const cx = before.screen.octagonCenterX;
  const cy = before.screen.octagonCenterY;
  const radius = before.screen.octagonRadius * 0.85;
  const expectedRotation = (before.rotationAngle + 45) % 360;
  let rotated = false;

  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  for (let deg = 15; deg <= 360; deg += 15) {
    const angle = deg * Math.PI / 180;
    await page.mouse.move(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    const current = await snapshot(page);
    if (current.rotationAngle !== before.rotationAngle) {
      expect(current.rotationAngle).toBe(expectedRotation);
      rotated = true;
      break;
    }
  }
  await page.mouse.up();
  expect(rotated).toBe(true);
  await page.waitForTimeout(750);
  return snapshot(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => randomItems(await snapshot(page)).filter(Boolean).length).toBeGreaterThan(0);
});

test('shop starts with base slots, random slots, unique random items, and refresh cost', async ({ page }) => {
  const state = await snapshot(page);
  expect(state.villageHp).toBe(50);
  expect(state.villageGold).toBe(10);
  expect(state.shop.base.map(item => item.id)).toEqual(['block:wood_wall', 'block:mine', 'spell:missile']);
  expect(state.shop.random).toHaveLength(4);
  expect(state.shop.refreshCost).toBe(1);

  const visible = randomItems(state).filter((item): item is ShopSnapshotItem => item !== null);
  expect(new Set(visible.map(item => item.id)).size).toBe(visible.length);
  expect(visible.map(item => item.id)).not.toContain('block:wood_wall');
  expect(visible.map(item => item.id)).not.toContain('block:mine');
  expect(visible.map(item => item.id)).not.toContain('spell:missile');
});

test('a long drag still rotates the board by one step', async ({ page }) => {
  const rotated = await rotateBoardOneStep(page);
  expect(rotated.turnRotationSteps).toBe(1);
});

test('placing a base item spends gold and does not end the turn', async ({ page }) => {
  const before = await snapshot(page);
  const item = before.shop.base[0] as ShopBlockSnapshotItem;
  const offerPos = slotCenter(before, 'base', 0);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'base', index: 0, item: { id: item.id, cost: item.cost } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(item.type);
  expect(after.villageGold).toBe(before.villageGold - item.cost);
  expect(after.villageHp).toBe(before.villageHp);
  expect(after.turnNumber).toBe(before.turnNumber);
  expect(after.shop.base[0]).toEqual(item);
});

test('clicking a random item selects it and refills that slot after successful placement', async ({ page }) => {
  const found = await findAffordableRandomBlock(page);
  const offerPos = slotCenter(found.state, 'random', found.index);
  await page.mouse.click(offerPos.x, offerPos.y);

  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'random', index: found.index, item: { id: found.item.id, cost: found.item.cost } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(found.item.type);
  expect(after.shop.random[found.index].item).toBeTruthy();
  expect(after.shop.random[found.index].item?.id).not.toBe(found.item.id);
  expect(after.villageGold).toBe(selected.villageGold - found.item.cost);
  expect(after.turnNumber).toBe(selected.turnNumber);
});

test('locking a random item preserves it across refresh and increases same-turn refresh cost', async ({ page }) => {
  const before = await snapshot(page);
  const first = before.shop.random[0].item;
  expect(first).toBeTruthy();
  const lockPos = randomLockCenter(before, 0);
  await page.mouse.click(lockPos.x, lockPos.y);

  const locked = await snapshot(page);
  expect(locked.shop.random[0].locked).toBe(true);
  const refreshPos = refreshCenter(locked);
  await page.mouse.click(refreshPos.x, refreshPos.y);

  const after = await snapshot(page);
  expect(after.shop.random[0].item).toEqual(first);
  expect(after.shop.random[0].locked).toBe(true);
  expect(after.shop.refreshCost).toBe(3);
  expect(after.villageGold).toBe(locked.villageGold - 1);
});

test('refresh cost resets at the next player turn', async ({ page }) => {
  let state = await snapshot(page);
  const refreshPos = refreshCenter(state);
  await page.mouse.click(refreshPos.x, refreshPos.y);
  state = await snapshot(page);
  expect(state.shop.refreshCost).toBe(3);

  await page.mouse.click(state.screen.octagonCenterX, state.screen.octagonCenterY);
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(state.turnNumber);

  const afterTurn = await snapshot(page);
  expect(afterTurn.shop.refreshCost).toBe(1);
});

test('clicking outside the octagon cancels placement without spending gold', async ({ page }) => {
  const before = await snapshot(page);
  const item = before.shop.base[0];
  const offerPos = slotCenter(before, 'base', 0);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'base', index: 0, item: { id: item.id, cost: item.cost } });

  await page.mouse.click(selected.screen.octagonCenterX + selected.screen.octagonRadius + 40, selected.screen.octagonCenterY);

  const after = await snapshot(page);
  expect(after.shop.selectedItem).toBeNull();
  expect(after.board).toEqual(selected.board);
  expect(after.villageGold).toBe(selected.villageGold);
});

test('hovering a refresh button shows the current refresh cost', async ({ page }) => {
  const state = await snapshot(page);
  const button = refreshCenter(state);

  await page.mouse.move(button.x, button.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  const after = await snapshot(page);
  expect(after.shopTooltipLines.join('\n')).toContain(`消耗: ${state.shop.refreshCost} 金币`);
});

test('hovering a shop item still shows and hides the tooltip', async ({ page }) => {
  const state = await snapshot(page);
  const offerPos = slotCenter(state, 'base', 0);

  await page.mouse.move(offerPos.x, offerPos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  await page.mouse.move(20, state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(false);
});

test('hovering a visible dragon still shows and hides its tooltip', async ({ page }) => {
  let state = await snapshot(page);
  for (let i = 0; i < 8 && !state.dragons.find(dragon => dragon.screen); i++) {
    await page.mouse.click(state.screen.octagonCenterX, state.screen.octagonCenterY);
    await page.waitForTimeout(750);
    state = await snapshot(page);
  }
  const dragon = state.dragons.find(candidate => candidate.screen && candidate.screen.y > 170);
  expect(dragon).toBeTruthy();
  await page.mouse.move(dragon!.screen!.x, dragon!.screen!.y);
  await expect.poll(async () => (await snapshot(page)).dragonTooltipVisible).toBe(true);
  await page.mouse.move(20, state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).dragonTooltipVisible).toBe(false);
});
