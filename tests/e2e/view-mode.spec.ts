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

type BoundsLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
  }[];
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
    viewportW: number;
    viewportH: number;
    displayScale: number;
    layoutProfile: string;
    octagonCenterX: number;
    octagonCenterY: number;
    octagonRadius: number;
  };
  boardOutline: {
    outerWidth: number;
    outerColor: number;
    outerAlpha: number;
    innerSectorWidth: number;
    innerSectorColor: number;
  };
  viewMode: boolean;
  rotationAngle: number;
  turnRotationSteps: number;
  boardTooltipVisible: boolean;
  boardTooltipLines: string[];
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
  rhythmEventText: string;
  rhythmEventTextPosition: { x: number; y: number } | null;
  turnHintVisible: boolean;
  endTurnHintText: string;
  rotateHintVisible: boolean;
  rotateHintText: string;
  rotateHintScale: number;
  holdEndTurnProgress: {
    visible: boolean;
    progress: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  warmTint: { enabled: boolean; strength: number; color: string };
  postProcess: {
    filterEnabled: boolean;
    warmTint: { enabled: boolean; strength: number; color: string };
    posterizePalette: { enabled: boolean; bandCount: number; colors: string[] };
    softGlow: { enabled: boolean; strength: number; threshold: number; radius: number };
    saveStatus: string;
  };
  nightOverlay: {
    visibleSectors: number;
    textureLoaded: boolean;
    featherPx: number;
    radialFeatherPx: number;
    textureScale: number;
    textureUrl: string;
    usesTexture: boolean;
    solidColor: number;
    solidAlpha: number;
    mergedShape: boolean;
    internalBoundaryFeathers: boolean;
    screenMaskEnabled: boolean;
    radialBoardCutout: boolean;
  };
  cloudscape: {
    count: number;
    direction: { x: number; y: number };
    shadowsClippedToIsland: boolean;
    cloudShaderEnabled: boolean;
    shadowShaderEnabled: boolean;
    shaderShadowEnabled: boolean;
    cloudOverlayLayerAboveDragons: boolean;
    cloudShadowLayerAboveDragons: boolean;
    cloudAlpha: number;
    shadowAlpha: number;
    visibleCloudCount: number;
    visibleShadowCount: number;
    cloudOverlaySamples: { x: number; y: number; alpha: number }[];
    islandShadowSamples: { x: number; y: number; alpha: number }[];
    fallbackGraphicsEnabled: boolean;
    renderMode: 'shader-field';
    cloudShape: 'grid-rounded-rectangles';
    allowedGridSizes: string[];
    cloudGridSizes: string[];
    shadowGridSizes: string[];
    shadowOnlyCount: number;
    cloudBounds: BoundsLayout[];
    shadowBounds: BoundsLayout[];
    uniformCloudColor: number;
    uniformShadowColor: number;
    maskComposition: 'max-union-subtract-cloud';
    overlapPreservesColor: boolean;
    smoothMotion: boolean;
    runSeed: number;
    edgeAntiAliased: boolean;
    jaggedStepEdges: boolean;
    largeThickCloudCount: number;
    thinLongCloudCount: number;
    uniqueYBands: number;
    verticalSpread: number;
    pointedEnds: boolean;
    lengthRange: { min: number; max: number };
    thicknessRange: { min: number; max: number };
    cloudPixelSamples: { x: number; y: number; alpha: number }[];
    shadowPixelSamples: { x: number; y: number; alpha: number }[];
    firstCloud: { x: number; y: number } | null;
  };
  islandShadow: {
    x: number;
    y: number;
    radius: number;
    color: number;
    alpha: number;
    layerBelowNight: boolean;
    hasGlow: boolean;
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
  phaseAnnouncementVisible: boolean;
  phaseAnnouncementText: string;
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

async function mouseMoveWorld(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
  const point = await worldToClient(page, { x, y });
  await page.mouse.move(point.x, point.y);
}

async function sampleCanvasBrightness(page: import('@playwright/test').Page, x: number, y: number): Promise<number> {
  return page.evaluate(({ sampleX, sampleY }) => {
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
          reject(new Error('Missing sample context'));
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixel = ctx.getImageData(Math.round(sampleX), Math.round(sampleY), 1, 1).data;
        resolve((pixel[0] + pixel[1] + pixel[2]) / 3);
      };
      image.onerror = () => reject(new Error('Could not sample canvas image'));
      image.src = canvas.toDataURL('image/png');
    });
  }, { sampleX: x, sampleY: y });
}

async function setCloudscapeVisible(page: import('@playwright/test').Page, visible: boolean): Promise<void> {
  await page.evaluate((nextVisible) => (window as any).__dragonSlayerGame.setCloudscapeVisibleForTest?.(nextVisible), visible);
  await page.waitForTimeout(80);
}

async function sampleBrightnessAtPoints(page: import('@playwright/test').Page, points: { x: number; y: number }[]): Promise<number[]> {
  const values: number[] = [];
  for (const point of points) {
    values.push(await sampleCanvasBrightness(page, point.x, point.y));
  }
  return values;
}

function tutorialButton(state: Snapshot, id: 'goal' | 'shop' | 'progress' | 'dayNight') {
  const button = state.tutorial.layout.buttons.find(candidate => candidate.id === id);
  if (!button) throw new Error(`Missing tutorial button ${id}`);
  return button;
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

function ruleSectorPoint(state: Snapshot, ruleNumber: number): { x: number; y: number; sector: number } {
  const sector = (5 + ruleNumber - 1) % 8;
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
  await page.evaluate(() => (window as any).__dragonSlayerGame.resetPostProcessConfigForTest?.());
  await expect.poll(async () => (await snapshot(page)).postProcess.saveStatus, { timeout: 5000 }).toBe('已保存');
});

test('warm tint and tutorial list are visible at startup', async ({ page }) => {
  const state = await snapshot(page);
  expect(state.warmTint).toMatchObject({ enabled: true, strength: 0.1, color: '#fff0b8' });
  expect(state.postProcess).toMatchObject({
    filterEnabled: true,
    warmTint: { enabled: true, strength: 0.1, color: '#fff0b8' },
    posterizePalette: { enabled: false, bandCount: 4 },
    softGlow: { enabled: true, strength: 0.12, threshold: 0.74, radius: 2 },
  });
  expect(state.postProcess.posterizePalette.colors).toHaveLength(8);
  expect(state.nightOverlay).toMatchObject({
    visibleSectors: 4,
    textureLoaded: false,
    featherPx: 0,
    radialFeatherPx: 0,
    textureScale: 0,
    textureUrl: '',
    usesTexture: false,
    solidColor: 0x06111f,
    mergedShape: true,
    internalBoundaryFeathers: false,
    screenMaskEnabled: true,
    radialBoardCutout: false,
  });
  expect(state.nightOverlay.solidAlpha).toBeGreaterThan(0.6);
  expect(state.boardOutline.outerWidth).toBeGreaterThan(state.boardOutline.innerSectorWidth);
  expect(state.boardOutline.outerColor).toBe(state.boardOutline.innerSectorColor);
  expect(state.boardOutline.outerColor).toBe(0xe7d79a);
  expect(state.cloudscape.count).toBeGreaterThanOrEqual(10);
  expect(state.cloudscape.count).toBeLessThanOrEqual(11);
  expect(state.cloudscape.direction.x).toBeLessThan(0);
  expect(state.cloudscape.direction.y).toBeLessThan(0);
  expect(state.cloudscape.shadowsClippedToIsland).toBe(false);
  expect(state.cloudscape.cloudShaderEnabled).toBe(true);
  expect(state.cloudscape.shadowShaderEnabled).toBe(true);
  expect(state.cloudscape.shaderShadowEnabled).toBe(true);
  expect(state.cloudscape.fallbackGraphicsEnabled).toBe(false);
  expect(state.cloudscape.renderMode).toBe('shader-field');
  expect(state.cloudscape.cloudShape).toBe('grid-rounded-rectangles');
  expect(state.cloudscape.allowedGridSizes).toEqual(['1x1', '2x1', '3x1', '4x2']);
  for (const size of state.cloudscape.cloudGridSizes) expect(state.cloudscape.allowedGridSizes).toContain(size);
  for (const size of state.cloudscape.shadowGridSizes) expect(state.cloudscape.allowedGridSizes).toContain(size);
  expect(new Set(state.cloudscape.cloudGridSizes)).toEqual(new Set(state.cloudscape.allowedGridSizes));
  expect(state.cloudscape.shadowOnlyCount).toBeGreaterThanOrEqual(3);
  expect(state.cloudscape.uniformCloudColor).toBe(0xf5fbff);
  expect(state.cloudscape.uniformShadowColor).toBe(0x102a45);
  expect(state.cloudscape.maskComposition).toBe('max-union-subtract-cloud');
  expect(state.cloudscape.overlapPreservesColor).toBe(true);
  expect(state.cloudscape.smoothMotion).toBe(true);
  expect(state.cloudscape.runSeed).toBeGreaterThanOrEqual(0);
  expect(state.cloudscape.edgeAntiAliased).toBe(true);
  expect(state.cloudscape.jaggedStepEdges).toBe(false);
  expect(state.cloudscape.uniqueYBands).toBeGreaterThanOrEqual(6);
  expect(state.cloudscape.verticalSpread).toBeGreaterThan(0.85);
  expect(state.cloudscape.pointedEnds).toBe(false);
  expect(state.cloudscape.lengthRange.min).toBe(1);
  expect(state.cloudscape.lengthRange.max).toBe(4);
  expect(state.cloudscape.thicknessRange.min).toBe(1);
  expect(state.cloudscape.thicknessRange.max).toBe(2);
  expect(state.cloudscape.cloudBounds).toHaveLength(state.cloudscape.count);
  expect(state.cloudscape.shadowBounds).toHaveLength(state.cloudscape.count + state.cloudscape.shadowOnlyCount);
  expect(state.cloudscape.cloudOverlayLayerAboveDragons).toBe(true);
  expect(state.cloudscape.cloudShadowLayerAboveDragons).toBe(true);
  expect(state.islandShadow.layerBelowNight).toBe(true);
  expect(state.islandShadow.hasGlow).toBe(false);
  expect(state.islandShadow.color).toBe(0x02070d);
  expect(state.cloudscape.cloudAlpha).toBeGreaterThanOrEqual(0.35);
  expect(state.cloudscape.shadowAlpha).toBeGreaterThanOrEqual(0.18);
  expect(state.cloudscape.visibleCloudCount).toBeGreaterThanOrEqual(3);
  expect(state.cloudscape.visibleShadowCount).toBeGreaterThanOrEqual(3);
  expect(state.cloudscape.cloudOverlaySamples.some(sample => sample.alpha > 0.2)).toBe(true);
  expect(state.cloudscape.islandShadowSamples.some(sample => sample.alpha > 0.16)).toBe(true);
  const cloudSamples = state.cloudscape.cloudPixelSamples.filter(sample => sample.alpha > 0.2);
  expect(cloudSamples.length).toBeGreaterThan(0);
  const nightPoint = {
    x: state.screen.octagonCenterX - state.screen.octagonRadius * 1.5,
    y: state.screen.octagonCenterY + state.screen.octagonRadius * 1.5,
  };
  const dayPoint = {
    x: state.screen.octagonCenterX + state.screen.octagonRadius * 1.55,
    y: state.screen.octagonCenterY - state.screen.octagonRadius * 0.2,
  };
  const nightBrightness = await sampleCanvasBrightness(page, nightPoint.x, nightPoint.y);
  const dayBrightness = await sampleCanvasBrightness(page, dayPoint.x, dayPoint.y);
  expect(nightBrightness).toBeLessThan(dayBrightness - 18);
  const nightEdgePoint = {
    x: state.screen.octagonCenterX - state.screen.octagonRadius * 1.04,
    y: state.screen.octagonCenterY + state.screen.octagonRadius * 0.16,
  };
  const nightFarPoint = {
    x: state.screen.octagonCenterX - state.screen.octagonRadius * 1.35,
    y: state.screen.octagonCenterY + state.screen.octagonRadius * 0.2,
  };
  const nightEdgeBrightness = await sampleCanvasBrightness(page, nightEdgePoint.x, nightEdgePoint.y);
  const nightFarBrightness = await sampleCanvasBrightness(page, nightFarPoint.x, nightFarPoint.y);
  expect(nightEdgeBrightness).toBeLessThanOrEqual(nightFarBrightness + 6);
  await setCloudscapeVisible(page, true);
  expect(state.tutorial.activeId).toBeNull();
  expect(state.tutorial.dimVisible).toBe(false);
  expect(state.tutorial.layout.buttons.map(button => button.label)).toEqual(['游戏目标', '商店', '进度', '黑夜/白天']);
  for (const button of state.tutorial.layout.buttons) {
    expect(button.x).toBeGreaterThan(state.screen.w - 170);
    expect(button.width).toBeGreaterThan(80);
  }
});

test('resizing the viewport updates canvas-scale layout and hit areas', async ({ page }) => {
  const before = await snapshot(page);
  await page.setViewportSize({ width: 1500, height: 900 });
  await expect.poll(async () => (await snapshot(page)).screen.viewportW).toBe(1500);
  await expect.poll(async () => (await snapshot(page)).screen.viewportH).toBe(900);
  const after = await snapshot(page);

  expect(after.screen.displayScale).toBeGreaterThan(1);
  expect(after.screen.w).toBe(1280);
  expect(after.screen.h).toBe(768);
  expect(after.screen.octagonCenterX).toBeCloseTo(640, 1);
  expect(after.screen.octagonCenterY).toBeCloseTo(444, 1);
  expect(after.screen.octagonRadius).toBeGreaterThanOrEqual(before.screen.octagonRadius);
  expect(after.rhythmBar.nodes[0].centerY).toBe(Math.max(44, after.screen.h - 42));

  const empty = emptySectorPoint(after);
  await mouseMoveWorld(page, empty.x, empty.y);
  await expect.poll(async () => (await snapshot(page)).boardTooltipVisible).toBe(true);
});

test('grid rounded clouds drift toward the upper left and shadows are not clipped to the island', async ({ page }) => {
  const before = await snapshot(page);
  expect(before.cloudscape.firstCloud).toBeTruthy();
  expect(before.cloudscape.cloudShape).toBe('grid-rounded-rectangles');
  await page.waitForTimeout(900);
  const after = await snapshot(page);
  expect(after.cloudscape.firstCloud).toBeTruthy();
  expect(after.cloudscape.firstCloud!.x).toBeLessThan(before.cloudscape.firstCloud!.x);
  expect(after.cloudscape.firstCloud!.y).toBeLessThan(before.cloudscape.firstCloud!.y);
  expect(after.cloudscape.visibleCloudCount).toBeGreaterThanOrEqual(3);
  expect(after.cloudscape.visibleShadowCount).toBeGreaterThanOrEqual(3);
  expect(after.cloudscape.shadowsClippedToIsland).toBe(false);
  expect(after.cloudscape.cloudShaderEnabled).toBe(true);
  expect(after.cloudscape.shadowShaderEnabled).toBe(true);
  expect(after.cloudscape.shaderShadowEnabled).toBe(true);
  expect(after.cloudscape.renderMode).toBe('shader-field');
  expect(after.cloudscape.maskComposition).toBe('max-union-subtract-cloud');
  expect(after.cloudscape.overlapPreservesColor).toBe(true);
  expect(after.cloudscape.smoothMotion).toBe(true);
  expect(after.cloudscape.edgeAntiAliased).toBe(true);
  expect(after.cloudscape.jaggedStepEdges).toBe(false);
  expect(after.cloudscape.allowedGridSizes).toEqual(['1x1', '2x1', '3x1', '4x2']);
  expect(after.cloudscape.shadowOnlyCount).toBeGreaterThanOrEqual(3);
  expect(after.cloudscape.cloudShadowLayerAboveDragons).toBe(true);
  expect(after.cloudscape.uniqueYBands).toBeGreaterThanOrEqual(6);
  expect(after.cloudscape.verticalSpread).toBeGreaterThan(0.85);
  expect(after.cloudscape.pointedEnds).toBe(false);
  expect(after.cloudscape.cloudOverlaySamples).not.toEqual(before.cloudscape.cloudOverlaySamples);
  expect(after.cloudscape.islandShadowSamples).not.toEqual(before.cloudscape.islandShadowSamples);
  const shadowSamples = after.cloudscape.shadowPixelSamples.filter(sample => sample.alpha > 0.16);
  expect(shadowSamples.length).toBeGreaterThan(0);
});

test('tutorial spotlight toggles goal text and keeps highlight brighter than the dimmed screen', async ({ page }) => {
  let state = await snapshot(page);
  await setCloudscapeVisible(page, false);
  const goal = tutorialButton(state, 'goal');
  const outsideBrightnessBefore = await sampleCanvasBrightness(page, 32, 32);
  const highlightBrightnessBefore = await sampleCanvasBrightness(page, state.screen.octagonCenterX, state.screen.octagonCenterY);

  await page.mouse.click(goal.centerX, goal.centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('goal');
  state = await snapshot(page);
  expect(state.tutorial.dimVisible).toBe(true);
  expect(state.tutorial.text).toBe('这是你的村子，从邪恶龙龙手中保护它');
  expect(state.tutorial.highlights[0]).toMatchObject({ shape: 'circle' });
  expect(state.tutorial.highlights[0].x + state.tutorial.highlights[0].width / 2).toBeCloseTo(state.screen.octagonCenterX, 1);
  expect(state.tutorial.highlights[0].y + state.tutorial.highlights[0].height / 2).toBeCloseTo(state.screen.octagonCenterY, 1);
  expect(state.tutorial.layout.textPanel.centerY).toBeLessThan(state.screen.octagonCenterY);

  await page.waitForTimeout(80);
  const highlightBrightness = await sampleCanvasBrightness(page, state.screen.octagonCenterX, state.screen.octagonCenterY);
  const outsideBrightness = await sampleCanvasBrightness(page, 32, 32);
  expect(outsideBrightness).toBeLessThanOrEqual(outsideBrightnessBefore + 1);
  expect(highlightBrightness).toBeGreaterThanOrEqual(outsideBrightness - 1);
  expect(Math.abs(highlightBrightness - highlightBrightnessBefore)).toBeLessThan(24);

  await page.mouse.click(32, 32);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBeNull();
  expect((await snapshot(page)).tutorial.dimVisible).toBe(false);
});

test('tutorial buttons show shop, progress, and day-night targets', async ({ page }) => {
  let state = await snapshot(page);
  await page.mouse.click(tutorialButton(state, 'shop').centerX, tutorialButton(state, 'shop').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('shop');
  state = await snapshot(page);
  expect(state.tutorial.text).toBe('在商店中购买工事及法术，在下方岛屿上布置使用。');
  expect(state.tutorial.highlights[0].shape).toBe('rect');
  expect(state.tutorial.highlights[0].x + state.tutorial.highlights[0].width / 2).toBeGreaterThan(100);
  expect(state.tutorial.layout.textPanel.y).toBeGreaterThan(state.tutorial.highlights[0].y);

  await page.mouse.click(32, 32);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBeNull();
  state = await snapshot(page);
  await page.mouse.click(tutorialButton(state, 'progress').centerX, tutorialButton(state, 'progress').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('progress');
  state = await snapshot(page);
  expect(state.tutorial.text).toBe('先撑过这一轮吧！可以用鼠标查看详情哦。');
  expect(state.tutorial.highlights[0].y).toBeGreaterThan(state.screen.h - 90);
  expect(state.tutorial.layout.textPanel.y).toBeLessThan(state.tutorial.highlights[0].y);

  state = await snapshot(page);
  await page.mouse.click(tutorialButton(state, 'dayNight').centerX, tutorialButton(state, 'dayNight').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('dayNight');
  state = await snapshot(page);
  expect(state.tutorial.text).toBe('推进回合时，黑夜/白天范围也会变化。\n在黑夜中的敌人将完全隐藏，请小心！');
  expect(state.tutorial.highlights).toHaveLength(0);
  expect(state.tutorial.layout.textPanel.centerX).toBeCloseTo(state.screen.w / 2, 1);
  expect(state.tutorial.layout.textPanel.centerY).toBeCloseTo(state.screen.h / 2, 1);
});

test('active tutorial closes on any left click and swallows that click', async ({ page }) => {
  const before = await snapshot(page);
  await page.mouse.click(tutorialButton(before, 'goal').centerX, tutorialButton(before, 'goal').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('goal');

  let state = await snapshot(page);
  const offerPos = slotCenter(state, 'base', 0);
  await page.mouse.click(offerPos.x, offerPos.y);
  state = await snapshot(page);
  expect(state.tutorial.activeId).toBeNull();
  expect(state.shop.selectedItem).toBeNull();

  await page.mouse.click(tutorialButton(state, 'goal').centerX, tutorialButton(state, 'goal').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('goal');
  state = await snapshot(page);
  await rightDragArc(page, state, 0, 35);
  state = await snapshot(page);
  expect(state.rotationAngle).toBe(before.rotationAngle);
  expect(state.turnRotationSteps).toBe(before.turnRotationSteps);

  await page.mouse.click(tutorialButton(state, 'goal').centerX, tutorialButton(state, 'goal').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBeNull();
  state = await snapshot(page);
  await page.mouse.click(tutorialButton(state, 'goal').centerX, tutorialButton(state, 'goal').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('goal');
  state = await snapshot(page);
  await holdToEndTurn(page, state);
  state = await snapshot(page);
  expect(state.turnNumber).toBe(before.turnNumber);
  expect(state.holdEndTurnProgress.visible).toBe(false);
  expect(state.tutorial.activeId).toBeNull();

  await page.mouse.click(tutorialButton(state, 'goal').centerX, tutorialButton(state, 'goal').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('goal');
  state = await snapshot(page);
  await page.mouse.click(tutorialButton(state, 'shop').centerX, tutorialButton(state, 'shop').centerY);
  await expect.poll(async () => (await snapshot(page)).tutorial.activeId).toBe('shop');
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

test('short left-button drag does not rotate the board or end the turn', async ({ page }) => {
  const before = await snapshot(page);
  const cx = before.screen.octagonCenterX;
  const cy = before.screen.octagonCenterY;
  const radius = before.screen.octagonRadius * 0.85;

  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  for (let deg = 15; deg <= 90; deg += 15) {
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

test('board tooltip uses rule sector numbering from the upper-right sector', async ({ page }) => {
  const state = await snapshot(page);
  const sector = ruleSectorPoint(state, 1);

  await page.mouse.move(sector.x, sector.y);

  await expect.poll(async () => (await snapshot(page)).boardTooltipLines).toContain('扇区: 1');
});

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
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  const distance = Math.abs(toDeg - fromDeg);
  const steps = Math.max(1, Math.ceil(distance / 12));
  for (let step = 1; step <= steps; step++) {
    const angle = fromDeg + (toDeg - fromDeg) * step / steps;
    const point = ringPoint(state, angle);
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up({ button: 'right' });
}

async function holdToEndTurn(page: import('@playwright/test').Page, state: Snapshot): Promise<void> {
  await page.mouse.move(state.screen.octagonCenterX, state.screen.octagonCenterY);
  await page.mouse.down();
  await page.waitForTimeout(710);
  await page.mouse.up();
}

test('rotation buttons are removed and right-button drag rotates by one step', async ({ page }) => {
  const before = await snapshot(page);
  expect(before.rotationControls.clockwise.width).toBe(0);
  expect(before.rotationControls.counterclockwise.width).toBe(0);

  await rightDragArc(page, before, 0, 35);

  const clockwise = await snapshot(page);
  expect(clockwise.rotationAngle).toBe((before.rotationAngle + 45) % 360);
  expect(clockwise.turnRotationSteps).toBe(before.turnRotationSteps + 1);

  await rightDragArc(page, clockwise, 35, 0);
  const back = await snapshot(page);
  expect(back.rotationAngle).toBe(before.rotationAngle);
  expect(back.turnRotationSteps).toBe(before.turnRotationSteps);
});

test('right-button drag keeps rotation angle normalized after many steps', async ({ page }) => {
  const before = await snapshot(page);
  let current = before;

  for (let index = 0; index < 10; index++) {
    await rightDragArc(page, current, 0, 35);
    current = await snapshot(page);
  }

  expect(current.rotationAngle).toBe((before.rotationAngle + 450) % 360);
  expect(current.rotationAngle).toBeGreaterThanOrEqual(0);
  expect(current.rotationAngle).toBeLessThan(360);
  expect(current.turnRotationSteps).toBe(before.turnRotationSteps + 10);

  for (let index = 0; index < 11; index++) {
    await rightDragArc(page, current, 35, 0);
    current = await snapshot(page);
  }

  expect(current.rotationAngle).toBe(((before.rotationAngle - 45) % 360 + 360) % 360);
  expect(current.rotationAngle).toBeGreaterThanOrEqual(0);
  expect(current.rotationAngle).toBeLessThan(360);
  expect(current.turnRotationSteps).toBe(before.turnRotationSteps - 1);
});

test('right-button drag does not rotate while a shop item is selected', async ({ page }) => {
  const affordable = await findAffordableRandomBlock(page);
  const offerPos = slotCenter(affordable.state, 'random', affordable.index);

  await page.mouse.click(offerPos.x, offerPos.y);
  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index, item: { id: affordable.item.id } });

  await rightDragArc(page, selected, 0, 35);
  const after = await snapshot(page);
  expect(after.rotationAngle).toBe(selected.rotationAngle);
  expect(after.turnRotationSteps).toBe(selected.turnRotationSteps);
  expect(after.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index, item: { id: affordable.item.id } });
});

test('turn hint is visible only when the player can end the turn directly', async ({ page }) => {
  const before = await snapshot(page);
  expect(before.turnHintVisible).toBe(true);
  expect(before.rotateHintVisible).toBe(true);
  expect(before.holdEndTurnProgress.visible).toBe(false);
  expect(before.endTurnHintText).toBe('按住鼠标左键以结束回合');
  expect(before.rotateHintText).toBe('按住鼠标右键以旋转岛屿');
  await page.waitForTimeout(520);
  const pulsed = await snapshot(page);
  expect(Math.abs(pulsed.rotateHintScale - before.rotateHintScale)).toBeGreaterThan(0.001);

  const affordable = await findAffordableRandomBlock(page);
  const offerPos = slotCenter(affordable.state, 'random', affordable.index);
  await page.mouse.click(offerPos.x, offerPos.y);

  const selected = await snapshot(page);
  expect(selected.shop.selectedItem).toMatchObject({ area: 'random', index: affordable.index });
  expect(selected.turnHintVisible).toBe(false);
  expect(selected.rotateHintVisible).toBe(true);
  expect(selected.rotateHintText).toBe('按住鼠标右键以旋转岛屿');
});

test('short click does not end the turn and long hold shows progress then confirms', async ({ page }) => {
  const before = await snapshot(page);
  await page.mouse.move(before.screen.octagonCenterX, before.screen.octagonCenterY);
  await page.mouse.down();
  await page.waitForTimeout(240);
  const holding = await snapshot(page);
  expect(holding.holdEndTurnProgress.visible).toBe(true);
  expect(holding.holdEndTurnProgress.text).toBe('结束回合');
  expect(holding.holdEndTurnProgress.progress).toBeGreaterThan(0.25);
  expect(holding.holdEndTurnProgress.progress).toBeLessThan(1);

  await page.mouse.move(before.screen.octagonCenterX + 42, before.screen.octagonCenterY + 18);
  const moved = await snapshot(page);
  expect(moved.holdEndTurnProgress.visible).toBe(true);
  expect(moved.holdEndTurnProgress.x).toBeGreaterThan(holding.holdEndTurnProgress.x);

  await page.mouse.up();
  const cancelled = await snapshot(page);
  expect(cancelled.turnNumber).toBe(before.turnNumber);
  expect(cancelled.holdEndTurnProgress.visible).toBe(false);

  await holdToEndTurn(page, cancelled);
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(before.turnNumber);
});

test('newly appeared dragons show an hourglass attack display for their first visible turn', async ({ page }) => {
  const before = await snapshot(page);
  await holdToEndTurn(page, before);

  await expect.poll(async () => (await snapshot(page)).dragons.length).toBeGreaterThan(0);
  const after = await snapshot(page);
  const pending = after.dragons.find(dragon => dragon.attackDisplay.pending);
  expect(pending).toBeTruthy();
  expect(pending!.attackDisplay.text).toBe('⏳');
  expect(pending!.readyToAttackTurn).toBeGreaterThan(after.turnNumber);
});

test('rhythm nodes are shown below the board and advance once per confirmed turn', async ({ page }) => {
  const before = await snapshot(page);
  expect(before.rhythm).toMatchObject({ round: 0, nodeIndex: 0, roundLength: 5 });
  expect(before.rhythm?.nodes).toHaveLength(5);
  expect(before.rhythm?.nodes[4].type).toBe('departure');
  expect(before.rhythmBar.nodes).toHaveLength(5);

  const turnUiY = Math.max(44, before.screen.h - 42);
  for (const node of before.rhythmBar.nodes) {
    expect(node.centerY).toBe(turnUiY);
  }

  await holdToEndTurn(page, before);
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(before.turnNumber);
  const after = await snapshot(page);
  expect(after.rhythm?.nodeIndex).toBe(1);
  expect(after.rhythm?.nodes[0].triggered).toBe(true);
});

test('event rhythm nodes show their concrete effect above the progress bar', async ({ page }) => {
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await page.evaluate(() => (window as any).__dragonSlayerGame.prepareRhythmEventTextTest());
  const before = await snapshot(page);
  expect(before.rhythm?.nodes[0].type).toBe('event');

  await holdToEndTurn(page, before);
  await expect.poll(async () => (await snapshot(page)).rhythmEventText).toMatch(/^事件：(获得 \d+ 金币|宝箱)/);
  const after = await snapshot(page);
  if (after.rhythmEventText.includes('获得')) {
    expect(after.rhythmEventText).toMatch(/^事件：获得 (1[0-9]|2[0-9]|3[0-9]|40) 金币$/);
  }

  expect(after.rhythmEventTextPosition).not.toBeNull();
  expect(after.rhythmEventTextPosition!.x).toBeCloseTo(before.rhythmBar.nodes[0].centerX, 1);
  expect(after.rhythmEventTextPosition!.y).toBeLessThan(before.rhythmBar.nodes[0].y);
});

test('dragon growth announcement appears after completing a rhythm round', async ({ page }) => {
  await page.evaluate(() => (window as any).__dragonSlayerGame.prepareDragonGrowthAnnouncementTest());
  const state = await snapshot(page);

  await holdToEndTurn(page, state);
  await expect.poll(async () => {
    const current = await snapshot(page);
    return current.phaseAnnouncementVisible ? current.phaseAnnouncementText : '';
  }).toBe('龙龙变得更强了');
  await expect.poll(async () => (await snapshot(page)).turnNumber).toBeGreaterThan(state.turnNumber);
  await expect.poll(async () => (await snapshot(page)).phaseAnnouncementVisible, { timeout: 3000 }).toBe(false);
});

test('rhythm node hover shows descriptions for node types', async ({ page }) => {
  await page.evaluate(() => (window as any).__dragonSlayerGame.prepareRhythmTooltipTest());
  const state = await snapshot(page);
  const normalIndex = state.rhythm?.nodes.findIndex(node => node.type === 'normal') ?? -1;
  const departureIndex = state.rhythm?.nodes.findIndex(node => node.type === 'departure') ?? -1;
  expect(normalIndex).toBeGreaterThanOrEqual(0);
  expect(departureIndex).toBeGreaterThanOrEqual(0);

  const normal = state.rhythmBar.nodes[normalIndex];
  await page.mouse.move(normal.centerX, normal.centerY - normal.radius * 0.5);
  await page.mouse.move(normal.centerX, normal.centerY);
  await expect.poll(async () => (await snapshot(page)).rhythmTooltipLines).toContain('无效果');

  const departure = state.rhythmBar.nodes[departureIndex];
  await page.mouse.move(departure.centerX, departure.centerY - departure.radius * 0.5);
  await page.mouse.move(departure.centerX, departure.centerY);
  await expect.poll(async () => (await snapshot(page)).rhythmTooltipLines).toContain('所有龙离开');

  await page.mouse.move(20, state.screen.h - 20);
  await expect.poll(async () => (await snapshot(page)).rhythmTooltipVisible).toBe(false);
});
