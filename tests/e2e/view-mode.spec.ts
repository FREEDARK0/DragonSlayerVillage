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
  rotationControls: {
    clockwise: SlotLayout;
    counterclockwise: SlotLayout;
  };
  rhythm: {
    round: number;
    nodeIndex: number;
    roundLength: number;
    nodes: { type: string; triggered: boolean; eventKind?: string }[];
  } | null;
  rhythmBar: {
    nodes: (SlotLayout & { radius: number })[];
  };
  rhythmTooltipVisible: boolean;
  rhythmTooltipLines: string[];
  turnHintVisible: boolean;
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

test('right click no longer toggles view mode or cursor state', async ({ page }) => {
  const before = await snapshot(page);
  await page.mouse.click(before.screen.octagonCenterX, before.screen.octagonCenterY, { button: 'right' });

  const after = await snapshot(page);
  expect(after.viewMode).toBe(false);
  expect(after.rotationAngle).toBe(before.rotationAngle);
  expect(after.turnNumber).toBe(before.turnNumber);
  await expect.poll(async () => page.locator('canvas').evaluate(canvas => getComputedStyle(canvas).cursor)).not.toBe('zoom-in');
});

test('long drag no longer rotates the board or confirms the turn', async ({ page }) => {
  const before = await snapshot(page);
  const cx = before.screen.octagonCenterX;
  const cy = before.screen.octagonCenterY;
  const radius = before.screen.octagonRadius * 0.85;

  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  for (let deg = 15; deg <= 360; deg += 15) {
    const angle = deg * Math.PI / 180;
    await page.mouse.move(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  await page.mouse.up();

  const after = await snapshot(page);
  expect(after.viewMode).toBe(false);
  expect(after.rotationAngle).toBe(before.rotationAngle);
  expect(after.turnRotationSteps).toBe(before.turnRotationSteps);
  expect(after.turnNumber).toBe(before.turnNumber);
});

test('hovering board sectors directly shows and hides tooltips', async ({ page }) => {
  let state = await snapshot(page);

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

test('rotation buttons rotate clockwise and counterclockwise by one step', async ({ page }) => {
  const before = await snapshot(page);
  await page.mouse.click(before.rotationControls.clockwise.centerX, before.rotationControls.clockwise.centerY);

  const clockwise = await snapshot(page);
  expect(clockwise.rotationAngle).toBe((before.rotationAngle + 45) % 360);
  expect(clockwise.turnRotationSteps).toBe(before.turnRotationSteps + 1);

  await page.mouse.click(clockwise.rotationControls.counterclockwise.centerX, clockwise.rotationControls.counterclockwise.centerY);
  const back = await snapshot(page);
  expect(back.rotationAngle).toBe(before.rotationAngle);
  expect(back.turnRotationSteps).toBe(before.turnRotationSteps);
});

test('rotation buttons do not rotate while a shop item is selected', async ({ page }) => {
  const affordable = await findAffordableRandomBlock(page);
  const offerPos = slotCenter(affordable.state, 'random', affordable.index);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index, item: { id: affordable.item.id } });

  await page.mouse.click(selected.rotationControls.clockwise.centerX, selected.rotationControls.clockwise.centerY);
  const after = await snapshot(page);
  expect(after.rotationAngle).toBe(selected.rotationAngle);
  expect(after.turnRotationSteps).toBe(selected.turnRotationSteps);
  expect(after.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index, item: { id: affordable.item.id } });
});

test('turn hint is visible only when the player can end the turn directly', async ({ page }) => {
  const before = await snapshot(page);
  expect(before.turnHintVisible).toBe(true);

  const affordable = await findAffordableRandomBlock(page);
  const offerPos = slotCenter(affordable.state, 'random', affordable.index);
  await page.mouse.click(offerPos.x, offerPos.y);

  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index });
  expect(selected.turnHintVisible).toBe(false);
});

test('action mode still confirms turns normally', async ({ page }) => {
  const before = await snapshot(page);
  await page.mouse.click(before.screen.octagonCenterX, before.screen.octagonCenterY);
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(before.turnNumber);
});

test('rhythm nodes are shown below rotation controls and advance once per confirmed turn', async ({ page }) => {
  const before = await snapshot(page);
  expect(before.rhythm).toMatchObject({ round: 0, nodeIndex: 0, roundLength: 5 });
  expect(before.rhythm?.nodes).toHaveLength(5);
  expect(before.rhythm?.nodes[4].type).toBe('departure');
  expect(before.rhythmBar.nodes).toHaveLength(5);

  const buttonBottom = Math.max(before.rotationControls.clockwise.centerY, before.rotationControls.counterclockwise.centerY) + 21;
  for (const node of before.rhythmBar.nodes) {
    expect(node.centerY - node.radius).toBeGreaterThanOrEqual(buttonBottom + 4);
  }

  await page.mouse.click(before.screen.octagonCenterX, before.screen.octagonCenterY);
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(before.turnNumber);
  const after = await snapshot(page);
  expect(after.rhythm?.nodeIndex).toBe(1);
  expect(after.rhythm?.nodes[0].triggered).toBe(true);
});

test('rhythm node hover shows descriptions for node types', async ({ page }) => {
  const state = await snapshot(page);
  const normalIndex = state.rhythm?.nodes.findIndex(node => node.type === 'normal') ?? -1;
  const departureIndex = state.rhythm?.nodes.findIndex(node => node.type === 'departure') ?? -1;
  expect(normalIndex).toBeGreaterThanOrEqual(0);
  expect(departureIndex).toBeGreaterThanOrEqual(0);

  const normal = state.rhythmBar.nodes[normalIndex];
  await page.mouse.move(normal.centerX, normal.centerY);
  await expect.poll(async () => (await snapshot(page)).rhythmTooltipLines).toContain('无效果');

  const departure = state.rhythmBar.nodes[departureIndex];
  await page.mouse.move(departure.centerX, departure.centerY);
  await expect.poll(async () => (await snapshot(page)).rhythmTooltipLines).toContain('所有龙离开');

  await page.mouse.move(20, state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).rhythmTooltipVisible).toBe(false);
});
