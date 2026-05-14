import { expect, test } from '@playwright/test';

type SectionKey = 'base' | 'random';

type SlotLayout = {
  centerX: number;
  centerY: number;
};

type RandomSlotLayout = SlotLayout & { lockButton: SlotLayout };

type Snapshot = {
  turnNumber: number;
  villageHp: number;
  villageGold: number;
  board: ({ type: string; hp: number; attack: number; tags: string[] } | null)[];
  shop: {
    base: ShopSnapshotItem[];
    random: { item: ShopSnapshotItem | null; locked: boolean }[];
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
  viewMode: boolean;
  rotationAngle: number;
  turnRotationSteps: number;
  boardTooltipVisible: boolean;
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

function sectorPoint(state: Snapshot, sector: number): { x: number; y: number; sector: number } {
  const angle = state.rotationAngle * Math.PI / 180 + (sector + 0.5) * Math.PI / 4;
  const radius = state.screen.octagonRadius * 0.55;
  return {
    sector,
    x: state.screen.octagonCenterX + Math.cos(angle) * radius,
    y: state.screen.octagonCenterY + Math.sin(angle) * radius,
  };
}

function emptySectorPoint(state: Snapshot): { x: number; y: number; sector: number } {
  const sector = state.board.findIndex(block => block === null);
  if (sector < 0) throw new Error('No empty sector available');
  return sectorPoint(state, sector);
}

function occupiedSectorPoint(state: Snapshot): { x: number; y: number; sector: number } {
  const sector = state.board.findIndex(block => block !== null);
  if (sector < 0) throw new Error('No occupied sector available');
  return sectorPoint(state, sector);
}

async function toggleViewMode(page: import('@playwright/test').Page, state?: Snapshot): Promise<Snapshot> {
  const current = state ?? await snapshot(page);
  await page.mouse.click(current.screen.octagonCenterX, current.screen.octagonCenterY, { button: 'right' });
  return snapshot(page);
}

async function findRandomBlock(page: import('@playwright/test').Page): Promise<{ state: Snapshot; index: number; item: ShopBlockSnapshotItem }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    const index = state.shop.random.findIndex(slot => slot.item?.kind === 'block');
    if (index >= 0) return { state, index, item: state.shop.random[index].item as ShopBlockSnapshotItem };
    await page.reload();
    await expect.poll(async () => (await snapshot(page)).shop.random.filter(slot => slot.item).length).toBeGreaterThan(0);
  }
  throw new Error('Could not find an affordable block offer after reloading');
}

async function findAffordableRandomBlock(page: import('@playwright/test').Page): Promise<{ state: Snapshot; index: number; item: ShopBlockSnapshotItem }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    const index = state.shop.random.findIndex(slot => slot.item?.kind === 'block' && slot.item.cost <= state.villageGold);
    if (index >= 0) return { state, index, item: state.shop.random[index].item as ShopBlockSnapshotItem };
    await page.reload();
    await expect.poll(async () => (await snapshot(page)).shop.random.filter(slot => slot.item).length).toBeGreaterThan(0);
  }
  throw new Error('Could not find an affordable block offer after reloading');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await snapshot(page)).shop.random.filter(slot => slot.item).length).toBeGreaterThan(0);
});

test('right click toggles view mode and updates cursor', async ({ page }) => {
  const inView = await toggleViewMode(page);
  expect(inView.viewMode).toBe(true);
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => getComputedStyle(canvas).cursor)).toBe('zoom-in');

  const backToAction = await toggleViewMode(page, inView);
  expect(backToAction.viewMode).toBe(false);
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => getComputedStyle(canvas).cursor)).not.toBe('zoom-in');
});

test('view mode blocks rotation and turn confirmation', async ({ page }) => {
  const inView = await toggleViewMode(page);
  const cx = inView.screen.octagonCenterX;
  const cy = inView.screen.octagonCenterY;
  const radius = inView.screen.octagonRadius * 0.85;

  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  for (let deg = 15; deg <= 360; deg += 15) {
    const angle = deg * Math.PI / 180;
    await page.mouse.move(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  await page.mouse.up();
  await page.mouse.click(cx, cy);

  const after = await snapshot(page);
  expect(after.viewMode).toBe(true);
  expect(after.rotationAngle).toBe(inView.rotationAngle);
  expect(after.turnRotationSteps).toBe(inView.turnRotationSteps);
  expect(after.turnNumber).toBe(inView.turnNumber);
});

test('view mode shows board tooltips for occupied and empty sectors', async ({ page }) => {
  let state = await toggleViewMode(page);

  const occupied = occupiedSectorPoint(state);
  await page.mouse.move(occupied.x, occupied.y);
  await expect.poll(async () => (await snapshot(page)).boardTooltipVisible).toBe(true);

  state = await snapshot(page);
  const empty = emptySectorPoint(state);
  await page.mouse.move(empty.x, empty.y);
  await expect.poll(async () => (await snapshot(page)).boardTooltipVisible).toBe(true);

  await page.mouse.move(20, state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).boardTooltipVisible).toBe(false);
});

test('view mode prevents shop selection, lock toggling, and refresh', async ({ page }) => {
  const before = await toggleViewMode(page);
  const found = await findRandomBlock(page);
  const offer = found.item;
  const offerPos = slotCenter(found.state, 'random', found.index);
  const lockPos = found.state.shop.layout.sections.random.slots[found.index].lockButton;
  const refresh = found.state.shop.layout.refreshButton;

  await page.mouse.click(offerPos.x, offerPos.y);
  await page.mouse.click(lockPos.centerX, lockPos.centerY);
  await page.mouse.click(refresh.centerX, refresh.centerY);

  const after = await snapshot(page);
  expect(after.viewMode).toBe(true);
  expect(after.shop.selectedItem).toBeNull();
  expect(after.shop.random[found.index].item).toEqual(offer);
  expect(after.shop.random[found.index].locked).toBe(false);
  expect(after.villageGold).toBe(before.villageGold);
  expect(after.turnNumber).toBe(before.turnNumber);
});

test('right click is ignored while a shop item is selected', async ({ page }) => {
  const affordable = await findAffordableRandomBlock(page);
  const offerPos = slotCenter(affordable.state, 'random', affordable.index);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index, item: { id: affordable.item.id } });

  await page.mouse.click(selected.screen.octagonCenterX, selected.screen.octagonCenterY, { button: 'right' });
  const after = await snapshot(page);
  expect(after.viewMode).toBe(false);
  expect(after.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index, item: { id: affordable.item.id } });
});

test('action mode resumes normal confirmation after leaving view mode', async ({ page }) => {
  const inView = await toggleViewMode(page);
  const action = await toggleViewMode(page, inView);
  expect(action.viewMode).toBe(false);

  await page.mouse.click(action.screen.octagonCenterX, action.screen.octagonCenterY);
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(action.turnNumber);
});
