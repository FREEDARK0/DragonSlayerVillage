import { expect, test } from '@playwright/test';

type SectionKey = 'base' | 'random' | 'temporary';

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
    templateId: string;
    name: string;
    hp: number;
    maxHp: number;
    attack: number;
    readyToAttackTurn: number;
    attackDisplay: { text: string; pending: boolean };
    assetName: string | null;
    screen: { x: number; y: number } | null;
  }[];
  shop: {
    base: ShopSnapshotItem[];
    random: { item: ShopSnapshotItem | null; locked: boolean }[];
    temporary: ShopSnapshotItem[];
    refreshCost: number;
    selectedItem: { area: SectionKey; index: number; item: ShopSnapshotItem } | null;
    layout: {
      sections: {
        base: { slots: SlotLayout[] };
        random: { slots: RandomSlotLayout[] };
        temporary: { slots: SlotLayout[] };
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
    viewportW: number;
    viewportH: number;
    layoutProfile: string;
  };
  rotationAngle: number;
  turnRotationSteps: number;
  holdEndTurnProgress: {
    visible: boolean;
    progress: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotationControls: {
    clockwise: SlotLayout;
    counterclockwise: SlotLayout;
  };
  dragonTooltipVisible: boolean;
  dragonAssetNames: Record<string, string | null>;
  shopTooltipVisible: boolean;
  shopTooltipLines: string[];
  relicTooltipVisible: boolean;
  relicTooltipLines: string[];
  relicTooltipPanel: SlotLayout;
  relics: {
    owned: { id: string; count: number }[];
    layout: {
      ownedIcons: (SlotLayout & { id: string; count: number })[];
    };
  };
  debugShop: {
    enabled: boolean;
    visible: boolean;
    mode: 'items' | 'relics';
    freePurchase: boolean;
    layout: {
      panel: SlotLayout;
      itemModeButton: SlotLayout;
      relicModeButton: SlotLayout;
      freeToggle: SlotLayout;
      entries: (SlotLayout & { id: string; disabled: boolean; muted: boolean })[];
      scrollOffset: number;
      contentHeight: number;
    };
    postProcessLayout: {
      visible: boolean;
      panel: SlotLayout;
      controls: (SlotLayout & { id: string; value?: string | number | boolean })[];
      saveStatus: string;
    };
  };
  postProcess: {
    filterEnabled: boolean;
    warmTint: { enabled: boolean; strength: number; color: string };
    posterizePalette: { enabled: boolean; bandCount: number; colors: string[] };
    softGlow: { enabled: boolean; strength: number; threshold: number; radius: number };
    saveStatus: string;
  };
  tutorial: {
    activeId: 'goal' | 'shop' | 'progress' | 'dayNight' | null;
    dimVisible: boolean;
    text: string;
    highlights: { x: number; y: number; width: number; height: number; radius: number; shape: 'circle' | 'rect' }[];
    layout: {
      panel: SlotLayout;
      buttons: (SlotLayout & { id: 'goal' | 'shop' | 'progress' | 'dayNight'; label: string; active: boolean })[];
      textPanel: SlotLayout;
    };
  };
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
  effectiveCost: number;
  tags: string[];
  tempAttack: number;
  temporary: boolean;
  repelTemplateId?: string;
};

type ShopActionSnapshotItem = {
  id: string;
  kind: 'action';
  actionType: string;
  label: string;
  cost: number;
  baseReward: number;
  tags: string[];
};

type ShopSnapshotItem = ShopBlockSnapshotItem | ShopSpellSnapshotItem | ShopActionSnapshotItem;

async function snapshot(page: import('@playwright/test').Page): Promise<Snapshot> {
  await page.waitForFunction(() => Boolean((window as any).__dragonSlayerGame));
  return page.evaluate(() => (window as any).__dragonSlayerGame.getSnapshot());
}

async function worldToClient(page: import('@playwright/test').Page, point: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return { x, y };
    const snapshot = (window as any).__dragonSlayerGame.getSnapshot();
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (x / snapshot.screen.w) * rect.width,
      y: rect.top + (y / snapshot.screen.h) * rect.height,
    };
  }, point);
}

async function mouseClickWorld(page: import('@playwright/test').Page, x: number, y: number, options?: Parameters<import('@playwright/test').Page['mouse']['click']>[2]): Promise<void> {
  const point = await worldToClient(page, { x, y });
  await page.mouse.click(point.x, point.y, options);
}

async function mouseMoveWorld(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
  const point = await worldToClient(page, { x, y });
  await page.mouse.move(point.x, point.y);
}

async function touchPressWorld(page: import('@playwright/test').Page, point: { x: number; y: number }, holdMs: number): Promise<void> {
  const client = await worldToClient(page, point);
  await page.dispatchEvent('canvas', 'pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: client.x,
    clientY: client.y,
    bubbles: true,
    cancelable: true,
  });
  await page.waitForTimeout(holdMs);
  await page.dispatchEvent('canvas', 'pointerup', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: client.x,
    clientY: client.y,
    bubbles: true,
    cancelable: true,
  });
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

function debugEntry(state: Snapshot, id: string): SlotLayout & { id: string; disabled: boolean; muted: boolean } {
  const entry = state.debugShop.layout.entries.find(candidate => candidate.id === id);
  if (!entry) throw new Error(`Missing debug entry ${id}`);
  return entry;
}

function postProcessControl(state: Snapshot, id: string): SlotLayout & { id: string; value?: string | number | boolean } {
  const control = state.debugShop.postProcessLayout.controls.find(candidate => candidate.id === id);
  if (!control) throw new Error(`Missing postprocess control ${id}`);
  return control;
}

async function averageCanvasBrightness(page: import('@playwright/test').Page, layout: SlotLayout): Promise<number> {
  const points = [
    { x: layout.x + layout.width * 0.28, y: layout.y + layout.height * 0.34 },
    { x: layout.x + layout.width * 0.54, y: layout.y + layout.height * 0.32 },
    { x: layout.x + layout.width * 0.66, y: layout.y + layout.height * 0.52 },
    { x: layout.x + layout.width * 0.50, y: layout.y + layout.height * 0.70 },
  ];
  return page.evaluate((samplePoints) => {
    return new Promise<number>((resolve, reject) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        reject(new Error('Missing canvas'));
        return;
      }
      const image = new Image();
      image.onload = () => {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = canvas.width;
        sampleCanvas.height = canvas.height;
        const ctx = sampleCanvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Missing sample canvas 2d context'));
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        let total = 0;
        for (const point of samplePoints) {
          const pixel = ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
          total += (pixel[0] + pixel[1] + pixel[2]) / 3;
        }
        resolve(total / samplePoints.length);
      };
      image.onerror = () => reject(new Error('Could not sample canvas image'));
      image.src = canvas.toDataURL('image/png');
    });
  }, points);
}

async function findAffordableRandomBlock(page: import('@playwright/test').Page): Promise<{ state: Snapshot; index: number; item: ShopBlockSnapshotItem }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await snapshot(page);
    const index = state.shop.random.findIndex(slot => slot.item?.kind === 'block' && slot.item.cost <= state.villageGold);
    if (index >= 0) return { state, index, item: state.shop.random[index].item as ShopBlockSnapshotItem };
    const refresh = refreshCenter(state);
    if (state.villageGold >= state.shop.refreshCost) {
      await page.mouse.click(refresh.x, refresh.y);
    } else {
      await page.reload();
    }
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

function sectorPoint(state: Snapshot, sector: number): { x: number; y: number; sector: number } {
  const angle = state.rotationAngle * Math.PI / 180 + (sector + 0.5) * Math.PI / 4;
  const radius = state.screen.octagonRadius * 0.55;
  return {
    sector,
    x: state.screen.octagonCenterX + Math.cos(angle) * radius,
    y: state.screen.octagonCenterY + Math.sin(angle) * radius,
  };
}

function ringPoint(state: Snapshot, angleDeg: number): { x: number; y: number } {
  const angle = angleDeg * Math.PI / 180;
  const radius = state.screen.octagonRadius * 0.74;
  return {
    x: state.screen.octagonCenterX + Math.cos(angle) * radius,
    y: state.screen.octagonCenterY + Math.sin(angle) * radius,
  };
}

async function rightDragArc(page: import('@playwright/test').Page, state: Snapshot, fromDeg: number, toDeg: number): Promise<void> {
  const from = ringPoint(state, fromDeg);
  await mouseMoveWorld(page, from.x, from.y);
  await page.mouse.down({ button: 'right' });
  const distance = Math.abs(toDeg - fromDeg);
  const steps = Math.max(1, Math.ceil(distance / 12));
  for (let step = 1; step <= steps; step++) {
    const angle = fromDeg + (toDeg - fromDeg) * step / steps;
    const point = ringPoint(state, angle);
    await mouseMoveWorld(page, point.x, point.y);
  }
  await page.mouse.up({ button: 'right' });
}

async function holdToEndTurn(page: import('@playwright/test').Page, state: Snapshot): Promise<void> {
  await mouseMoveWorld(page, state.screen.octagonCenterX, state.screen.octagonCenterY);
  await page.mouse.down();
  await page.waitForTimeout(710);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => randomItems(await snapshot(page)).filter(Boolean).length).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__dragonSlayerGame.resetPostProcessConfigForTest?.());
  await expect.poll(async () => (await snapshot(page)).postProcess.saveStatus, { timeout: 5000 }).toBe('已保存');
});

test('shop starts with base slots, random slots, unique random items, and refresh cost', async ({ page }) => {
  let state = await snapshot(page);
  expect(state.villageHp).toBe(50);
  expect(state.villageGold).toBe(10);
  expect(state.shop.base.map(item => item.id)).toEqual(['block:wood_wall', 'block:mine', 'spell:missile', 'action:sell']);
  expect(state.shop.base[3]).toMatchObject({ kind: 'action', actionType: 'sell', label: '出售', cost: 0, baseReward: 3 });
  expect(state.shop.layout.sections.base.slots).toHaveLength(4);
  expect(state.shop.random).toHaveLength(4);
  expect(state.shop.temporary).toHaveLength(0);
  expect(state.shop.layout.sections.temporary.slots).toHaveLength(0);
  expect(state.shop.refreshCost).toBe(1);

  const visible = randomItems(state).filter((item): item is ShopSnapshotItem => item !== null);
  expect(new Set(visible.map(item => item.id)).size).toBe(visible.length);
  expect(visible.map(item => item.id)).not.toContain('block:wood_wall');
  expect(visible.map(item => item.id)).not.toContain('block:mine');
  expect(visible.map(item => item.id)).not.toContain('spell:missile');
  expect(visible.map(item => item.id)).not.toContain('action:sell');
});

test('temporary shop slots extend horizontally to the right of random slots', async ({ page }) => {
  await page.evaluate(() => (window as any).__dragonSlayerGame.prepareTemporaryShopLayoutTest());
  await expect.poll(async () => (await snapshot(page)).shop.temporary.length).toBe(2);

  let state = await snapshot(page);
  const randomSlots = state.shop.layout.sections.random.slots;
  const temporarySlots = state.shop.layout.sections.temporary.slots;
  const refreshButton = state.shop.layout.refreshButton;
  const lastRandom = randomSlots[randomSlots.length - 1];

  expect(temporarySlots).toHaveLength(2);
  for (const slot of temporarySlots) {
    expect(slot.y).toBe(lastRandom.y);
    expect(slot.centerY).toBe(lastRandom.centerY);
  }
  expect(temporarySlots[0].x).toBeGreaterThan(lastRandom.x + lastRandom.width);
  expect(refreshButton.x).toBeGreaterThan(temporarySlots[temporarySlots.length - 1].x + temporarySlots[temporarySlots.length - 1].width);
});

test('right-button drag rotates the board by one step', async ({ page }) => {
  const before = await snapshot(page);
  await rightDragArc(page, before, 0, 35);

  const rotated = await snapshot(page);
  expect(rotated.rotationAngle).toBe((before.rotationAngle + 45) % 360);
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

test('selling a friendly block grants gold and removes it without ending the turn', async ({ page }) => {
  const before = await snapshot(page);
  const buildPos = slotCenter(before, 'base', 0);

  await page.mouse.click(buildPos.x, buildPos.y);
  const selectedBuild = await snapshot(page);
  const target = emptySectorPoint(selectedBuild);
  await page.mouse.click(target.x, target.y);

  const placed = await snapshot(page);
  expect(placed.board[target.sector]?.type).toBe('wood_wall');
  expect(placed.villageGold).toBe(before.villageGold - 5);

  const sellPos = slotCenter(placed, 'base', 3);
  await page.mouse.click(sellPos.x, sellPos.y);
  const selectedSell = await snapshot(page);
  expect(selectedSell.shop.selectedItem).toMatchObject({ area: 'base', index: 3, item: { id: 'action:sell', kind: 'action' } });

  await rightDragArc(page, selectedSell, 0, 35);
  const afterBlockedRotate = await snapshot(page);
  expect(afterBlockedRotate.rotationAngle).toBe(selectedSell.rotationAngle);
  expect(afterBlockedRotate.turnRotationSteps).toBe(selectedSell.turnRotationSteps);

  const sellTarget = sectorPoint(afterBlockedRotate, target.sector);
  await page.mouse.click(sellTarget.x, sellTarget.y);

  const sold = await snapshot(page);
  expect(sold.board[target.sector]).toBeNull();
  expect(sold.villageGold).toBe(placed.villageGold + 3);
  expect(sold.turnNumber).toBe(before.turnNumber);
  expect(sold.shop.selectedItem).toBeNull();
});

test('sell action rejects invalid targets and keeps selection', async ({ page }) => {
  const state = await snapshot(page);
  const sellPos = slotCenter(state, 'base', 3);

  await page.mouse.click(sellPos.x, sellPos.y);
  const selected = await snapshot(page);
  const empty = emptySectorPoint(selected);
  await page.mouse.click(empty.x, empty.y);

  const after = await snapshot(page);
  expect(after.shop.selectedItem).toMatchObject({ area: 'base', index: 3, item: { id: 'action:sell' } });
  expect(after.villageGold).toBe(selected.villageGold);
  expect(after.board).toEqual(selected.board);
});

test('clicking a random item selects it and leaves that slot empty after successful placement', async ({ page }) => {
  const found = await findAffordableRandomBlock(page);
  const offerPos = slotCenter(found.state, 'random', found.index);
  await page.mouse.click(offerPos.x, offerPos.y);

  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'random', index: found.index, item: { id: found.item.id, cost: found.item.cost } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe(found.item.type);
  expect(after.shop.random[found.index].item).toBeNull();
  expect(after.shop.random[found.index].locked).toBe(false);
  expect(after.villageGold).toBe(selected.villageGold - found.item.cost);
  expect(after.turnNumber).toBe(selected.turnNumber);
});

test('purchasing a locked random item removes it and unlocks the slot', async ({ page }) => {
  const found = await findAffordableRandomBlock(page);
  await page.mouse.click(randomLockCenter(found.state, found.index).x, randomLockCenter(found.state, found.index).y);
  let state = await snapshot(page);
  expect(state.shop.random[found.index].locked).toBe(true);

  await page.mouse.click(slotCenter(state, 'random', found.index).x, slotCenter(state, 'random', found.index).y);
  state = await snapshot(page);
  const target = emptySectorPoint(state);
  await page.mouse.click(target.x, target.y);

  const after = await snapshot(page);
  expect(after.shop.random[found.index].item).toBeNull();
  expect(after.shop.random[found.index].locked).toBe(false);
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

  await holdToEndTurn(page, state);
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

test('backquote toggles debug shop and debug free item purchase uses normal placement', async ({ page }) => {
  let state = await snapshot(page);
  expect(state.debugShop.enabled).toBe(true);
  expect(state.debugShop.visible).toBe(false);

  await page.keyboard.press('Backquote');
  state = await snapshot(page);
  expect(state.debugShop.visible).toBe(true);
  expect(state.debugShop.mode).toBe('items');
  expect(state.debugShop.layout.entries.some(entry => entry.id === 'block:wood_wall')).toBe(true);
  expect(state.debugShop.layout.entries.some(entry => entry.id === 'block:scout')).toBe(true);
  expect(state.debugShop.layout.entries.some(entry => entry.id === 'spell:apple')).toBe(true);

  await page.mouse.click(state.debugShop.layout.freeToggle.centerX, state.debugShop.layout.freeToggle.centerY);
  state = await snapshot(page);
  expect(state.debugShop.freePurchase).toBe(true);

  const woodWall = debugEntry(state, 'block:wood_wall');
  await page.mouse.click(woodWall.centerX, woodWall.centerY);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ item: { id: 'block:wood_wall' } });

  const target = emptySectorPoint(selected);
  await page.mouse.click(target.x, target.y);
  const after = await snapshot(page);
  expect(after.board[target.sector]?.type).toBe('wood_wall');
  expect(after.villageGold).toBe(selected.villageGold);
});

test('debug shop can switch to relics and respects relic limits', async ({ page }) => {
  await page.keyboard.press('Backquote');
  let state = await snapshot(page);
  await page.mouse.click(state.debugShop.layout.relicModeButton.centerX, state.debugShop.layout.relicModeButton.centerY);
  state = await snapshot(page);
  expect(state.debugShop.mode).toBe('relics');

  const heart = debugEntry(state, 'village_heart');
  await page.mouse.click(heart.centerX, heart.centerY);
  let after = await snapshot(page);
  expect(after.villageHp).toBe(state.villageHp + 50);
  expect(after.relics.owned.find(relic => relic.id === 'village_heart')?.count).toBe(1);

  const auto = debugEntry(after, 'auto_missile');
  await page.mouse.click(auto.centerX, auto.centerY);
  after = await snapshot(page);
  expect(after.relics.owned.find(relic => relic.id === 'auto_missile')?.count).toBe(1);
  expect(debugEntry(after, 'auto_missile').disabled).toBe(true);
  expect(after.debugShop.layout.entries.some(entry => entry.id === 'dragon_bounty')).toBe(true);
  expect(after.debugShop.layout.entries.some(entry => entry.id === 'infantry_legacy')).toBe(true);
  expect(after.debugShop.layout.entries.some(entry => entry.id === 'sell_copy')).toBe(true);
  expect(after.debugShop.layout.entries.some(entry => entry.id === 'militia_deathrattle')).toBe(true);
  expect(after.debugShop.layout.entries.some(entry => entry.id === 'wounded_veterans')).toBe(true);
});

test('debug shop scrolls without ending the turn', async ({ page }) => {
  await page.keyboard.press('Backquote');
  const before = await snapshot(page);
  await page.mouse.wheel(0, 480);
  const after = await snapshot(page);

  expect(after.debugShop.visible).toBe(true);
  expect(after.debugShop.layout.scrollOffset).toBeGreaterThanOrEqual(before.debugShop.layout.scrollOffset);
  expect(after.turnNumber).toBe(before.turnNumber);
  expect(after.shop.selectedItem).toBeNull();
});

test('debug shop keeps unaffordable items readable while disabled', async ({ page }) => {
  await page.keyboard.press('Backquote');
  let state = await snapshot(page);
  const expensive = debugEntry(state, 'block:guardian');
  expect(expensive.disabled).toBe(true);
  expect(expensive.muted).toBe(false);
  const paidBrightness = await averageCanvasBrightness(page, expensive);
  expect(paidBrightness).toBeGreaterThan(38);

  await page.mouse.click(state.debugShop.layout.freeToggle.centerX, state.debugShop.layout.freeToggle.centerY);
  state = await snapshot(page);
  const freeExpensive = debugEntry(state, 'block:guardian');
  expect(freeExpensive.disabled).toBe(false);
  expect(freeExpensive.muted).toBe(false);
  const freeBrightness = await averageCanvasBrightness(page, freeExpensive);
  expect(freeBrightness).toBeGreaterThan(38);
});

test('debug shop overlays the right-side tutorial list when open', async ({ page }) => {
  let state = await snapshot(page);
  expect(state.debugShop.visible).toBe(false);
  expect(state.tutorial.layout.panel.width).toBeGreaterThan(0);

  await page.keyboard.press('Backquote');
  state = await snapshot(page);
  expect(state.debugShop.visible).toBe(true);
  expect(state.debugShop.layout.panel.x).toBeLessThanOrEqual(state.tutorial.layout.panel.x);
  expect(state.debugShop.layout.panel.x + state.debugShop.layout.panel.width).toBeGreaterThanOrEqual(state.tutorial.layout.panel.x + state.tutorial.layout.panel.width);
});

test('debug postprocess panel adjusts effects and persists config', async ({ page }) => {
  await page.keyboard.press('Backquote');
  let state = await snapshot(page);
  expect(state.debugShop.visible).toBe(true);
  expect(state.debugShop.postProcessLayout.visible).toBe(true);
  expect(state.debugShop.postProcessLayout.panel.x + state.debugShop.postProcessLayout.panel.width).toBeLessThanOrEqual(state.debugShop.layout.panel.x);
  expect(state.postProcess.filterEnabled).toBe(true);
  expect(state.postProcess.warmTint).toMatchObject({ enabled: true, strength: 0.1, color: '#fff0b8' });
  expect(state.postProcess.posterizePalette.bandCount).toBe(4);
  expect(state.postProcess.posterizePalette.colors).toHaveLength(8);
  expect(state.postProcess.softGlow.enabled).toBe(true);

  const warmUp = postProcessControl(state, 'warm.strength.up');
  await page.mouse.click(warmUp.centerX, warmUp.centerY);
  await expect.poll(async () => (await snapshot(page)).postProcess.warmTint.strength).toBeGreaterThan(0.1);

  state = await snapshot(page);
  const posterizeToggle = postProcessControl(state, 'posterize.enabled');
  await page.mouse.click(posterizeToggle.centerX, posterizeToggle.centerY);
  await expect.poll(async () => (await snapshot(page)).postProcess.posterizePalette.enabled).toBe(true);

  state = await snapshot(page);
  const firstColor = state.postProcess.posterizePalette.colors[0];
  const firstSwatch = postProcessControl(state, 'posterize.color.0');
  await page.mouse.click(firstSwatch.centerX, firstSwatch.centerY);
  await expect.poll(async () => (await snapshot(page)).postProcess.posterizePalette.colors[0]).not.toBe(firstColor);
  await expect.poll(async () => (await snapshot(page)).postProcess.saveStatus, { timeout: 5000 }).toBe('已保存');

  await page.reload();
  await expect.poll(async () => randomItems(await snapshot(page)).filter(Boolean).length).toBeGreaterThan(0);
  state = await snapshot(page);
  expect(state.postProcess.posterizePalette.enabled).toBe(true);
  expect(state.postProcess.warmTint.strength).toBeGreaterThan(0.1);
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

test('missile tooltip shows mage-boosted spell attack and resets after casting', async ({ page }) => {
  await page.evaluate(() => (window as any).__dragonSlayerGame.prepareMageMissileTooltipTest());
  let state = await snapshot(page);
  expect(state.shop.base[2]).toMatchObject({ id: 'spell:missile', tempAttack: 2 });
  const missilePos = slotCenter(state, 'base', 2);
  await page.mouse.move(missilePos.x, missilePos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  expect((await snapshot(page)).shopTooltipLines.join('\n')).toContain('法术攻击 7');

  await page.mouse.click(missilePos.x, missilePos.y);
  const target = sectorPoint(await snapshot(page), 1);
  await page.mouse.click(target.x, target.y);
  await expect.poll(async () => ((await snapshot(page)).shop.base[2] as ShopSpellSnapshotItem).tempAttack).toBe(0);

  state = await snapshot(page);
  const resetMissilePos = slotCenter(state, 'base', 2);
  await page.mouse.move(resetMissilePos.x, resetMissilePos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  expect((await snapshot(page)).shopTooltipLines.join('\n')).toContain('法术攻击 5');
});

test('hovering an owned relic icon shows its effect tooltip', async ({ page }) => {
  await page.evaluate(() => (window as any).__dragonSlayerGame.prepareOwnedRelicTooltipTest());
  await expect.poll(async () => (await snapshot(page)).relics.owned.length).toBe(1);

  const state = await snapshot(page);
  const relic = state.relics.layout.ownedIcons[0];
  await page.mouse.move(relic.centerX, relic.centerY);
  await expect.poll(async () => (await snapshot(page)).relicTooltipVisible).toBe(true);

  const after = await snapshot(page);
  const lines = after.relicTooltipLines.join('\n');
  expect(lines).toContain('自动飞弹');
  expect(lines).toContain('数量: 1');
  expect(lines).toContain('每回合自动向生命最高的龙发射');
  expect(after.relicTooltipPanel.x).toBeGreaterThanOrEqual(relic.x + relic.width);
  expect(Math.abs(after.relicTooltipPanel.y - relic.y)).toBeLessThanOrEqual(2);

  await page.mouse.move(state.screen.w - 20, state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).relicTooltipVisible).toBe(false);
});

test('hovering sell action shows reward tooltip', async ({ page }) => {
  const state = await snapshot(page);
  const offerPos = slotCenter(state, 'base', 3);

  await page.mouse.move(offerPos.x, offerPos.y);
  await expect.poll(async () => (await snapshot(page)).shopTooltipVisible).toBe(true);
  const after = await snapshot(page);
  expect(after.shopTooltipLines.join('\n')).toContain('出售  +3 金币');
  expect(after.shopTooltipLines.join('\n')).toContain('不会触发销毁效果');
});

test('hovering a visible dragon still shows and hides its tooltip', async ({ page }) => {
  let state = await snapshot(page);
  for (let i = 0; i < 8 && !state.dragons.find(dragon => dragon.screen); i++) {
    await holdToEndTurn(page, state);
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

test('dragon tooltip remains visible after renderer redraw while hovered', async ({ page }) => {
  let state = await snapshot(page);
  for (let i = 0; i < 8 && !state.dragons.find(dragon => dragon.screen); i++) {
    await holdToEndTurn(page, state);
    await page.waitForTimeout(750);
    state = await snapshot(page);
  }
  const dragon = state.dragons.find(candidate => candidate.screen && candidate.screen.y > 170);
  expect(dragon).toBeTruthy();
  await mouseMoveWorld(page, dragon!.screen!.x, dragon!.screen!.y);
  await expect.poll(async () => (await snapshot(page)).dragonTooltipVisible).toBe(true);

  await page.evaluate(() => (window as any).__dragonSlayerGame.prepareRhythmEventTextTest());
  await expect.poll(async () => (await snapshot(page)).dragonTooltipVisible).toBe(true);
});

test('selected missile can be cast by directly clicking a visible dragon', async ({ page }) => {
  let state = await snapshot(page);
  for (let i = 0; i < 8 && !state.dragons.find(dragon => dragon.screen); i++) {
    await holdToEndTurn(page, state);
    await page.waitForTimeout(750);
    state = await snapshot(page);
  }
  const dragon = state.dragons.find(candidate => candidate.screen && candidate.screen.y > 170);
  expect(dragon).toBeTruthy();
  const missilePos = slotCenter(state, 'base', 2);

  await page.mouse.click(missilePos.x, missilePos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ item: { id: 'spell:missile' } });
  const beforeDragon = selected.dragons.find(candidate => candidate.id === dragon!.id);
  expect(beforeDragon?.screen).toBeTruthy();

  await page.mouse.click(beforeDragon!.screen!.x, beforeDragon!.screen!.y);
  await expect.poll(async () => (await snapshot(page)).shop.selectedItem).toBeNull();

  const after = await snapshot(page);
  const afterDragon = after.dragons.find(candidate => candidate.id === dragon!.id);
  expect(afterDragon?.hp).toBe(beforeDragon!.hp - 5);
  expect(after.villageGold).toBe(selected.villageGold - 10);
});

test.describe('responsive H5 input mapping', () => {
  const cases = [
    { name: 'wide desktop DPR 1.25', viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1.25 },
    { name: 'mobile portrait DPR 2', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    { name: 'mobile landscape DPR 2', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 },
  ];

  for (const config of cases) {
    test(`shop placement works after canvas scaling on ${config.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: config.viewport,
        deviceScaleFactor: config.deviceScaleFactor,
        isMobile: config.viewport.width < 900,
        hasTouch: config.viewport.width < 900,
      });
      const page = await context.newPage();
      await page.goto('/');
      await expect.poll(async () => randomItems(await snapshot(page)).filter(Boolean).length).toBeGreaterThan(0);

      const before = await snapshot(page);
      const item = before.shop.base[0] as ShopBlockSnapshotItem;
      const offerPos = slotCenter(before, 'base', 0);
      await mouseClickWorld(page, offerPos.x, offerPos.y);

      const selected = await snapshot(page);
      expect(selected.shop.selectedItem).toMatchObject({ area: 'base', index: 0, item: { id: item.id } });
      const target = emptySectorPoint(selected);
      await mouseClickWorld(page, target.x, target.y);

      const after = await snapshot(page);
      expect(after.board[target.sector]?.type).toBe(item.type);
      expect(after.villageGold).toBe(before.villageGold - item.cost);
      await context.close();
    });
  }
});

test('mobile long press shows a dragon tooltip without casting selected missile', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect.poll(async () => randomItems(await snapshot(page)).filter(Boolean).length).toBeGreaterThan(0);

  let state = await snapshot(page);
  for (let i = 0; i < 8 && !state.dragons.find(dragon => dragon.screen); i++) {
    await holdToEndTurn(page, state);
    await page.waitForTimeout(750);
    state = await snapshot(page);
  }
  const dragon = state.dragons.find(candidate => candidate.screen);
  expect(dragon).toBeTruthy();

  const missilePos = slotCenter(state, 'base', 2);
  await mouseClickWorld(page, missilePos.x, missilePos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ item: { id: 'spell:missile' } });
  const targetDragon = selected.dragons.find(candidate => candidate.id === dragon!.id);
  expect(targetDragon?.screen).toBeTruthy();
  const client = await worldToClient(page, targetDragon!.screen!);

  await page.touchscreen.tap(client.x, client.y);
  await expect.poll(async () => (await snapshot(page)).shop.selectedItem).toBeNull();

  state = await snapshot(page);
  const nextDragon = state.dragons.find(candidate => candidate.screen);
  expect(nextDragon?.screen).toBeTruthy();
  await touchPressWorld(page, nextDragon!.screen!, 620);
  await expect.poll(async () => (await snapshot(page)).dragonTooltipVisible).toBe(true);
  await context.close();
});

test('dragon templates resolve to asset images', async ({ page }) => {
  const state = await snapshot(page);
  expect(state.dragonAssetNames).toMatchObject({
    wyvern: '亚龙',
    aurus: '黄金龙',
    furo: '破坏龙',
    ignis: '高傲龙',
    gulo: '贪食龙',
    brutus: '火龙',
  });
  expect(Object.values(state.dragonAssetNames)).not.toContain('procedural');
});
