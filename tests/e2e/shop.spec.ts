import { expect, test } from '@playwright/test';

type SectionKey = 'locked' | 'resource' | 'defense' | 'offense' | 'spell';

type SlotLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

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
    locked: (ShopSnapshotItem | null)[];
    resource: (ShopSnapshotItem | null)[];
    defense: (ShopSnapshotItem | null)[];
    offense: (ShopSnapshotItem | null)[];
    spell: (ShopSnapshotItem | null)[];
    totalSlots: number;
    maxTotalSlots: number;
    totalExpansions: number;
    nextExpansionCost: number;
    selectedItem: { area: SectionKey; index: number; item: ShopSnapshotItem } | null;
    layout: {
      sections: Record<SectionKey, {
        slots: SlotLayout[];
        addButton: SlotLayout;
      }>;
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

const refreshSections: Exclude<SectionKey, 'locked'>[] = ['resource', 'defense', 'offense', 'spell'];

async function snapshot(page: import('@playwright/test').Page): Promise<Snapshot> {
  await page.waitForFunction(() => Boolean((window as any).__dragonSlayerGame));
  return page.evaluate(() => (window as any).__dragonSlayerGame.getSnapshot());
}

function sectionItems(state: Snapshot, section: SectionKey): (ShopSnapshotItem | null)[] {
  return state.shop[section];
}

function slotCenter(state: Snapshot, section: SectionKey, index: number): { x: number; y: number } {
  const slot = state.shop.layout.sections[section].slots[index];
  return { x: slot.centerX, y: slot.centerY };
}

function addButtonCenter(state: Snapshot, section: SectionKey): { x: number; y: number } {
  const button = state.shop.layout.sections[section].addButton;
  return { x: button.centerX, y: button.centerY };
}

async function dragSectionItemToLocked(
  page: import('@playwright/test').Page,
  section: Exclude<SectionKey, 'locked'>,
  index: number,
  lockedIndex: number,
): Promise<void> {
  const state = await snapshot(page);
  const from = slotCenter(state, section, index);
  const to = slotCenter(state, 'locked', lockedIndex);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function findAffordableRefreshItem(
  page: import('@playwright/test').Page,
  predicate: (item: ShopSnapshotItem) => boolean = () => true,
): Promise<{ state: Snapshot; section: Exclude<SectionKey, 'locked'>; index: number; item: ShopSnapshotItem }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    for (const section of refreshSections) {
      const index = sectionItems(state, section).findIndex(item => item !== null && item.cost <= state.villagePower && predicate(item));
      if (index >= 0) return { state, section, index, item: sectionItems(state, section)[index] as ShopSnapshotItem };
    }
    await page.reload();
    await expect.poll(async () => countVisibleRefreshItems(await snapshot(page))).toBeGreaterThan(0);
  }
  throw new Error('Could not find a matching affordable refresh-section item');
}

function countVisibleRefreshItems(state: Snapshot): number {
  return refreshSections.reduce((count, section) => count + sectionItems(state, section).filter(Boolean).length, 0);
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
  await expect.poll(async () => countVisibleRefreshItems(await snapshot(page))).toBeGreaterThan(0);
});

test('shop starts with sectioned slots and unique items', async ({ page }) => {
  const state = await snapshot(page);
  expect(state.shop.locked).toHaveLength(1);
  expect(state.shop.resource).toHaveLength(2);
  expect(state.shop.defense).toHaveLength(2);
  expect(state.shop.offense).toHaveLength(2);
  expect(state.shop.spell).toHaveLength(1);
  expect(state.shop.totalSlots).toBe(8);
  expect(state.shop.maxTotalSlots).toBe(15);
  expect(state.shop.nextExpansionCost).toBe(50);

  const visible = [
    ...state.shop.locked,
    ...state.shop.resource,
    ...state.shop.defense,
    ...state.shop.offense,
    ...state.shop.spell,
  ].filter((item): item is ShopSnapshotItem => item !== null);
  expect(new Set(visible.map(item => item.id)).size).toBe(visible.length);
  expect(state.shop.resource.every(item => item === null || item.tags.includes('资源'))).toBe(true);
  expect(state.shop.defense.every(item => item === null || item.tags.includes('防御'))).toBe(true);
  expect(state.shop.offense.every(item => item === null || item.tags.includes('进攻'))).toBe(true);
  expect(state.shop.spell.every(item => item === null || item.tags.includes('法术'))).toBe(true);
});

test('a long drag still rotates the board by one step', async ({ page }) => {
  const rotated = await rotateBoardOneStep(page);
  expect(rotated.turnRotationSteps).toBe(1);
});

test('dragging a refresh-section item to locked overwrites the target and refills its source slot', async ({ page }) => {
  const first = await findAffordableRefreshItem(page, item => item.kind === 'block' && item.tags.includes('资源'));
  await dragSectionItemToLocked(page, first.section, first.index, 0);
  const mid = await snapshot(page);
  const lockedItem = mid.shop.locked[0];
  expect(lockedItem).toEqual(first.item);
  expect(sectionItems(mid, first.section)[first.index]).toBeTruthy();
  expect(sectionItems(mid, first.section)[first.index]?.id).not.toBe(first.item.id);

  const second = await findAffordableRefreshItem(page, item => item.kind === 'block' && item.id !== lockedItem?.id);
  await dragSectionItemToLocked(page, second.section, second.index, 0);
  const after = await snapshot(page);
  expect(after.shop.locked[0]).toEqual(second.item);
  expect(sectionItems(after, second.section)[second.index]).toBeTruthy();
  expect(after.turnNumber).toBe(mid.turnNumber);
  expect(after.villagePower).toBe(mid.villagePower);
});

test('placing a locked item spends power and does not end the turn', async ({ page }) => {
  const affordable = await findAffordableRefreshItem(page, item => item.kind === 'block');
  await dragSectionItemToLocked(page, affordable.section, affordable.index, 0);
  const beforeSelect = await snapshot(page);
  const item = beforeSelect.shop.locked[0] as ShopBlockSnapshotItem;
  const lockedPos = slotCenter(beforeSelect, 'locked', 0);

  await page.mouse.click(lockedPos.x, lockedPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'locked', index: 0, item: { id: item.id, cost: item.cost } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(item.type);
  expect(after.villagePower).toBe(beforeSelect.villagePower - item.cost);
  expect(after.turnNumber).toBe(beforeSelect.turnNumber);
  expect(after.shop.locked[0]).toEqual(item);
});

test('clicking a refresh-section item selects it and refills that slot after successful placement', async ({ page }) => {
  const affordable = await findAffordableRefreshItem(page, item => item.kind === 'block');
  const item = affordable.item as ShopBlockSnapshotItem;
  const offerPos = slotCenter(affordable.state, affordable.section, affordable.index);
  await page.mouse.click(offerPos.x, offerPos.y);

  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: affordable.section, index: affordable.index, item: { id: item.id, cost: item.cost } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(item.type);
  expect(sectionItems(after, affordable.section)[affordable.index]).toBeTruthy();
  const visible = [
    ...after.shop.locked,
    ...after.shop.resource,
    ...after.shop.defense,
    ...after.shop.offense,
    ...after.shop.spell,
  ].filter((entry): entry is ShopSnapshotItem => entry !== null);
  expect(new Set(visible.map(entry => entry.id)).size).toBe(visible.length);
  expect(after.villagePower).toBe(selected.villagePower - item.cost);
  expect(after.turnNumber).toBe(selected.turnNumber);
});

test('expanding a section spends village power, increases cost, and adds a slot without ending the turn', async ({ page }) => {
  const before = await snapshot(page);
  const button = addButtonCenter(before, 'resource');
  await page.mouse.click(button.x, button.y);

  const after = await snapshot(page);
  expect(after.shop.resource).toHaveLength(before.shop.resource.length + 1);
  expect(after.shop.totalSlots).toBe(before.shop.totalSlots + 1);
  expect(after.shop.totalExpansions).toBe(before.shop.totalExpansions + 1);
  expect(after.shop.nextExpansionCost).toBe(80);
  expect(after.villagePower).toBe(before.villagePower - 50);
  expect(after.turnNumber).toBe(before.turnNumber);
});

test('hovering an expansion button shows the current expansion cost', async ({ page }) => {
  const state = await snapshot(page);
  const button = addButtonCenter(state, 'defense');

  await page.mouse.move(button.x, button.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  const after = await snapshot(page);
  expect(after.shopTooltipLines.join('\n')).toContain(`消耗: ${state.shop.nextExpansionCost} 战力`);
});

test('clicking outside the octagon cancels placement without spending power', async ({ page }) => {
  const affordable = await findAffordableRefreshItem(page, item => item.kind === 'block');
  const item = affordable.item;
  const offerPos = slotCenter(affordable.state, affordable.section, affordable.index);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: affordable.section, index: affordable.index, item: { id: item.id, cost: item.cost } });

  await page.mouse.click(selected.screen.octagonCenterX + selected.screen.octagonRadius + 40, selected.screen.octagonCenterY);

  const after = await snapshot(page);
  expect(after.shop.selectedItem).toBeNull();
  expect(sectionItems(after, affordable.section)[affordable.index]).toEqual(item);
  expect(after.board).toEqual(selected.board);
  expect(after.villagePower).toBe(selected.villagePower);
});

test('hovering a shop item still shows and hides the tooltip', async ({ page }) => {
  const affordable = await findAffordableRefreshItem(page);
  const offerPos = slotCenter(affordable.state, affordable.section, affordable.index);

  await page.mouse.move(offerPos.x, offerPos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  await page.mouse.move(20, affordable.state.screen.h - 20);
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
