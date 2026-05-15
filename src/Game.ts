import { GameRenderer } from './rendering/GameRenderer';
import { OctagonRenderer } from './rendering/OctagonRenderer';
import { BlockRenderer } from './rendering/BlockRenderer';
import { DragonRenderer } from './rendering/DragonRenderer';
import { EffectRenderer } from './rendering/EffectRenderer';
import { AudioSystem } from './audio/AudioSystem';
import { HUD } from './ui/HUD';
import { DragonInfoPanel } from './ui/DragonInfoPanel';
import { PhaseAnnouncement } from './ui/PhaseAnnouncement';
import { GameOverScreen } from './ui/GameOverScreen';
import { ShopPanel } from './ui/ShopPanel';
import { RotationControls } from './ui/RotationControls';
import { RhythmBar } from './ui/RhythmBar';
import { TurnHint } from './ui/TurnHint';
import { HoverSectorInfo, InputManager } from './input/InputManager';
import { GameState, TurnState } from './core/GameState';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { BLOCK_TYPE_TABLE, ShopItem, blockTagLabel } from './config/blockTypes';
import { ShopSystem } from './systems/ShopSystem';
import { TooltipPanel, TooltipLine } from './ui/TooltipPanel';
import { getBlockAttack, getBlockEffectDescriptions } from './effects/BlockEffectRegistry';
import { createEffectContext } from './effects/EffectContext';
import { sectorIndexToRuleNumber } from './utils/SectorUtils';

declare global {
  interface ImportMeta {
    env: {
      MODE?: string;
    };
  }

  interface Window {
    __dragonSlayerGame?: {
      getSnapshot: () => unknown;
      prepareDragonGrowthAnnouncementTest?: () => void;
    };
  }
}

export class Game {
  private renderer: GameRenderer;
  private octagonRenderer!: OctagonRenderer;
  private blockRenderer!: BlockRenderer;
  private dragonRenderer!: DragonRenderer;
  private effectRenderer!: EffectRenderer;
  private hud!: HUD;
  private dragonInfoPanel!: DragonInfoPanel;
  private phaseAnnouncement!: PhaseAnnouncement;
  private gameOverScreen!: GameOverScreen;
  private shopPanel!: ShopPanel;
  private rotationControls!: RotationControls;
  private rhythmBar!: RhythmBar;
  private turnHint!: TurnHint;
  private boardTooltip!: TooltipPanel;
  private inputManager!: InputManager;
  private audioSystem!: AudioSystem;
  private state!: GameState;
  private turnManager!: TurnManager;
  private shopSystem = new ShopSystem();
  private sessionId = 0;
  private previousSectorStats: Map<number, { attack: number; hp: number }> = new Map();
  private previousDragonStats: Map<string, { attack: number; hp: number }> = new Map();

  constructor() { this.renderer = new GameRenderer(); }

  async init(): Promise<void> {
    await this.renderer.init();
    this.audioSystem = new AudioSystem();
    await this.audioSystem.init();
    this.octagonRenderer = new OctagonRenderer(this.renderer);
    this.blockRenderer = new BlockRenderer(this.renderer);
    this.dragonRenderer = new DragonRenderer(this.renderer);
    this.effectRenderer = new EffectRenderer(this.renderer);
    this.hud = new HUD(this.renderer);
    this.dragonInfoPanel = new DragonInfoPanel(this.renderer);
    this.phaseAnnouncement = new PhaseAnnouncement(this.renderer);
    this.gameOverScreen = new GameOverScreen(this.renderer);
    this.shopPanel = new ShopPanel(this.renderer);
    this.rotationControls = new RotationControls(this.renderer);
    this.rhythmBar = new RhythmBar(this.renderer);
    this.turnHint = new TurnHint(this.renderer);
    this.boardTooltip = new TooltipPanel(this.renderer, 'BoardTooltip');
    this.inputManager = new InputManager();
    this.inputManager.onHoverSectorChanged((info) => this.updateBoardTooltip(info));
    this.shopPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.shopPanel.onItemClicked = (event) => {
      this.audioSystem.playClick();
      this.inputManager.suppressCurrentGesture(event);
    };
    this.rotationControls.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.shopPanel.onSectionItemSelected = (section, index) => {
      const result = this.shopSystem.beginPlacementFromSection(section, index, this.state.board.villageGold);
      const finalResult = this.resolveImmediateShopSelection(result);
      this.state.addMessage(finalResult.message);
      this.drawShop();
      this.drawRotationControls();
      this.renderAll();
    };
    this.shopPanel.onRandomLockToggled = (index) => {
      const result = this.shopSystem.toggleRandomLock(index);
      this.state.addMessage(result.message);
      this.drawShop();
      this.renderAll();
    };
    this.shopPanel.onRefreshClicked = () => {
      const result = this.shopSystem.refreshRandom(this.state);
      this.state.addMessage(result.message);
      this.drawShop();
      this.renderAll();
    };
    this.rotationControls.onRotate = (delta) => this.rotateBoardByButton(delta);
    this.setupEvents();
    await this.dragonRenderer.preloadAssets();
    this.startGame();
    const testApi: NonNullable<Window['__dragonSlayerGame']> = {
      getSnapshot: () => this.getSnapshot(),
    };
    if (import.meta.env.MODE === 'test') {
      testApi.prepareDragonGrowthAnnouncementTest = () => this.prepareDragonGrowthAnnouncementTest();
    }
    window.__dragonSlayerGame = testApi;
    const animate = () => {
      this.effectRenderer.update();
      if (this.effectRenderer.hasActiveBoardAnimations()) this.renderAll();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private startGame(): void {
    this.sessionId++;
    this.state = new GameState();
    this.turnManager = new TurnManager(this.state);
    this.turnManager.onTurnStarted = () => this.shopSystem.beginNewTurn();
    this.shopSystem.reset();
    this.previousSectorStats.clear();
    this.previousDragonStats.clear();
    this.boardTooltip.hide();
    this.inputManager.resetGestureState();
    this.updateCanvasCursor();
    this.turnManager.initWorld();
    this.audioSystem.restartBgm();
    this.dragonRenderer.clear();
    this.effectRenderer.clear();
    this.gameOverScreen.hide();
    this.drawShop();
    this.drawRotationControls();
    this.renderAll();
    this.enableInput();
  }

  private setupEvents(): void {
    EventBus.on('phaseChanged', (payload: { message: string }) => {
      this.phaseAnnouncement.show(payload.message);
    });
    EventBus.on('dragonGrowthAdvanced', () => {
      this.phaseAnnouncement.show('龙龙变得更强了', { holdMs: 1000, fadeMs: 650 });
    });
    EventBus.on('gameOver', (payload: { reason: string }) => {
      this.state.gameOver = true;
      this.state.gameOverReason = payload.reason;
      this.boardTooltip.hide();
      this.updateCanvasCursor();
      this.inputManager.disable(this.renderer.app.canvas as HTMLCanvasElement);
      this.drawRotationControls();
      this.gameOverScreen.show(this.state.turnNumber, this.state.year, payload.reason, (event) => {
        this.startGame();
        this.inputManager.suppressCurrentGesture(event);
      });
    });
    EventBus.on('dragonAttackStarted', (payload: { dragonId: string; sectors: number[]; actionType: string }) => {
      if (payload.actionType === 'summon_imp') return;
      this.audioSystem.playDragonBreath();
      this.dragonRenderer.animateAttack(payload.dragonId);
      this.effectRenderer.triggerScreenFlash(0xff7744, 8);
    });
    EventBus.on('dragonBreathShockwave', (payload: { sectors: number[]; sourceSector?: number }) => {
      const sourceSector = payload.sourceSector ?? payload.sectors[Math.floor(payload.sectors.length / 2)] ?? 0;
      this.effectRenderer.showBreathShockwave(payload.sectors, sourceSector, this.state.rotationAngle);
    });
    EventBus.on('breathSectorHit', (payload: { sector: number; damage: number; targetType: 'block' | 'village'; mode?: 'damage' | 'increase' }) => {
      this.showBreathHitFeedback([payload]);
    });
    EventBus.on('breathSectorHitWave', (payload: { hits: { sector: number; damage: number; targetType: 'block' | 'village'; mode?: 'damage' | 'increase' }[] }) => {
      this.showBreathHitFeedback(payload.hits);
    });
    EventBus.on('dragonDamaged', (payload: { dragonId: string; damage: number }) => {
      this.audioSystem.playHit();
      this.dragonRenderer.animateHit(payload.dragonId);
      const pos = this.dragonRenderer.getDragonScreenPosition(payload.dragonId);
      if (pos) this.effectRenderer.showFloatingTextAt(pos.x, pos.y - 20, `-${payload.damage}`, 0xfff0aa);
    });
    EventBus.on('blockDamaged', () => {
      this.audioSystem.playHit();
    });
    EventBus.on('villageDamaged', () => {
      this.audioSystem.playHit();
    });
    EventBus.on('dragonDeparting', (payload: { dragonId: string; name: string }) => {
      const pos = this.dragonRenderer.getDragonScreenPosition(payload.dragonId);
      if (pos) this.effectRenderer.showFloatingTextAt(pos.x, pos.y - 16, `${payload.name}离开`, 0xd8fbff);
      this.dragonRenderer.animateDepart(payload.dragonId);
    });
    EventBus.on('blockDestroyed', (payload: { sector: number }) => {
      this.effectRenderer.startShrink(payload.sector);
      this.effectRenderer.showFloatingText(payload.sector, 'X', 0xff6666);
    });
    EventBus.on('blockCreated', (payload: { sector: number }) => {
      this.effectRenderer.startGrow(payload.sector);
    });
    EventBus.on('blockPlaced', () => {
      this.audioSystem.playBuild();
    });
    EventBus.on('rhythmNodeTriggered', (payload: { index: number }) => {
      this.effectRenderer.startRhythmBounce(payload.index);
      this.renderAll();
    });
  }

  private showBreathHitFeedback(hits: { sector: number; damage: number; targetType: 'block' | 'village'; mode?: 'damage' | 'increase' }[]): void {
    for (const payload of hits) {
      const color = payload.mode === 'increase' ? 0x88ff88 : 0xfff0aa;
      const prefix = payload.mode === 'increase' ? '+' : '-';
      this.effectRenderer.flashSector(payload.sector, this.state.rotationAngle);
      this.effectRenderer.showFloatingText(payload.sector, `${prefix}${payload.damage}`, color);
      this.effectRenderer.startPowerBounce(payload.targetType === 'village' ? 'village' : payload.sector);
    }
    this.renderAll();
  }

  private enableInput(): void {
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    this.inputManager.setRotationAngle(this.state.rotationAngle);
    this.inputManager.enable(canvas, this.renderer.octagonCenterX, this.renderer.octagonCenterY, this.renderer.octagonRadius);
    this.inputManager.onConfirm(() => {
      if (this.state.gameOver) return;

      if (this.shopSystem.selectedItem()) {
        if (this.inputManager.isCurrentPointerOutsideOctagon()) {
          this.shopSystem.cancelPlacement();
          this.state.addMessage('已取消购买');
          this.drawShop();
          this.drawRotationControls();
          this.renderAll();
          return;
        }
        const sector = this.inputManager.getCurrentSector();
        const result = this.shopSystem.tryPlaceSelectedItem(this.state, sector);
        this.state.addMessage(result.message);
        this.drawShop();
        this.drawRotationControls();
        this.renderAll();
        return;
      }

      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      this.inputManager.disable(canvas);
      void this.finishConfirmedTurn();
    });
  }

  private async finishConfirmedTurn(): Promise<void> {
    const currentSession = this.sessionId;
    await this.turnManager.executeTurn();
    if (currentSession !== this.sessionId) return;
    this.drawShop();
    this.drawRotationControls();
    this.renderAll();
    if (!this.state.gameOver) {
      this.enableInput();
      this.renderAll();
    }
  }

  private renderAll(): void {
    const effectContext = createEffectContext(this.state);
    this.updateStatChangeAnimations(effectContext);
    this.octagonRenderer.render(this.state.board, this.state.hero.heroSector, this.state.rotationAngle, this.state.nightStart, this.state.nightLength, this.effectRenderer.powerAnims.get('village'));
    this.blockRenderer.render(this.state.board, this.effectRenderer.blockAnims, this.state.rotationAngle, this.effectRenderer.powerAnims, effectContext);
    this.dragonRenderer.render(this.state.aliveDragons, this.state.rotationAngle, this.state.nightStart, this.state.nightLength, this.effectRenderer.powerAnims);
    this.hud.update(this.state.board.villageHp, this.state.board.villageGold, this.state.turnNumber, this.state.year, 'calm' as any, this.state.messages, this.state.rotationAngle);
    this.rhythmBar.draw(this.state.rhythm, this.effectRenderer.powerAnims);
    this.turnHint.draw(this.shouldShowTurnHint());
  }

  private updateStatChangeAnimations(effectContext: ReturnType<typeof createEffectContext>): void {
    const nextSectorStats = new Map<number, { attack: number; hp: number }>();
    for (let sector = 0; sector < this.state.board.sectors.length; sector++) {
      const block = this.state.board.getSector(sector);
      if (!block) continue;
      const attack = getBlockAttack(block, effectContext, sector);
      const hp = block.hp;
      const previous = this.previousSectorStats.get(sector);
      if (previous) {
        if (previous.attack !== attack) this.effectRenderer.startStatBounce(`sector:${sector}:attack`);
        if (previous.hp !== hp) this.effectRenderer.startStatBounce(`sector:${sector}:hp`);
      }
      nextSectorStats.set(sector, { attack, hp });
    }
    this.previousSectorStats = nextSectorStats;

    const nextDragonStats = new Map<string, { attack: number; hp: number }>();
    for (const dragon of this.state.aliveDragons) {
      const previous = this.previousDragonStats.get(dragon.id);
      if (previous) {
        if (previous.attack !== dragon.attack) this.effectRenderer.startStatBounce(`dragon:${dragon.id}:attack`);
        if (previous.hp !== dragon.hp) this.effectRenderer.startStatBounce(`dragon:${dragon.id}:hp`);
      }
      nextDragonStats.set(dragon.id, { attack: dragon.attack, hp: dragon.hp });
    }
    this.previousDragonStats = nextDragonStats;
  }

  private drawShop(): void {
    this.shopPanel.draw(this.shopSystem.state, this.shopSystem.selectedItem(), false, this.state.board.villageGold);
  }

  private drawRotationControls(): void {
    const disabled = this.state.gameOver
      || this.state.turnState !== TurnState.WAITING_FOR_INPUT
      || Boolean(this.shopSystem.selectedItem());
    this.rotationControls.draw(disabled);
  }

  private shouldShowTurnHint(): boolean {
    return !this.state.gameOver
      && this.state.turnState === TurnState.WAITING_FOR_INPUT
      && !this.shopSystem.selectedItem();
  }

  private rotateBoardByButton(delta: number): void {
    if (this.state.gameOver) return;
    if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
    if (this.shopSystem.selectedItem()) return;
    this.state.rotationAngle = ((this.state.rotationAngle + delta) % 360 + 360) % 360;
    this.inputManager.setRotationAngle(this.state.rotationAngle);
    this.state.turnRotationSteps += delta / 45;
    this.renderAll();
  }

  private updateCanvasCursor(): void {
    if (!this.renderer.app) return;
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = '';
  }

  private updateBoardTooltip(info: HoverSectorInfo): void {
    this.updateCanvasCursor();
    if (info.outsideOctagon || info.sector === null) {
      this.boardTooltip.hide();
      return;
    }

    this.boardTooltip.show(this.describeSector(info.sector), info.x, info.y);
  }

  private describeSector(sector: number): TooltipLine[] {
    const block = this.state.board.getSector(sector);
    if (!block) {
      return [
        { text: '空地' },
        { text: '可在行动模式放置建筑', color: 0xb7f7a2, bold: true },
        { text: `扇区: ${sectorIndexToRuleNumber(sector)}` },
      ];
    }

    const def = BLOCK_TYPE_TABLE[block.type];
    const ctx = createEffectContext(this.state);
    const lines: TooltipLine[] = [
      { text: def.label },
      { text: `HP: ${block.hp}  攻击: ${getBlockAttack(block, ctx, sector)}`, color: 0xb7f7a2, bold: true },
      { text: `扇区: ${sectorIndexToRuleNumber(sector)}` },
    ];
    if (block.tags.length > 0) {
      lines.push({ text: `标签: ${block.tags.map(blockTagLabel).join('、')}` });
    }
    for (const description of getBlockEffectDescriptions(block.type)) {
      lines.push({ text: `- ${description}` });
    }
    return lines.slice(0, 8);
  }

  private resolveImmediateShopSelection(result: { ok: boolean; message: string }): { ok: boolean; message: string } {
    const selected = this.shopSystem.selectedItem();
    if (!result.ok || !selected || selected.item.kind !== 'spell' || selected.item.spellType !== 'bulwark') return result;
    return this.shopSystem.tryPlaceSelectedItem(this.state, null);
  }

  private serializeShopItem(item: ShopItem | null): unknown {
    if (!item) return null;
    return item.kind === 'block'
      ? { id: item.id, kind: item.kind, type: item.blockType, label: item.label, cost: item.cost, hp: item.hp, attack: item.attack, tags: item.tags }
      : { id: item.id, kind: item.kind, spellType: item.spellType, label: item.label, cost: item.cost, tags: item.tags };
  }

  private getSnapshot(): unknown {
    return {
      turnNumber: this.state.turnNumber,
      villageHp: this.state.board.villageHp,
      villageGold: this.state.board.villageGold,
      board: this.state.board.sectors.map(block => block ? { type: block.type, hp: block.hp, attack: block.attack, tags: block.tags } : null),
      dragons: this.state.aliveDragons.map(dragon => ({
        id: dragon.id,
        templateId: dragon.templateId,
        name: dragon.name,
        personality: dragon.personality,
        hp: dragon.hp,
        maxHp: dragon.maxHp,
        attack: dragon.attack,
        hasTakenDamage: dragon.hasTakenDamage,
        assetName: this.dragonRenderer.getDragonAssetName(dragon),
        screen: this.dragonRenderer.getDragonScreenPosition(dragon.id),
      })),
      shop: {
        base: this.shopSystem.state.base.map(item => this.serializeShopItem(item)),
        random: this.shopSystem.state.random.map(slot => ({ item: this.serializeShopItem(slot.item), locked: slot.locked })),
        refreshCost: this.shopSystem.state.refreshCost,
        selectedItem: this.shopSystem.selectedItem() ? {
          area: this.shopSystem.selectedItem()!.area,
          index: this.shopSystem.selectedItem()!.index,
          item: this.serializeShopItem(this.shopSystem.selectedItem()!.item),
        } : null,
        layout: this.shopPanel.getLayoutSnapshot(),
      },
      screen: {
        w: this.renderer.screenW,
        h: this.renderer.screenH,
        octagonCenterX: this.renderer.octagonCenterX,
        octagonCenterY: this.renderer.octagonCenterY,
        octagonRadius: this.renderer.octagonRadius,
      },
      gameOver: this.state.gameOver,
      viewMode: false,
      rotationAngle: this.state.rotationAngle,
      turnRotationSteps: this.state.turnRotationSteps,
      rotationControls: this.rotationControls.getLayoutSnapshot(),
      rhythm: this.state.rhythm ? {
        round: this.state.rhythm.round,
        nodeIndex: this.state.rhythm.nodeIndex,
        roundLength: this.state.rhythm.roundLength,
        lastTriggeredIndex: this.state.rhythm.lastTriggeredIndex,
        nodes: this.state.rhythm.nodes.map(node => ({ type: node.type, triggered: node.triggered, eventKind: node.eventKind })),
      } : null,
      rhythmBar: this.rhythmBar.getLayoutSnapshot(),
      rhythmTooltipVisible: this.rhythmBar.isTooltipVisible(),
      rhythmTooltipLines: this.rhythmBar.getTooltipLines(),
      turnHintVisible: this.turnHint.isVisible(),
      phaseAnnouncementVisible: this.phaseAnnouncement.isVisible(),
      phaseAnnouncementText: this.phaseAnnouncement.getText(),
      dragonTooltipVisible: this.dragonRenderer.isTooltipVisible(),
      dragonAssetNames: this.dragonRenderer.getTemplateAssetNames(),
      shopTooltipVisible: this.shopPanel.isTooltipVisible(),
      shopTooltipLines: this.shopPanel.getTooltipLines(),
      shopTooltipLayout: this.shopPanel.getTooltipLayout(),
      boardTooltipVisible: this.boardTooltip.isVisible(),
      boardTooltipLines: this.boardTooltip.getLines(),
    };
  }

  private prepareDragonGrowthAnnouncementTest(): void {
    this.state.board.villageHp = 999;
    this.state.dragons = [];
    this.state.gameOver = false;
    this.state.gameOverReason = '';
    this.state.turnState = TurnState.WAITING_FOR_INPUT;
    this.state.rhythm = {
      round: 0,
      nodeIndex: 0,
      roundLength: 1,
      lastTriggeredIndex: null,
      nodes: [{ id: 'test-growth', type: 'normal', triggered: false }],
    };
    this.shopSystem.cancelPlacement();
    this.drawShop();
    this.drawRotationControls();
    this.renderAll();
    this.enableInput();
  }
}
