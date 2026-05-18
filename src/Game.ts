import { GameRenderer } from './rendering/GameRenderer';
import { OctagonRenderer } from './rendering/OctagonRenderer';
import { BlockRenderer } from './rendering/BlockRenderer';
import { DragonRenderer } from './rendering/DragonRenderer';
import { EffectRenderer } from './rendering/EffectRenderer';
import { NightOverlayRenderer } from './rendering/NightOverlayRenderer';
import { AudioSystem } from './audio/AudioSystem';
import { HUD } from './ui/HUD';
import { DragonInfoPanel } from './ui/DragonInfoPanel';
import { PhaseAnnouncement } from './ui/PhaseAnnouncement';
import { GameOverScreen } from './ui/GameOverScreen';
import { ShopPanel } from './ui/ShopPanel';
import { DebugShopMode, DebugShopPanel } from './ui/DebugShopPanel';
import { nextSwatchColor, PostProcessDebugPanel } from './ui/PostProcessDebugPanel';
import { RhythmBar } from './ui/RhythmBar';
import { TurnHint } from './ui/TurnHint';
import { RelicPanel } from './ui/RelicPanel';
import { RectLayout, TutorialHighlight, TutorialId, TutorialPanel, TutorialTarget } from './ui/TutorialPanel';
import { ReplayPanel } from './ui/ReplayPanel';
import { HoverSectorInfo, InputManager } from './input/InputManager';
import { GameState, TurnState } from './core/GameState';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { BLOCK_TYPE_TABLE, BlockType, RANDOM_SHOP_POOL, RELIC_DEFS, SHOP_ITEM_POOL, ShopItem, SpellShopItem, SpellType, cloneShopItem, RelicDef, blockTagLabel } from './config/blockTypes';
import { ShopSystem } from './systems/ShopSystem';
import { TooltipPanel, TooltipLine } from './ui/TooltipPanel';
import { createGoldMine, createPlacedBlock, getBlockAttack, getBlockEffectDescriptions } from './effects/BlockEffectRegistry';
import { createEffectContext } from './effects/EffectContext';
import { sectorIndexToRuleNumber } from './utils/SectorUtils';
import { dragonEdgeToBoardSector } from './utils/SectorUtils';
import { CombatPreviewSystem } from './systems/CombatPreviewSystem';
import { CombatPreview } from './systems/CombatSimulationTypes';
import { RelicSystem } from './systems/RelicSystem';
import { CombatRandomPlan } from './systems/CombatRandomPlan';
import { PostProcessConfig } from './rendering/ScreenPostProcess';
import { createSeededRandom, RandomSource } from './utils/random';
import { GameRecorder } from './telemetry/GameRecorder';
import { currentDataHash, GAME_VERSION } from './telemetry/GameVersion';
import { CompactReplayV1 } from './telemetry/ReplaySchema';
import { SupabaseTelemetryClient } from './telemetry/SupabaseTelemetryClient';
import { PlaybackFrame, runCompactReplay, validateReplayCompatibility } from './simulation/ReplayRunner';

declare global {
  interface ImportMeta {
    env: {
      MODE?: string;
    };
  }

  interface Window {
    __dragonSlayerGame?: {
      getSnapshot: () => unknown;
      exportReplay?: () => CompactReplayV1;
      loadReplayFromObject?: (replay: unknown) => Promise<{ ok: boolean; error?: string }>;
      loadReplayFromFile?: () => Promise<{ ok: boolean; error?: string }>;
      replayNext?: () => void;
      replayPrevious?: () => void;
      replayJumpToDeath?: () => void;
      exitReplay?: () => void;
      prepareDragonGrowthAnnouncementTest?: () => void;
      prepareRhythmEventTextTest?: () => void;
      prepareRhythmTooltipTest?: () => void;
      prepareMageMissileTooltipTest?: () => void;
      prepareTemporaryShopLayoutTest?: () => void;
      prepareOwnedRelicTooltipTest?: () => void;
      setCloudscapeVisibleForTest?: (visible: boolean) => void;
      resetPostProcessConfigForTest?: () => void;
    };
  }
}

export class Game {
  private renderer: GameRenderer;
  private octagonRenderer!: OctagonRenderer;
  private blockRenderer!: BlockRenderer;
  private dragonRenderer!: DragonRenderer;
  private nightOverlayRenderer!: NightOverlayRenderer;
  private effectRenderer!: EffectRenderer;
  private hud!: HUD;
  private dragonInfoPanel!: DragonInfoPanel;
  private phaseAnnouncement!: PhaseAnnouncement;
  private gameOverScreen!: GameOverScreen;
  private shopPanel!: ShopPanel;
  private debugShopPanel!: DebugShopPanel;
  private postProcessDebugPanel!: PostProcessDebugPanel;
  private rhythmBar!: RhythmBar;
  private turnHint!: TurnHint;
  private relicPanel!: RelicPanel;
  private tutorialPanel!: TutorialPanel;
  private replayPanel!: ReplayPanel;
  private boardTooltip!: TooltipPanel;
  private inputManager!: InputManager;
  private audioSystem!: AudioSystem;
  private state!: GameState;
  private turnManager!: TurnManager;
  private gameSeed = '';
  private random: RandomSource = createSeededRandom('boot');
  private shopSystem = new ShopSystem(this.random);
  private recorder = new GameRecorder();
  private telemetryClient = new SupabaseTelemetryClient();
  private replayFrames: PlaybackFrame[] = [];
  private replayFrameIndex = 0;
  private replayStatus = '';
  private replayMode = false;
  private debugShopVisible = false;
  private debugShopMode: DebugShopMode = 'items';
  private debugFreePurchase = false;
  private debugEnabled = false;
  private postProcessSaveStatus = '已加载';
  private postProcessSaveTimer: number | null = null;
  private boundDebugKeyDown = (event: KeyboardEvent) => this.handleDebugKeyDown(event);
  private combatPreviewSystem = new CombatPreviewSystem();
  private combatPreview: CombatPreview | null = null;
  private combatRandomPlan: CombatRandomPlan | null = null;
  private previewRequestId = 0;
  private sessionId = 0;
  private previousSectorStats: Map<number, { attack: number; hp: number }> = new Map();
  private previousDragonStats: Map<string, { attack: number; hp: number }> = new Map();
  private lastRhythmEventText = '';
  private lastRhythmEventTextPosition: { x: number; y: number } | null = null;
  private activeTutorialId: TutorialId | null = null;

  constructor() { this.renderer = new GameRenderer(); }

  async init(): Promise<void> {
    await this.renderer.init();
    this.renderer.onResized = () => this.handleRendererResized();
    this.audioSystem = new AudioSystem();
    await this.audioSystem.init();
    this.octagonRenderer = new OctagonRenderer(this.renderer);
    this.nightOverlayRenderer = new NightOverlayRenderer(this.renderer);
    await this.nightOverlayRenderer.preload();
    this.blockRenderer = new BlockRenderer(this.renderer);
    this.dragonRenderer = new DragonRenderer(this.renderer);
    this.effectRenderer = new EffectRenderer(this.renderer);
    this.hud = new HUD(this.renderer);
    this.dragonInfoPanel = new DragonInfoPanel(this.renderer);
    this.phaseAnnouncement = new PhaseAnnouncement(this.renderer);
    this.gameOverScreen = new GameOverScreen(this.renderer);
    this.shopPanel = new ShopPanel(this.renderer);
    this.debugShopPanel = new DebugShopPanel(this.renderer);
    this.postProcessDebugPanel = new PostProcessDebugPanel(this.renderer);
    this.rhythmBar = new RhythmBar(this.renderer);
    this.turnHint = new TurnHint(this.renderer);
    this.relicPanel = new RelicPanel(this.renderer);
    this.tutorialPanel = new TutorialPanel(this.renderer);
    this.replayPanel = new ReplayPanel(this.renderer);
    this.boardTooltip = new TooltipPanel(this.renderer, 'BoardTooltip');
    this.inputManager = new InputManager();
    this.inputManager.onHoverSectorChanged((info) => this.updateBoardTooltip(info));
    this.inputManager.setHoldConfirmEnabledProvider(() => this.shouldShowTurnHint());
    this.inputManager.onHoldConfirmProgress((progress) => this.turnHint.drawHoldProgress(progress));
    this.shopPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.shopPanel.onItemClicked = (event) => {
      this.audioSystem.playClick();
      this.inputManager.suppressCurrentGesture(event);
    };
    this.inputManager.onRotate((delta) => this.rotateBoard(delta));
    this.shopPanel.onSectionItemSelected = (section, index) => {
      if (this.isTutorialActive()) return;
      const result = this.shopSystem.beginPlacementFromSection(section, index, this.state.board.villageGold);
      const finalResult = this.resolveImmediateShopSelection(result);
      this.recordShopSelection(section, index, result, finalResult);
      this.state.addMessage(finalResult.message);
      if (finalResult.ok) this.invalidateCombatRandomPlan();
      this.drawShop();
      void this.renderAll();
    };
    this.shopPanel.onRandomLockToggled = (index) => {
      if (this.isTutorialActive()) return;
      const result = this.shopSystem.toggleRandomLock(index);
      this.recorder.recordAction(this.state, 'lock', { index }, { ok: result.ok, message: result.message });
      this.state.addMessage(result.message);
      this.drawShop();
      void this.renderAll();
    };
    this.shopPanel.onRefreshClicked = () => {
      if (this.isTutorialActive()) return;
      const result = this.shopSystem.refreshRandom(this.state);
      this.recorder.recordAction(this.state, 'refresh', {}, { ok: result.ok, message: result.message });
      this.state.addMessage(result.message);
      if (result.ok) this.invalidateCombatRandomPlan();
      this.drawShop();
      void this.renderAll();
    };
    this.debugEnabled = import.meta.env.MODE !== 'production';
    this.debugShopPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.debugShopPanel.onModeChanged = (mode, event) => {
      this.inputManager.suppressCurrentGesture(event);
      this.debugShopMode = mode;
      this.debugShopPanel.resetScroll();
      this.drawDebugShop();
    };
    this.debugShopPanel.onFreeToggled = (event) => {
      this.inputManager.suppressCurrentGesture(event);
      this.debugFreePurchase = !this.debugFreePurchase;
      this.drawDebugShop();
    };
    this.debugShopPanel.onItemSelected = (itemId, event) => this.handleDebugItemSelected(itemId, event);
    this.debugShopPanel.onRelicSelected = (relicId, event) => this.handleDebugRelicSelected(relicId, event);
    this.postProcessDebugPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.postProcessDebugPanel.onControl = (id, event) => this.handlePostProcessControl(id, event);
    this.tutorialPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.tutorialPanel.onBackdropClicked = (event) => this.closeTutorial(event);
    this.tutorialPanel.onTutorialClicked = (id, event) => this.handleTutorialClicked(id, event);
    this.replayPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.replayPanel.onControl = (id, event) => this.handleReplayControl(id, event);
    this.relicPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.relicPanel.onRelicSelected = (id, event) => {
      this.audioSystem.playClick();
      this.inputManager.suppressCurrentGesture(event);
      if (this.isTutorialActive()) return;
      RelicSystem.selectPendingChoice(this.state, id);
      this.invalidateCombatRandomPlan();
      void this.renderAll();
    };
    this.relicPanel.onConfirm = (event) => {
      this.audioSystem.playClick();
      this.inputManager.suppressCurrentGesture(event);
      if (this.isTutorialActive()) return;
      const relicId = this.state.relics.selectedChoiceId;
      this.turnManager.completeRelicSelection();
      if (relicId) {
        this.recorder.recordAction(this.state, 'choose_relic', { relicId }, { ok: true });
        this.recorder.recordTurnBoundary(this.state, this.shopSystem, false);
      }
      this.invalidateCombatRandomPlan();
      this.drawShop();
      void this.renderAll();
      if (!this.state.gameOver) this.enableInput();
    };
    this.setupEvents();
    await this.dragonRenderer.preloadAssets();
    this.dragonRenderer.onDragonPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.dragonRenderer.onDragonClicked = (dragonId, event) => this.handleDragonClicked(dragonId, event);
    this.startGame();
    const testApi: NonNullable<Window['__dragonSlayerGame']> = {
      getSnapshot: () => this.getSnapshot(),
    };
    if (import.meta.env.MODE === 'test') {
      testApi.prepareDragonGrowthAnnouncementTest = () => this.prepareDragonGrowthAnnouncementTest();
      testApi.prepareRhythmEventTextTest = () => this.prepareRhythmEventTextTest();
      testApi.prepareRhythmTooltipTest = () => this.prepareRhythmTooltipTest();
      testApi.prepareMageMissileTooltipTest = () => this.prepareMageMissileTooltipTest();
      testApi.prepareTemporaryShopLayoutTest = () => this.prepareTemporaryShopLayoutTest();
      testApi.prepareOwnedRelicTooltipTest = () => this.prepareOwnedRelicTooltipTest();
      testApi.setCloudscapeVisibleForTest = (visible: boolean) => this.renderer.setCloudscapeVisible(visible);
      testApi.resetPostProcessConfigForTest = () => this.resetPostProcessConfigForTest();
    }
    testApi.exportReplay = () => this.exportReplay();
    testApi.loadReplayFromObject = (replay: unknown) => this.loadReplay(replay);
    testApi.loadReplayFromFile = () => this.loadReplayFromFile();
    testApi.replayNext = () => this.showReplayFrame(this.replayFrameIndex + 1);
    testApi.replayPrevious = () => this.showReplayFrame(this.replayFrameIndex - 1);
    testApi.replayJumpToDeath = () => this.showReplayFrame(this.replayFrames.length - 1);
    testApi.exitReplay = () => this.startGame();
    window.__dragonSlayerGame = testApi;
    if (this.debugEnabled) window.addEventListener('keydown', this.boundDebugKeyDown);
    const animate = () => {
      this.effectRenderer.update();
      if (this.effectRenderer.hasActiveBoardAnimations()) void this.renderAll();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private startGame(): void {
    this.sessionId++;
    this.replayMode = false;
    this.replayFrames = [];
    this.replayFrameIndex = 0;
    this.replayStatus = '';
    this.gameSeed = createGameSeed();
    this.random = createSeededRandom(this.gameSeed);
    this.state = new GameState();
    this.shopSystem = new ShopSystem(this.random);
    this.turnManager = new TurnManager(this.state, this.random);
    this.turnManager.onTurnStarted = () => this.shopSystem.applyStartOfPlayerTurnEffects(this.state);
    this.turnManager.onRelicSelectionStarted = () => {
      this.shopSystem.cancelPlacement();
      this.boardTooltip.hide();
    };
    this.activeTutorialId = null;
    this.previousSectorStats.clear();
    this.previousDragonStats.clear();
    this.combatPreview = null;
    this.combatRandomPlan = null;
    this.previewRequestId++;
    this.boardTooltip.hide();
    this.inputManager.resetGestureState();
    this.updateCanvasCursor();
    this.turnManager.initWorld();
    this.shopSystem.reset();
    this.recorder.start(this.gameSeed, this.state, this.shopSystem);
    this.audioSystem.restartBgm();
    this.dragonRenderer.clear();
    this.effectRenderer.clear();
    this.gameOverScreen.hide();
    this.drawShop();
    this.drawDebugShop();
    this.drawTutorialPanel();
    this.drawReplayPanel();
    void this.renderAll();
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
      void this.uploadReplayOnGameOver();
      this.boardTooltip.hide();
      this.activeTutorialId = null;
      this.drawTutorialPanel();
      this.updateCanvasCursor();
      this.inputManager.disable(this.renderer.app.canvas as HTMLCanvasElement);
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
    EventBus.on('rhythmNodeTriggered', (payload: { index: number; effectText?: string; node?: { eventKind?: string } }) => {
      this.effectRenderer.startRhythmBounce(payload.index);
      if (payload.effectText) this.showRhythmEventText(payload.index, payload.effectText, payload.node?.eventKind);
      void this.renderAll();
    });
  }

  private showRhythmEventText(index: number, text: string, eventKind?: string): void {
    const node = this.rhythmBar.getLayoutSnapshot().nodes[index];
    if (!node) return;
    const color = eventKind === 'gold' ? 0xffe08a : 0xc6d7ff;
    const x = node.centerX;
    const y = node.y - 20;
    this.lastRhythmEventText = text;
    this.lastRhythmEventTextPosition = { x, y };
    this.effectRenderer.showFloatingTextAt(x, y, text, color);
  }

  private showBreathHitFeedback(hits: { sector: number; damage: number; targetType: 'block' | 'village'; mode?: 'damage' | 'increase' }[]): void {
    for (const payload of hits) {
      const color = payload.mode === 'increase' ? 0x88ff88 : 0xfff0aa;
      const prefix = payload.mode === 'increase' ? '+' : '-';
      this.effectRenderer.flashSector(payload.sector, this.state.rotationAngle);
      this.effectRenderer.showFloatingText(payload.sector, `${prefix}${payload.damage}`, color);
      this.effectRenderer.startPowerBounce(payload.targetType === 'village' ? 'village' : payload.sector);
    }
    void this.renderAll();
  }

  private enableInput(): void {
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    if (this.replayMode) {
      this.inputManager.disable(canvas);
      return;
    }
    this.inputManager.setRotationAngle(this.state.rotationAngle);
    this.inputManager.enable(
      canvas,
      this.renderer.octagonCenterX,
      this.renderer.octagonCenterY,
      this.renderer.octagonRadius,
      (clientX, clientY) => this.renderer.clientToWorld(clientX, clientY),
    );
    this.inputManager.onConfirm(() => {
      if (this.isTutorialActive()) return;
      if (this.state.gameOver) return;
      if (this.state.turnState === TurnState.RELIC_SELECTION) return;

      if (this.shopSystem.selectedItem()) {
        if (this.inputManager.isCurrentPointerOutsideOctagon()) {
          this.shopSystem.cancelPlacement();
          this.state.addMessage('已取消购买');
          this.drawShop();
          void this.renderAll();
          return;
        }
        const sector = this.inputManager.getCurrentSector();
        const selected = this.shopSystem.selectedItem();
        const result = this.shopSystem.tryPlaceSelectedItem(this.state, sector);
        if (selected) {
          this.recorder.recordAction(this.state, shopActionTypeForItem(selected.item), {
            section: selected.area,
            index: selected.index,
            sector,
            targetIntent: 'block',
          }, { ok: result.ok, message: result.message });
        }
        this.showPlacementFeedback(result);
        this.state.addMessage(result.message);
        if (result.ok) this.invalidateCombatRandomPlan();
        this.drawShop();
        void this.renderAll();
        return;
      }

      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      this.inputManager.disable(canvas);
      void this.finishConfirmedTurn();
    });
  }

  private handleRendererResized(): void {
    if (!this.state) return;
    this.hideTutorialBlockedUi();
    this.turnHint.drawHoldProgress({ visible: false, progress: 0, x: 0, y: 0, text: '结束回合' });
    this.inputManager.resetGestureState();
    this.inputManager.setRotationAngle(this.state.rotationAngle);
    if (!this.state.gameOver) this.enableInput();
    this.invalidateCombatRandomPlan();
    this.drawShop();
    this.drawDebugShop();
    this.drawTutorialPanel();
    this.drawReplayPanel();
    void this.renderAll();
  }

  private async finishConfirmedTurn(): Promise<void> {
    const currentSession = this.sessionId;
    const combatStats = this.shopSystem.getCombatStats(this.state);
    this.recorder.recordAction(this.state, 'end_turn', {}, { ok: true });
    await this.turnManager.executeTurn(this.random, combatStats);
    if (currentSession !== this.sessionId) return;
    this.recorder.recordTurnBoundary(this.state, this.shopSystem, true);
    this.invalidateCombatRandomPlan();
    this.drawShop();
    void this.renderAll();
    if (!this.state.gameOver) {
      this.enableInput();
      void this.renderAll();
    }
  }

  private async renderAll(): Promise<void> {
    const previewId = ++this.previewRequestId;
    let preview: CombatPreview;
    if (this.shouldCalculateCombatPreview()) {
      const combatStats = this.shopSystem.getCombatStats(this.state);
      preview = await this.combatPreviewSystem.calculate(this.state, this.getCombatRandomPlan().createRecorder(), combatStats);
      if (previewId !== this.previewRequestId) return;
      this.combatPreview = preview;
    } else {
      this.combatPreview = null;
      preview = emptyCombatPreview();
    }
    const effectContext = createEffectContext(this.state, { random: this.random });
    this.updateStatChangeAnimations(effectContext);
    this.nightOverlayRenderer.render(this.state.nightStart, this.state.nightLength);
    this.octagonRenderer.render(this.state.board, this.state.hero.heroSector, this.state.rotationAngle, this.state.nightStart, this.state.nightLength, this.effectRenderer.powerAnims.get('village'), preview.attackedSectors, preview.villageDelta, preview.villageAttacked);
    this.blockRenderer.render(this.state.board, this.effectRenderer.blockAnims, this.state.rotationAngle, this.effectRenderer.powerAnims, effectContext, preview.sectorDeltas);
    this.dragonRenderer.render(this.state.aliveDragons, this.state.rotationAngle, this.state.nightStart, this.state.nightLength, this.effectRenderer.powerAnims, preview.dragonDeltas, this.state.turnNumber);
    this.hud.update(this.state.board.villageHp, this.state.board.villageGold, this.state.turnNumber, this.state.year, 'calm' as any, this.state.messages, this.state.rotationAngle);
    this.rhythmBar.draw(this.state.rhythm, this.effectRenderer.powerAnims);
    this.relicPanel.draw(this.state.relics);
    this.drawDebugShop();
    this.drawReplayPanel();
    this.turnHint.draw(this.shouldShowTurnHint());
    this.drawTutorialPanel();
  }

  private shouldCalculateCombatPreview(): boolean {
    return !this.state.gameOver
      && this.state.turnState === TurnState.WAITING_FOR_INPUT
      && !this.isTutorialActive()
      && !this.replayMode;
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
    this.shopPanel.draw(this.shopSystem.state, this.shopSystem.selectedItem(), this.state.turnState === TurnState.RELIC_SELECTION, this.state.board.villageGold, (item) => this.shopSystem.effectiveCost(item));
  }

  private drawDebugShop(): void {
    this.debugShopPanel.draw({
      visible: this.debugEnabled && this.debugShopVisible && !this.replayMode,
      mode: this.debugShopMode,
      freePurchase: this.debugFreePurchase,
      items: this.debugShopItems(),
      relics: RELIC_DEFS,
      disabled: this.state.gameOver || this.state.turnState !== TurnState.WAITING_FOR_INPUT,
      villageGold: this.state.board.villageGold,
      disabledRelicIds: this.disabledDebugRelicIds(),
      costResolver: (item) => this.shopSystem.effectiveCost(item),
    });
    this.postProcessDebugPanel.draw({
      visible: this.debugEnabled && this.debugShopVisible,
      config: this.renderer.getPostProcessConfig(),
      saveStatus: this.postProcessSaveStatus,
      anchorPanel: this.debugShopPanel.getLayoutSnapshot().panel,
    });
  }

  private drawTutorialPanel(): void {
    this.renderer.setCloudscapeVisible(!this.isTutorialActive());
    this.tutorialPanel.draw({
      activeId: this.activeTutorialId,
      targets: this.buildTutorialTargets(),
    });
  }

  private drawReplayPanel(): void {
    this.replayPanel.draw({
      visible: true,
      replayMode: this.replayMode,
      frameIndex: this.replayFrameIndex,
      frameCount: this.replayFrames.length,
      status: this.replayStatus,
      actionCount: this.recorder.actionCount(),
    });
  }

  private handleReplayControl(id: string, event?: { pointerId?: number; type?: string }): void {
    this.inputManager.suppressCurrentGesture(event);
    this.audioSystem.playClick();
    if (id === 'import') {
      void this.loadReplayFromFile();
      return;
    }
    if (id === 'export') {
      this.downloadReplayJson();
      return;
    }
    if (id === 'previous') {
      this.showReplayFrame(this.replayFrameIndex - 1);
      return;
    }
    if (id === 'next') {
      this.showReplayFrame(this.replayFrameIndex + 1);
      return;
    }
    if (id === 'death') {
      this.showReplayFrame(this.replayFrames.length - 1);
      return;
    }
    if (id === 'exit') this.startGame();
  }

  private isTutorialActive(): boolean {
    return this.activeTutorialId !== null && !this.replayMode;
  }

  private handleTutorialClicked(id: TutorialId, event?: { pointerId?: number; type?: string }): void {
    this.inputManager.suppressCurrentGesture(event);
    this.audioSystem.playClick();
    if (this.activeTutorialId === id) {
      this.closeTutorial(event);
      return;
    }
    this.activeTutorialId = id;
    if (this.activeTutorialId) {
      this.shopSystem.cancelPlacement();
      this.hideTutorialBlockedUi();
      this.turnHint.drawHoldProgress({ visible: false, progress: 0, x: 0, y: 0, text: '结束回合' });
      this.inputManager.resetGestureState();
    }
    this.drawShop();
    void this.renderAll();
  }

  private closeTutorial(event?: { pointerId?: number; type?: string }): void {
    if (!this.activeTutorialId) return;
    this.activeTutorialId = null;
    this.turnHint.drawHoldProgress({ visible: false, progress: 0, x: 0, y: 0, text: '结束回合' });
    this.inputManager.resetGestureState();
    this.inputManager.suppressCurrentGesture(event);
    this.drawShop();
    void this.renderAll();
  }

  private buildTutorialTargets(): Partial<Record<TutorialId, TutorialTarget>> {
    const goalHighlight = circleHighlight(
      this.renderer.octagonCenterX,
      this.renderer.octagonCenterY,
      Math.max(58, this.renderer.octagonRadius * 0.33),
    );
    const shopHighlight = paddedRect(this.shopAreaRect(), 16, this.renderer.screenW, this.renderer.screenH, 12);
    const progressHighlight = paddedRect(this.rhythmAreaRect(), 18, this.renderer.screenW, this.renderer.screenH, 14);
    return {
      goal: {
        highlights: [goalHighlight],
        text: '这是你的村子，从邪恶龙龙手中保护它',
        textX: this.renderer.octagonCenterX,
        textY: goalHighlight.y - 18,
        textAnchor: 'bottom',
      },
      shop: {
        highlights: [shopHighlight],
        text: '在商店中购买工事及法术，在下方岛屿上布置使用。',
        textX: highlightCenterX(shopHighlight),
        textY: shopHighlight.y + shopHighlight.height + 14,
        textAnchor: 'top',
      },
      progress: {
        highlights: [progressHighlight],
        text: '先撑过这一轮吧！可以用鼠标查看详情哦。',
        textX: highlightCenterX(progressHighlight),
        textY: progressHighlight.y - 12,
        textAnchor: 'bottom',
      },
      dayNight: {
        highlights: [],
        text: '推进回合时，黑夜/白天范围也会变化。\n在黑夜中的敌人将完全隐藏，请小心！',
        textX: this.renderer.screenW / 2,
        textY: this.renderer.screenH / 2,
        textAnchor: 'center',
      },
    };
  }

  private hideTutorialBlockedUi(): void {
    this.boardTooltip.hide();
    this.shopPanel.hideTooltip();
    this.rhythmBar.hideTooltip();
    this.relicPanel.hideOwnedTooltip();
    this.dragonRenderer.hideTooltip();
  }

  private shopAreaRect(): RectLayout {
    const layout = this.shopPanel.getLayoutSnapshot();
    const rects: RectLayout[] = [
      ...layout.sections.base.slots,
      ...layout.sections.random.slots,
      ...layout.sections.temporary.slots,
      layout.refreshButton,
    ].filter(rect => rect.width > 0 && rect.height > 0);
    return unionRects(rects, fallbackRect(18, 18, Math.min(420, this.renderer.screenW - 36), 200));
  }

  private rhythmAreaRect(): RectLayout {
    const nodes = this.rhythmBar.getLayoutSnapshot().nodes;
    const rects = nodes.map(node => rectFromBounds(node.centerX - node.radius, node.centerY - node.radius, node.radius * 2, node.radius * 2));
    return unionRects(rects, rectFromBounds(this.renderer.screenW * 0.3, this.renderer.screenH - 58, this.renderer.screenW * 0.4, 32));
  }

  private shouldShowTurnHint(): boolean {
    return !this.state.gameOver
      && this.state.turnState === TurnState.WAITING_FOR_INPUT
      && !this.shopSystem.selectedItem()
      && !this.isTutorialActive();
  }

  private rotateBoard(delta: number): void {
    if (this.replayMode) {
      this.showReplayFrame(this.replayFrameIndex + (delta > 0 ? 1 : -1));
      return;
    }
    if (this.isTutorialActive()) return;
    if (this.state.gameOver) return;
    if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
    if (this.shopSystem.selectedItem()) return;
    this.state.rotationAngle = normalizeRotation(this.state.rotationAngle + delta);
    this.inputManager.setRotationAngle(this.state.rotationAngle);
    this.state.turnRotationSteps += delta / 45;
    this.recorder.recordAction(this.state, 'rotate', { delta }, { ok: true });
    this.invalidateCombatRandomPlan();
    void this.renderAll();
  }

  private updateCanvasCursor(): void {
    if (!this.renderer.app) return;
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = this.replayMode ? 'default' : '';
  }

  private updateBoardTooltip(info: HoverSectorInfo): void {
    this.updateCanvasCursor();
    if (this.isTutorialActive()) {
      this.boardTooltip.hide();
      return;
    }
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
    const ctx = createEffectContext(this.state, { random: this.random });
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
    if (!result.ok || !selected || selected.item.kind !== 'spell') return result;
    if (selected.item.spellType !== SpellType.BULWARK && selected.item.spellType !== SpellType.MAGIC_BOOK) return result;
    return this.shopSystem.tryPlaceSelectedItem(this.state, null);
  }

  private recordShopSelection(section: string, index: number, selectResult: { ok: boolean; message: string }, finalResult: { ok: boolean; message: string }): void {
    const selected = this.shopSystem.selectedItem();
    if (!selectResult.ok || !selected) {
      this.recorder.recordAction(this.state, 'select_item', { section, index }, { ok: false, message: selectResult.message });
      return;
    }
    if (selected.item.kind === 'spell' && (selected.item.spellType === SpellType.BULWARK || selected.item.spellType === SpellType.MAGIC_BOOK)) {
      this.recorder.recordAction(this.state, 'cast', { section, index, sector: null, targetIntent: 'block' }, { ok: finalResult.ok, message: finalResult.message });
      return;
    }
    this.recorder.recordAction(this.state, 'select_item', { section, index }, { ok: selectResult.ok, message: selectResult.message });
  }

  private showPlacementFeedback(result: { feedback?: { sector: number; text: string; color?: number } }): void {
    if (!result.feedback) return;
    this.effectRenderer.showFloatingText(result.feedback.sector, result.feedback.text, result.feedback.color ?? 0xff6666);
  }

  private exportReplay(): CompactReplayV1 {
    return this.recorder.buildReplay(this.state, this.shopSystem);
  }

  private downloadReplayJson(): void {
    const replay = this.exportReplay();
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${replay.runId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.replayStatus = '回放已导出';
    this.drawReplayPanel();
  }

  private async uploadReplayOnGameOver(): Promise<void> {
    if (this.replayMode || !this.telemetryClient.isConfigured()) return;
    const result = await this.telemetryClient.uploadReplay(this.exportReplay());
    this.replayStatus = result.ok ? '游玩数据已上传' : '游玩数据上传失败';
    this.drawReplayPanel();
  }

  private async loadReplayFromFile(): Promise<{ ok: boolean; error?: string }> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    return new Promise(resolve => {
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve({ ok: false, error: '未选择回放文件' });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            resolve(this.loadReplay(JSON.parse(String(reader.result))));
          } catch {
            resolve({ ok: false, error: '回放 JSON 解析失败' });
          }
        };
        reader.onerror = () => resolve({ ok: false, error: '回放文件读取失败' });
        reader.readAsText(file);
      };
      input.click();
    });
  }

  private async loadReplay(replay: unknown): Promise<{ ok: boolean; error?: string }> {
    if (this.state && replay && typeof replay === 'object') {
      const compatibilityError = validateReplayCompatibility(replay as CompactReplayV1);
      if (compatibilityError) {
        this.state.addMessage(compatibilityError);
        void this.renderAll();
        return { ok: false, error: compatibilityError };
      }
    }
    const result = await runCompactReplay(replay);
    if (!result.ok || result.frames.length === 0) {
      const error = result.error ?? '回放加载失败';
      if (this.state) {
        this.state.addMessage(error);
        void this.renderAll();
      }
      return { ok: false, error };
    }
    this.sessionId++;
    this.replayMode = true;
    this.replayFrames = result.frames;
    this.replayFrameIndex = 0;
    this.replayStatus = result.ok ? '回放已加载' : result.error ?? '回放与当前版本不一致';
    this.activeTutorialId = null;
    this.shopSystem.cancelPlacement();
    this.boardTooltip.hide();
    this.inputManager.disable(this.renderer.app.canvas as HTMLCanvasElement);
    this.dragonRenderer.clear();
    this.effectRenderer.clear();
    this.showReplayFrame(0);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  private showReplayFrame(index: number): void {
    if (!this.replayMode || this.replayFrames.length === 0) return;
    const frame = this.replayFrames[clamp(index, 0, this.replayFrames.length - 1)];
    this.replayFrameIndex = frame.index;
    this.state = frame.state;
    this.shopSystem = frame.shop;
    this.inputManager.setRotationAngle(this.state.rotationAngle);
    this.previousSectorStats.clear();
    this.previousDragonStats.clear();
    this.combatPreview = null;
    this.combatRandomPlan = null;
    this.previewRequestId++;
    this.state.addMessage(`Replay ${frame.index + 1}/${this.replayFrames.length}: ${frame.actionType}`);
    if (frame.expectedHash && frame.expectedHash !== frame.actualHash) {
      this.state.addMessage('回放与当前版本不一致');
    } else if (this.replayStatus) {
      this.state.addMessage(this.replayStatus);
    }
    this.drawShop();
    this.drawDebugShop();
    this.drawReplayPanel();
    void this.renderAll();
  }

  private serializeShopItem(item: ShopItem | null): unknown {
    if (!item) return null;
    if (item.kind === 'block') {
      return { id: item.id, kind: item.kind, type: item.blockType, label: item.label, cost: item.cost, effectiveCost: this.shopSystem.effectiveCost(item), hp: item.hp, attack: item.attack, tags: item.tags };
    }
    if (item.kind === 'action') {
      return { id: item.id, kind: item.kind, actionType: item.actionType, label: item.label, cost: item.cost, effectiveCost: this.shopSystem.effectiveCost(item), baseReward: item.baseReward, tags: item.tags };
    }
    return { id: item.id, kind: item.kind, spellType: item.spellType, label: item.label, cost: item.cost, effectiveCost: this.shopSystem.effectiveCost(item), tags: item.tags, tempAttack: item.tempAttack ?? 0, temporary: item.temporary ?? false, repelTemplateId: item.repelTemplateId };
  }

  private getSnapshot(): unknown {
    return {
      turnNumber: this.state.turnNumber,
      turnState: this.state.turnState,
      villageHp: this.state.board.villageHp,
      villageGold: this.state.board.villageGold,
      board: this.state.board.sectors.map(block => block ? { type: block.type, hp: block.hp, attack: block.attack, tags: block.tags, shielded: block.shielded } : null),
      dragons: this.state.aliveDragons.map(dragon => ({
        id: dragon.id,
        templateId: dragon.templateId,
        name: dragon.name,
        personality: dragon.personality,
        hp: dragon.hp,
        maxHp: dragon.maxHp,
        attack: dragon.attack,
        readyToAttackTurn: dragon.readyToAttackTurn,
        attackDisplay: this.dragonRenderer.getAttackDisplay(dragon, this.state.turnNumber),
        hasTakenDamage: dragon.hasTakenDamage,
        assetName: this.dragonRenderer.getDragonAssetName(dragon),
        screen: this.dragonRenderer.getDragonScreenPosition(dragon.id),
      })),
      shop: {
        base: this.shopSystem.state.base.map(item => this.serializeShopItem(item)),
        random: this.shopSystem.state.random.map(slot => ({ item: this.serializeShopItem(slot.item), locked: slot.locked })),
        temporary: this.shopSystem.state.temporary.map(item => this.serializeShopItem(item)),
        refreshCost: this.shopSystem.state.refreshCost,
        freeRefreshCredits: this.shopSystem.state.freeRefreshCredits,
        nextPurchaseDiscount: this.shopSystem.state.nextPurchaseDiscount,
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
        viewportW: this.renderer.viewportW,
        viewportH: this.renderer.viewportH,
        displayScale: this.renderer.displayScale,
        renderResolution: this.renderer.renderResolution,
        layoutProfile: this.renderer.layoutProfile,
        safeArea: this.renderer.safeArea,
        octagonCenterX: this.renderer.octagonCenterX,
        octagonCenterY: this.renderer.octagonCenterY,
        octagonRadius: this.renderer.octagonRadius,
      },
      boardOutline: this.octagonRenderer.getBoardOutlineSnapshot(),
      gameOver: this.state.gameOver,
      viewMode: false,
      rotationAngle: this.state.rotationAngle,
      turnRotationSteps: this.state.turnRotationSteps,
      rotationControls: this.emptyRotationControlsSnapshot(),
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
      rhythmEventText: this.lastRhythmEventText,
      rhythmEventTextPosition: this.lastRhythmEventTextPosition,
      relics: {
        pending: this.state.relics.pendingChoices.map(relic => this.serializeRelic(relic)),
        selectedChoiceId: this.state.relics.selectedChoiceId,
        owned: this.state.relics.owned.map(entry => ({ ...entry })),
        layout: this.relicPanel.getLayoutSnapshot(),
      },
      turnHintVisible: this.turnHint.isVisible(),
      endTurnHintText: this.turnHint.getEndTurnHintText(),
      rotateHintVisible: this.turnHint.isRotateHintVisible(),
      rotateHintText: this.turnHint.getRotateHintText(),
      rotateHintScale: this.turnHint.getRotateHintScale(),
      holdEndTurnProgress: this.turnHint.getHoldProgressSnapshot(),
      phaseAnnouncementVisible: this.phaseAnnouncement.isVisible(),
      phaseAnnouncementText: this.phaseAnnouncement.getText(),
      dragonTooltipVisible: this.dragonRenderer.isTooltipVisible(),
      dragonAssetNames: this.dragonRenderer.getTemplateAssetNames(),
      shopTooltipVisible: this.shopPanel.isTooltipVisible(),
      shopTooltipLines: this.shopPanel.getTooltipLines(),
      shopTooltipLayout: this.shopPanel.getTooltipLayout(),
      boardTooltipVisible: this.boardTooltip.isVisible(),
      boardTooltipLines: this.boardTooltip.getLines(),
      relicTooltipVisible: this.relicPanel.isOwnedTooltipVisible(),
      relicTooltipLines: this.relicPanel.getOwnedTooltipLines(),
      relicTooltipPanel: this.relicPanel.getOwnedTooltipPanelSnapshot(),
      debugShop: {
        enabled: this.debugEnabled,
        visible: this.debugShopVisible,
        mode: this.debugShopMode,
        freePurchase: this.debugFreePurchase,
        layout: this.debugShopPanel.getLayoutSnapshot(),
        postProcessLayout: this.postProcessDebugPanel.getLayoutSnapshot(),
      },
      warmTint: this.renderer.getWarmTintSnapshot(),
      postProcess: {
        ...this.renderer.getPostProcessSnapshot(),
        saveStatus: this.postProcessSaveStatus,
      },
      nightOverlay: this.nightOverlayRenderer.getSnapshot(),
      cloudscape: this.renderer.getCloudscapeSnapshot(),
      islandShadow: this.renderer.getIslandShadowSnapshot(),
      tutorial: this.tutorialPanel.getLayoutSnapshot(),
      combatPreview: this.serializeCombatPreview(),
      replay: {
        mode: this.replayMode,
        frameIndex: this.replayFrameIndex,
        frameCount: this.replayFrames.length,
        status: this.replayStatus,
        panel: this.replayPanel.getLayoutSnapshot(),
        telemetryConfigured: this.telemetryClient.isConfigured(),
        gameVersion: GAME_VERSION,
        dataHash: currentDataHash(),
        seed: this.gameSeed,
        actionCount: this.recorder.actionCount(),
      },
    };
  }

  private serializeRelic(relic: RelicDef): unknown {
    return {
      id: relic.id,
      label: relic.label,
      color: relic.color,
      iconKey: relic.iconKey,
      maxSelections: relic.maxSelections,
      description: relic.description,
    };
  }

  private serializeCombatPreview(): unknown {
    const preview = this.combatPreview;
    if (!preview) {
      return {
        sectorDeltas: [],
        dragonDeltas: [],
        villageDelta: { hpDelta: 0, attackDelta: 0, willDie: false },
        villageAttacked: false,
        attackedSectors: [],
        trace: [],
      };
    }
    return {
      sectorDeltas: [...preview.sectorDeltas.entries()].map(([sector, delta]) => ({ sector, ...delta })),
      dragonDeltas: [...preview.dragonDeltas.entries()].map(([id, delta]) => ({ id, ...delta })),
      villageDelta: preview.villageDelta,
      villageAttacked: preview.villageAttacked,
      attackedSectors: [...preview.attackedSectors],
      trace: preview.trace,
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
    this.state.relics.pendingChoices = [];
    this.state.relics.selectedChoiceId = null;
    this.drawShop();
    void this.renderAll();
    this.enableInput();
  }

  private prepareRhythmEventTextTest(): void {
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
      nodes: [{ id: 'test-event', type: 'event', triggered: false }],
    };
    this.lastRhythmEventText = '';
    this.lastRhythmEventTextPosition = null;
    this.shopSystem.cancelPlacement();
    this.state.relics.pendingChoices = [];
    this.state.relics.selectedChoiceId = null;
    this.drawShop();
    this.rhythmBar.draw(this.state.rhythm, this.effectRenderer.powerAnims);
    void this.renderAll();
    this.enableInput();
  }

  private prepareRhythmTooltipTest(): void {
    this.state.board.villageHp = 999;
    this.state.dragons = [];
    this.state.gameOver = false;
    this.state.gameOverReason = '';
    this.state.turnState = TurnState.WAITING_FOR_INPUT;
    this.state.rhythm = {
      round: 0,
      nodeIndex: 0,
      roundLength: 2,
      lastTriggeredIndex: null,
      nodes: [
        { id: 'test-normal', type: 'normal', triggered: false },
        { id: 'test-departure', type: 'departure', triggered: false },
      ],
    };
    this.shopSystem.cancelPlacement();
    this.state.relics.pendingChoices = [];
    this.state.relics.selectedChoiceId = null;
    this.rhythmBar.draw(this.state.rhythm, this.effectRenderer.powerAnims);
    void this.renderAll();
    this.enableInput();
  }

  private prepareMageMissileTooltipTest(): void {
    this.state.board.villageHp = 999;
    this.state.board.villageGold = 100;
    this.state.board.sectors = this.state.board.sectors.map(() => null);
    this.state.board.setSector(0, createPlacedBlock(BlockType.MAGE));
    this.state.board.setSector(1, createGoldMine());
    this.state.dragons = [];
    this.state.gameOver = false;
    this.state.gameOverReason = '';
    this.state.turnState = TurnState.WAITING_FOR_INPUT;
    this.state.relics.pendingChoices = [];
    this.state.relics.selectedChoiceId = null;
    this.shopSystem.reset();
    this.shopSystem.cancelPlacement();
    this.shopSystem.applyStartOfPlayerTurnEffects(this.state);
    this.drawShop();
    void this.renderAll();
    this.enableInput();
  }

  private prepareTemporaryShopLayoutTest(): void {
    const spell = RANDOM_SHOP_POOL.find((item): item is SpellShopItem => item.kind === 'spell');
    if (!spell) return;
    this.shopSystem.state.temporary = [cloneShopItem(spell), cloneShopItem(spell)];
    for (const item of this.shopSystem.state.temporary) {
      if (item.kind === 'spell') item.temporary = true;
    }
    this.shopSystem.cancelPlacement();
    this.drawShop();
    void this.renderAll();
  }

  private prepareOwnedRelicTooltipTest(): void {
    RelicSystem.grant(this.state, 'auto_missile');
    this.state.relics.pendingChoices = [];
    this.state.relics.selectedChoiceId = null;
    this.drawShop();
    void this.renderAll();
  }

  private resetPostProcessConfigForTest(): void {
    this.renderer.setPostProcessConfig(this.renderer.getDefaultPostProcessConfig());
    this.postProcessSaveStatus = '保存中...';
    if (this.postProcessSaveTimer !== null) {
      window.clearTimeout(this.postProcessSaveTimer);
      this.postProcessSaveTimer = null;
    }
    void this.savePostProcessConfig();
    this.drawDebugShop();
  }

  private handleDragonClicked(dragonId: string, event?: { pointerId?: number; type?: string }): void {
    if (this.isTutorialActive()) {
      this.inputManager.suppressCurrentGesture(event);
      return;
    }
    const selected = this.shopSystem.selectedItem();
    if (!selected || selected.item.kind !== 'spell' || selected.item.spellType !== SpellType.MISSILE) return;
    const dragon = this.state.aliveDragons.find(candidate => candidate.id === dragonId);
    if (!dragon) return;
    this.audioSystem.playClick();
    this.inputManager.suppressCurrentGesture(event);
    const sector = dragonEdgeToBoardSector(dragon.edgeIndex, this.state.rotationAngle);
    const result = this.shopSystem.tryPlaceSelectedItem(this.state, sector, 'dragon');
    this.recorder.recordAction(this.state, 'cast', {
      section: selected.area,
      index: selected.index,
      sector,
      targetIntent: 'dragon',
      dragonId,
    }, { ok: result.ok, message: result.message });
    this.showPlacementFeedback(result);
    this.state.addMessage(result.message);
    if (result.ok) this.invalidateCombatRandomPlan();
    this.drawShop();
    void this.renderAll();
  }

  private handleDebugKeyDown(event: KeyboardEvent): void {
    if (this.replayMode) {
      if (event.code === 'ArrowRight') {
        event.preventDefault();
        this.showReplayFrame(this.replayFrameIndex + 1);
        return;
      }
      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        this.showReplayFrame(this.replayFrameIndex - 1);
        return;
      }
      if (event.code === 'Escape') {
        event.preventDefault();
        this.startGame();
        return;
      }
    }
    if (event.code !== 'Backquote') return;
    if (event.repeat) return;
    event.preventDefault();
    this.debugShopVisible = !this.debugShopVisible;
    this.debugShopPanel.resetScroll();
    this.drawDebugShop();
  }

  private handleDebugItemSelected(itemId: string, event?: { pointerId?: number; type?: string }): void {
    this.inputManager.suppressCurrentGesture(event);
    if (this.isTutorialActive()) return;
    if (!this.debugEnabled || !this.debugShopVisible || this.state.gameOver || this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
    const item = this.debugShopItems().find(candidate => candidate.id === itemId);
    if (!item) return;
    this.audioSystem.playClick();
    const result = this.shopSystem.beginDebugPurchase(item, this.state.board.villageGold, this.debugFreePurchase);
    const finalResult = this.resolveImmediateShopSelection(result);
    this.state.addMessage(finalResult.message);
    if (finalResult.ok) this.invalidateCombatRandomPlan();
    this.drawShop();
    this.drawDebugShop();
    void this.renderAll();
  }

  private handleDebugRelicSelected(relicId: string, event?: { pointerId?: number; type?: string }): void {
    this.inputManager.suppressCurrentGesture(event);
    if (this.isTutorialActive()) return;
    if (!this.debugEnabled || !this.debugShopVisible || this.state.gameOver || this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
    const relic = RELIC_DEFS.find(candidate => candidate.id === relicId);
    if (!relic || this.debugRelicAtLimit(relic)) return;
    this.audioSystem.playClick();
    RelicSystem.grant(this.state, relic.id);
    this.state.addMessage(`获得遗物：${relic.label}`);
    this.invalidateCombatRandomPlan();
    this.drawShop();
    this.drawDebugShop();
    void this.renderAll();
  }

  private handlePostProcessControl(id: string, event?: { pointerId?: number; type?: string }): void {
    this.inputManager.suppressCurrentGesture(event);
    if (!this.debugEnabled || !this.debugShopVisible) return;
    const current = this.renderer.getPostProcessConfig();
    const next = adjustPostProcessConfig(current, id);
    this.renderer.setPostProcessConfig(next);
    this.postProcessSaveStatus = '保存中...';
    this.drawDebugShop();
    this.schedulePostProcessSave();
  }

  private schedulePostProcessSave(): void {
    if (this.postProcessSaveTimer !== null) window.clearTimeout(this.postProcessSaveTimer);
    this.postProcessSaveTimer = window.setTimeout(() => {
      this.postProcessSaveTimer = null;
      void this.savePostProcessConfig();
    }, 250);
  }

  private async savePostProcessConfig(): Promise<void> {
    if (!this.debugEnabled) return;
    try {
      const response = await fetch('/__debug/postprocess-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.renderer.getPostProcessConfig()),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.postProcessSaveStatus = '已保存';
    } catch {
      this.postProcessSaveStatus = '保存失败';
    }
    this.drawDebugShop();
  }

  private debugShopItems(): ShopItem[] {
    const items = new Map<string, ShopItem>();
    for (const item of SHOP_ITEM_POOL) {
      if (item.kind === 'action') continue;
      if (items.has(item.id)) continue;
      items.set(item.id, item);
    }
    return [...items.values()];
  }

  private disabledDebugRelicIds(): Set<string> {
    const ids = new Set<string>();
    for (const relic of RELIC_DEFS) {
      if (this.debugRelicAtLimit(relic)) ids.add(relic.id);
    }
    return ids;
  }

  private debugRelicAtLimit(relic: RelicDef): boolean {
    return relic.maxSelections !== null && RelicSystem.getCount(this.state, relic.id) >= relic.maxSelections;
  }

  private emptyRotationControlsSnapshot(): { clockwise: { x: number; y: number; width: number; height: number; centerX: number; centerY: number }; counterclockwise: { x: number; y: number; width: number; height: number; centerX: number; centerY: number } } {
    const empty = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
    return { clockwise: { ...empty }, counterclockwise: { ...empty } };
  }

  private getCombatRandomPlan(): CombatRandomPlan {
    if (!this.combatRandomPlan) this.combatRandomPlan = new CombatRandomPlan();
    return this.combatRandomPlan;
  }

  private invalidateCombatRandomPlan(): void {
    this.combatRandomPlan = null;
  }
}

function normalizeRotation(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  return ((Math.round(normalized / 45) * 45) % 360 + 360) % 360;
}

function createGameSeed(): string {
  const timestamp = Date.now().toString(36);
  const entropy = typeof crypto !== 'undefined' && 'getRandomValues' in crypto
    ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
    : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `player-${timestamp}-${entropy}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shopActionTypeForItem(item: ShopItem): 'place' | 'cast' | 'sell' {
  if (item.kind === 'spell') return 'cast';
  if (item.kind === 'action') return 'sell';
  return 'place';
}

function rectFromBounds(x: number, y: number, width: number, height: number): RectLayout {
  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

function fallbackRect(x: number, y: number, width: number, height: number): RectLayout {
  return rectFromBounds(x, y, width, height);
}

function unionRects(rects: RectLayout[], fallback: RectLayout): RectLayout {
  if (rects.length === 0) return fallback;
  const left = Math.min(...rects.map(rect => rect.x));
  const top = Math.min(...rects.map(rect => rect.y));
  const right = Math.max(...rects.map(rect => rect.x + rect.width));
  const bottom = Math.max(...rects.map(rect => rect.y + rect.height));
  return rectFromBounds(left, top, right - left, bottom - top);
}

function paddedRect(rect: RectLayout, padding: number, screenW: number, screenH: number, radius: number): TutorialHighlight {
  const x = Math.max(0, rect.x - padding);
  const y = Math.max(0, rect.y - padding);
  const right = Math.min(screenW, rect.x + rect.width + padding);
  const bottom = Math.min(screenH, rect.y + rect.height + padding);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
    radius,
    shape: 'rect',
  };
}

function circleHighlight(centerX: number, centerY: number, radius: number): TutorialHighlight {
  return {
    x: centerX - radius,
    y: centerY - radius,
    width: radius * 2,
    height: radius * 2,
    radius,
    shape: 'circle',
  };
}

function highlightCenterX(highlight: TutorialHighlight): number {
  return highlight.x + highlight.width / 2;
}

function emptyCombatPreview(): CombatPreview {
  return {
    sectorDeltas: new Map(),
    dragonDeltas: new Map(),
    villageDelta: { hpDelta: 0, attackDelta: 0, willDie: false },
    villageAttacked: false,
    attackedSectors: new Set(),
    trace: [],
  };
}

function adjustPostProcessConfig(config: PostProcessConfig, id: string): PostProcessConfig {
  const next: PostProcessConfig = {
    warmTint: { ...config.warmTint },
    posterizePalette: { ...config.posterizePalette, colors: [...config.posterizePalette.colors] },
    softGlow: { ...config.softGlow },
  };
  switch (id) {
    case 'warm.enabled':
      next.warmTint.enabled = !next.warmTint.enabled;
      break;
    case 'warm.strength.down':
      next.warmTint.strength = clampRound(next.warmTint.strength - 0.05, 0, 1, 2);
      break;
    case 'warm.strength.up':
      next.warmTint.strength = clampRound(next.warmTint.strength + 0.05, 0, 1, 2);
      break;
    case 'warm.color':
      next.warmTint.color = nextSwatchColor(next.warmTint.color);
      break;
    case 'posterize.enabled':
      next.posterizePalette.enabled = !next.posterizePalette.enabled;
      break;
    case 'posterize.band.down':
      next.posterizePalette.bandCount = Math.max(2, next.posterizePalette.bandCount - 1);
      break;
    case 'posterize.band.up':
      next.posterizePalette.bandCount = Math.min(8, next.posterizePalette.bandCount + 1);
      break;
    case 'glow.enabled':
      next.softGlow.enabled = !next.softGlow.enabled;
      break;
    case 'glow.strength.down':
      next.softGlow.strength = clampRound(next.softGlow.strength - 0.05, 0, 1, 2);
      break;
    case 'glow.strength.up':
      next.softGlow.strength = clampRound(next.softGlow.strength + 0.05, 0, 1, 2);
      break;
    case 'glow.threshold.down':
      next.softGlow.threshold = clampRound(next.softGlow.threshold - 0.05, 0, 1, 2);
      break;
    case 'glow.threshold.up':
      next.softGlow.threshold = clampRound(next.softGlow.threshold + 0.05, 0, 1, 2);
      break;
    case 'glow.radius.down':
      next.softGlow.radius = clampRound(next.softGlow.radius - 1, 1, 8, 0);
      break;
    case 'glow.radius.up':
      next.softGlow.radius = clampRound(next.softGlow.radius + 1, 1, 8, 0);
      break;
    default: {
      const match = /^posterize\.color\.(\d+)$/.exec(id);
      if (match) {
        const index = Number.parseInt(match[1], 10);
        if (index >= 0 && index < next.posterizePalette.colors.length) {
          next.posterizePalette.colors[index] = nextSwatchColor(next.posterizePalette.colors[index]);
        }
      }
      break;
    }
  }
  return next;
}

function clampRound(value: number, min: number, max: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(Math.max(min, Math.min(max, value)) * scale) / scale;
}
