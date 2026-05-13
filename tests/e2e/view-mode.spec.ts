import { expect, test } from '@playwright/test';

type Snapshot = {
  turnNumber: number;
  villagePower: number;
  board: ({ type: string; combatPower: number; level: number; tags: string[] } | null)[];
  shop: {
    lockedSlots: (ShopSnapshotItem | null)[];
    offerSlots: (ShopSnapshotItem | null)[];
    selectedItem: { area: 'locked' | 'offer'; index: number; item: ShopSnapshotItem } | null;
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
  combatPower: number;
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

const slotW = 80;
const gap = 10;
const shopY = 60;
const lockedSlotCount = 2;
const offerSlotCount = 5;

async function snapshot(page: import('@playwright/test').Page): Promise<Snapshot> {
  await page.waitForFunction(() => Boolean((window as any).__dragonSlayerGame));
  return page.evaluate(() => (window as any).__dragonSlayerGame.getSnapshot());
}

function slotCenter(screenW: number, area: 'locked' | 'offer', index: number): { x: number; y: number } {
  const totalSlots = lockedSlotCount + offerSlotCount;
  const totalW = totalSlots * slotW + (totalSlots - 1) * gap;
  const startX = (screenW - totalW) / 2;
  const baseX = area === 'locked'
    ? startX + index * (slotW + gap)
    : startX + (lockedSlotCount + index) * (slotW + gap);
  return { x: baseX + slotW / 2, y: shopY + 45 };
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

async function findAffordableBlockOffer(page: import('@playwright/test').Page): Promise<{ state: Snapshot; offerIndex: number; item: ShopBlockSnapshotItem }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    const offerIndex = state.shop.offerSlots.findIndex(item => item?.kind === 'block' && item.cost <= state.villagePower);
    if (offerIndex >= 0) return { state, offerIndex, item: state.shop.offerSlots[offerIndex] as ShopBlockSnapshotItem };
    await page.reload();
    await expect.poll(async () => (await snapshot(page)).shop.offerSlots.filter(Boolean).length).toBeGreaterThan(0);
  }
  throw new Error('Could not find an affordable block offer after reloading');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await snapshot(page)).shop.offerSlots.filter(Boolean).length).toBeGreaterThan(0);
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

test('view mode prevents shop selection, dragging, and spending', async ({ page }) => {
  const before = await toggleViewMode(page);
  const offerIndex = before.shop.offerSlots.findIndex(Boolean);
  expect(offerIndex).toBeGreaterThanOrEqual(0);
  const offer = before.shop.offerSlots[offerIndex];
  const offerPos = slotCenter(before.screen.w, 'offer', offerIndex);
  const lockedPos = slotCenter(before.screen.w, 'locked', 0);

  await page.mouse.click(offerPos.x, offerPos.y);
  await page.mouse.move(offerPos.x, offerPos.y);
  await page.mouse.down();
  await page.mouse.move(lockedPos.x, lockedPos.y, { steps: 8 });
  await page.mouse.up();

  const after = await snapshot(page);
  expect(after.viewMode).toBe(true);
  expect(after.shop.selectedItem).toBeNull();
  expect(after.shop.offerSlots[offerIndex]).toEqual(offer);
  expect(after.shop.lockedSlots[0]).toEqual(before.shop.lockedSlots[0]);
  expect(after.villagePower).toBe(before.villagePower);
  expect(after.turnNumber).toBe(before.turnNumber);
});

test('right click is ignored while a shop item is selected', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  const offerPos = slotCenter(affordable.state.screen.w, 'offer', affordable.offerIndex);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'offer', index: affordable.offerIndex, item: { id: affordable.item.id } });

  await page.mouse.click(selected.screen.octagonCenterX, selected.screen.octagonCenterY, { button: 'right' });
  const after = await snapshot(page);
  expect(after.viewMode).toBe(false);
  expect(after.shop.selectedItem).toMatchObject({ area: 'offer', index: affordable.offerIndex, item: { id: affordable.item.id } });
});

test('action mode resumes normal confirmation after leaving view mode', async ({ page }) => {
  const inView = await toggleViewMode(page);
  const action = await toggleViewMode(page, inView);
  expect(action.viewMode).toBe(false);

  await page.mouse.click(action.screen.octagonCenterX, action.screen.octagonCenterY);
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(action.turnNumber);
});
