import { expect, test } from '@playwright/test';

type Snapshot = {
  turnNumber: number;
  villagePower: number;
  board: ({ type: string; combatPower: number; level: number; tags: string[] } | null)[];
  dragons: {
    id: string;
    name: string;
    combatPower: number;
    maxCombatPower: number;
    attackMultiplier: number;
    screen: { x: number; y: number } | null;
  }[];
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
  rotationAngle: number;
  turnRotationSteps: number;
  dragonTooltipVisible: boolean;
  shopTooltipVisible: boolean;
  shopTooltipLines: string[];
  shopTooltipLayout: { text: string; y: number; height: number; width: number }[];
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

async function dragOfferToLocked(page: import('@playwright/test').Page, offerIndex: number, lockedIndex: number): Promise<void> {
  const state = await snapshot(page);
  const from = slotCenter(state.screen.w, 'offer', offerIndex);
  const to = slotCenter(state.screen.w, 'locked', lockedIndex);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function findAffordableOffer(page: import('@playwright/test').Page): Promise<{ state: Snapshot; offerIndex: number }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    const offerIndex = state.shop.offerSlots.findIndex(item => item !== null && item.cost <= state.villagePower);
    if (offerIndex >= 0) return { state, offerIndex };
    await page.reload();
    await expect.poll(async () => (await snapshot(page)).shop.offerSlots.filter(Boolean).length).toBeGreaterThan(0);
  }
  throw new Error('Could not find an affordable offer after reloading');
}

async function findOfferByPredicate(
  page: import('@playwright/test').Page,
  predicate: (item: ShopSnapshotItem) => boolean,
): Promise<{ state: Snapshot; offerIndex: number; item: ShopSnapshotItem }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await snapshot(page);
    const offerIndex = state.shop.offerSlots.findIndex(item => item !== null && predicate(item));
    if (offerIndex >= 0) return { state, offerIndex, item: state.shop.offerSlots[offerIndex] as ShopSnapshotItem };
    await page.reload();
    await expect.poll(async () => (await snapshot(page)).shop.offerSlots.filter(Boolean).length).toBeGreaterThan(0);
  }
  throw new Error('Could not find matching offer after reloading');
}

async function findAffordableBlockOffer(page: import('@playwright/test').Page, maxCost = Number.POSITIVE_INFINITY): Promise<{ state: Snapshot; offerIndex: number; item: ShopBlockSnapshotItem }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    const offerIndex = state.shop.offerSlots.findIndex(item => item?.kind === 'block' && item.cost <= maxCost && item.cost <= state.villagePower);
    if (offerIndex >= 0) return { state, offerIndex, item: state.shop.offerSlots[offerIndex] as ShopBlockSnapshotItem };
    await page.reload();
    await expect.poll(async () => (await snapshot(page)).shop.offerSlots.filter(Boolean).length).toBeGreaterThan(0);
  }
  throw new Error(`Could not find an affordable block offer at or below ${maxCost} after reloading`);
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
  const after = await snapshot(page);
  expect(after.rotationAngle).toBe(expectedRotation);
  return after;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await snapshot(page)).shop.offerSlots.filter(Boolean).length).toBeGreaterThan(0);
});

test('shop has two locked slots and five offer slots', async ({ page }) => {
  const state = await snapshot(page);
  expect(state.shop.lockedSlots).toHaveLength(2);
  expect(state.shop.offerSlots).toHaveLength(5);
});

test('dragging an offer locks it without spending power or ending the turn', async ({ page }) => {
  const before = await snapshot(page);
  const offer = before.shop.offerSlots[0];
  expect(offer).toBeTruthy();

  await dragOfferToLocked(page, 0, 0);

  const after = await snapshot(page);
  expect(after.shop.lockedSlots[0]).toEqual(offer);
  expect(after.shop.offerSlots[0]).toBeNull();
  expect(after.turnNumber).toBe(before.turnNumber);
  expect(after.villagePower).toBe(before.villagePower);
});

test('dragging an offer onto an occupied locked slot swaps with the original offer slot', async ({ page }) => {
  await dragOfferToLocked(page, 0, 0);
  const mid = await snapshot(page);
  const locked = mid.shop.lockedSlots[0];
  const nextOfferIndex = mid.shop.offerSlots.findIndex(Boolean);
  expect(locked).toBeTruthy();
  expect(nextOfferIndex).toBeGreaterThanOrEqual(0);
  const offer = mid.shop.offerSlots[nextOfferIndex];

  await dragOfferToLocked(page, nextOfferIndex, 0);

  const after = await snapshot(page);
  expect(after.shop.lockedSlots[0]).toEqual(offer);
  expect(after.shop.offerSlots[nextOfferIndex]).toEqual(locked);
  expect(after.turnNumber).toBe(mid.turnNumber);
  expect(after.villagePower).toBe(mid.villagePower);
});

test('placing a locked item spends power and does not end the turn', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  await dragOfferToLocked(page, affordable.offerIndex, 0);
  const beforeSelect = await snapshot(page);
  const item = beforeSelect.shop.lockedSlots[0] as ShopBlockSnapshotItem;
  const lockedPos = slotCenter(beforeSelect.screen.w, 'locked', 0);

  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'locked', index: 0, item: { id: item.id, cost: item.cost } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(item.type);
  expect(after.board[target.sector]?.level).toBe(1);
  expect(after.villagePower).toBe(beforeSelect.villagePower - item.cost);
  expect(after.turnNumber).toBe(beforeSelect.turnNumber);
});

test('placing a locked item after rotating uses the visible rotated sector', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  await dragOfferToLocked(page, affordable.offerIndex, 0);
  const beforeRotate = await snapshot(page);
  const item = beforeRotate.shop.lockedSlots[0] as ShopBlockSnapshotItem;

  const rotated = await rotateBoardOneStep(page);
  const lockedPos = slotCenter(rotated.screen.w, 'locked', 0);
  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'locked', index: 0, item: { id: item.id, cost: item.cost } });
  expect(selected.rotationAngle).toBe(rotated.rotationAngle);

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(item.type);
  expect(after.board[target.sector]?.level).toBe(1);
  expect(after.villagePower).toBe(selected.villagePower - item.cost);
  expect(after.turnNumber).toBe(selected.turnNumber);
});

test('clicking an affordable offer selects it, disables rotation, then clears that offer after placement', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  const item = affordable.item;
  const offerPos = slotCenter(affordable.state.screen.w, 'offer', affordable.offerIndex);
  await page.mouse.click(offerPos.x, offerPos.y);

  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'offer', index: affordable.offerIndex, item: { id: item.id, cost: item.cost } });
  await expect(page.locator('canvas')).toBeVisible();
  await page.mouse.move(selected.screen.octagonCenterX + selected.screen.octagonRadius * 0.6, selected.screen.octagonCenterY);
  await page.mouse.down();
  await page.mouse.move(selected.screen.octagonCenterX, selected.screen.octagonCenterY + selected.screen.octagonRadius * 0.6, { steps: 10 });
  await page.mouse.up();
  const afterDrag = await snapshot(page);
  expect(afterDrag.rotationAngle).toBe(selected.rotationAngle);
  expect(afterDrag.turnRotationSteps).toBe(selected.turnRotationSteps);

  const target = emptySectorPoint(afterDrag);
  await page.mouse.click(target.x, target.y);
  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(item.type);
  expect(after.board[target.sector]?.level).toBe(1);
  expect(after.shop.offerSlots[affordable.offerIndex]).toBeTruthy();
  expect(after.villagePower).toBe(selected.villagePower - item.cost);
  expect(after.turnNumber).toBe(selected.turnNumber);
});

test('hovering a shop item shows and hides its description panel', async ({ page }) => {
  const affordable = await findAffordableOffer(page);
  const offerPos = slotCenter(affordable.state.screen.w, 'offer', affordable.offerIndex);

  await page.mouse.move(offerPos.x, offerPos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  await page.mouse.move(20, affordable.state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(false);
});

test('mine shop tooltip lists clean per-level income without repeated level summary', async ({ page }) => {
  const mine = await findOfferByPredicate(page, item => item.kind === 'block' && item.type === 'mine');
  const offerPos = slotCenter(mine.state.screen.w, 'offer', mine.offerIndex);

  await page.mouse.move(offerPos.x, offerPos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);

  const state = await snapshot(page);
  const tooltipText = state.shopTooltipLines.join('\n');
  expect(tooltipText).toContain('Lv1: 收入 +2/回合');
  expect(tooltipText).toContain('Lv2: 收入 +4/回合');
  expect(tooltipText).toContain('Lv3: 收入 +6/回合');
  expect(tooltipText).not.toContain('Lv1/Lv2/Lv3');
  expect(tooltipText).not.toContain('Lv1 Lv1');
  expect(tooltipText).not.toContain('Lv2 Lv1');
  expect(tooltipText).not.toContain('Lv3 Lv1');
});

test('shop tooltip wrapped lines use non-overlapping dynamic layout', async ({ page }) => {
  const longOffer = await findOfferByPredicate(page, item => item.kind === 'spell' && item.spellType === 'shield_crush');
  const offerPos = slotCenter(longOffer.state.screen.w, 'offer', longOffer.offerIndex);

  await page.mouse.move(offerPos.x, offerPos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);

  const state = await snapshot(page);
  expect(state.shopTooltipLayout.length).toBeGreaterThan(2);
  expect(state.shopTooltipLayout.some(line => line.height > 20)).toBe(true);
  expect(state.shopTooltipLayout.every(line => line.width <= 210)).toBe(true);
  for (let i = 1; i < state.shopTooltipLayout.length; i++) {
    const previous = state.shopTooltipLayout[i - 1];
    const current = state.shopTooltipLayout[i];
    expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height + 3);
  }
});

test('clicking an affordable offer places with one board click', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  const item = affordable.item;
  const offerPos = slotCenter(affordable.state.screen.w, 'offer', affordable.offerIndex);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'offer', index: affordable.offerIndex, item: { id: item.id, cost: item.cost } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(item.type);
  expect(after.board[target.sector]?.level).toBe(1);
  expect(after.shop.selectedItem).toBeNull();
  expect(after.shop.offerSlots[affordable.offerIndex]).toBeTruthy();
  expect(after.villagePower).toBe(selected.villagePower - item.cost);
});

test('placing the same locked item on the same sector upgrades it and restores full value', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page, 10);
  await dragOfferToLocked(page, affordable.offerIndex, 0);
  const beforeFirst = await snapshot(page);
  const item = beforeFirst.shop.lockedSlots[0] as ShopBlockSnapshotItem;
  const lockedPos = slotCenter(beforeFirst.screen.w, 'locked', 0);

  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selectedFirst = await snapshot(page);
  const target = emptySectorPoint(selectedFirst);
  await page.mouse.click(target.x, target.y);
  const placed = await snapshot(page);
  expect(placed.board[target.sector]).toMatchObject({ type: item.type, level: 1 });

  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selectedSecond = await snapshot(page);
  await page.mouse.click(target.x, target.y);
  const upgraded = await snapshot(page);
  expect(upgraded.board[target.sector]).toMatchObject({ type: item.type, level: 2 });
  expect(upgraded.board[target.sector]?.combatPower).toBeGreaterThan(0);
  expect(upgraded.villagePower).toBe(placed.villagePower - item.cost);
  expect(upgraded.turnNumber).toBe(placed.turnNumber);
  expect(selectedSecond.shop.selectedItem).toMatchObject({ area: 'locked', index: 0, item: { id: item.id, cost: item.cost } });
});

test('different-type placement cannot overwrite an occupied sector', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  await dragOfferToLocked(page, affordable.offerIndex, 0);
  const before = await snapshot(page);
  const item = before.shop.lockedSlots[0] as ShopBlockSnapshotItem;
  const occupiedSector = before.board.findIndex(block => block !== null && block.type !== item.type);
  expect(occupiedSector).toBeGreaterThanOrEqual(0);
  const beforeBlock = before.board[occupiedSector];
  const lockedPos = slotCenter(before.screen.w, 'locked', 0);

  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selected = await snapshot(page);
  const angle = selected.rotationAngle * Math.PI / 180 + (occupiedSector + 0.5) * Math.PI / 4;
  const radius = selected.screen.octagonRadius * 0.55;
  await page.mouse.click(
    selected.screen.octagonCenterX + Math.cos(angle) * radius,
    selected.screen.octagonCenterY + Math.sin(angle) * radius,
  );

  const after = await snapshot(page);
  expect(after.board[occupiedSector]).toEqual(beforeBlock);
  expect(after.villagePower).toBe(selected.villagePower);
  expect(after.shop.lockedSlots[0]).toEqual(item);
});

test('level three buildings cannot be upgraded further', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page, 10);
  await dragOfferToLocked(page, affordable.offerIndex, 0);
  const before = await snapshot(page);
  const item = before.shop.lockedSlots[0] as ShopBlockSnapshotItem;
  const lockedPos = slotCenter(before.screen.w, 'locked', 0);

  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selectedFirst = await snapshot(page);
  const target = emptySectorPoint(selectedFirst);
  await page.mouse.click(target.x, target.y);
  let state = await snapshot(page);

  for (let expectedLevel = 2; expectedLevel <= 3; expectedLevel++) {
    await page.mouse.click(lockedPos.x, lockedPos.y);
    await page.mouse.click(target.x, target.y);
    state = await snapshot(page);
    expect(state.board[target.sector]).toMatchObject({ type: item.type, level: expectedLevel });
  }

  const beforeBlocked = await snapshot(page);
  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selectedBlocked = await snapshot(page);
  await page.mouse.click(target.x, target.y);
  const afterBlocked = await snapshot(page);
  expect(afterBlocked.board[target.sector]).toEqual(beforeBlocked.board[target.sector]);
  expect(afterBlocked.villagePower).toBe(selectedBlocked.villagePower);
  expect(afterBlocked.shop.lockedSlots[0]).toEqual(item);
});

test('clicking outside the octagon cancels placement without spending power', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  const item = affordable.item;
  const offerPos = slotCenter(affordable.state.screen.w, 'offer', affordable.offerIndex);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'offer', index: affordable.offerIndex, item: { id: item.id, cost: item.cost } });

  await page.mouse.click(selected.screen.octagonCenterX + selected.screen.octagonRadius + 40, selected.screen.octagonCenterY);

  const after = await snapshot(page);
  expect(after.shop.selectedItem).toBeNull();
  expect(after.shop.offerSlots[affordable.offerIndex]).toEqual(item);
  expect(after.board).toEqual(selected.board);
  expect(after.villagePower).toBe(selected.villagePower);
  expect(after.turnNumber).toBe(selected.turnNumber);
});

test('placing a different locked item on an occupied sector does not spend power, overwrite, or end the turn', async ({ page }) => {
  const affordable = await findAffordableBlockOffer(page);
  await dragOfferToLocked(page, affordable.offerIndex, 0);
  const before = await snapshot(page);
  const lockedItem = before.shop.lockedSlots[0] as ShopBlockSnapshotItem;
  const occupiedSector = before.board.findIndex(block => block !== null && block.type !== lockedItem.type);
  expect(occupiedSector).toBeGreaterThanOrEqual(0);
  const lockedPos = slotCenter(before.screen.w, 'locked', 0);
  await page.mouse.click(lockedPos.x, lockedPos.y);

  const angle = (occupiedSector + 0.5) * Math.PI / 4;
  const radius = before.screen.octagonRadius * 0.55;
  await page.mouse.click(
    before.screen.octagonCenterX + Math.cos(angle) * radius,
    before.screen.octagonCenterY + Math.sin(angle) * radius,
  );

  const after = await snapshot(page);
  expect(after.board[occupiedSector]).toEqual(before.board[occupiedSector]);
  expect(after.villagePower).toBe(before.villagePower);
  expect(after.turnNumber).toBe(before.turnNumber);
});

test('hovering a visible dragon shows and hides its description panel', async ({ page }) => {
  let state = await snapshot(page);
  for (let i = 0; i < 6 && !state.dragons.find(d => d.screen); i++) {
    await page.mouse.click(state.screen.octagonCenterX, state.screen.octagonCenterY);
    await page.waitForTimeout(750);
    state = await snapshot(page);
  }
  const dragon = state.dragons.find(d => d.screen);
  expect(dragon).toBeTruthy();
  await page.mouse.move(dragon!.screen!.x, dragon!.screen!.y);
  await expect.poll(async () => (await snapshot(page)).dragonTooltipVisible).toBe(true);
  await page.mouse.move(20, state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).dragonTooltipVisible).toBe(false);
});
