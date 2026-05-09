import { GameRenderer } from './rendering/GameRenderer';
import { GridRenderer } from './rendering/GridRenderer';
import { BlockRenderer } from './rendering/BlockRenderer';
import { VisionFrameRenderer } from './rendering/VisionFrameRenderer';
import { DragonRenderer } from './rendering/DragonRenderer';
import { EffectRenderer } from './rendering/EffectRenderer';
import { HUD } from './ui/HUD';
import { DragonInfoPanel } from './ui/DragonInfoPanel';
import { PhaseAnnouncement } from './ui/PhaseAnnouncement';
import { GameOverScreen } from './ui/GameOverScreen';
import { InputManager } from './input/InputManager';
import { GameState, TurnState } from './core/GameState';
import { TurnManager } from './core/TurnManager';
import { PhaseManager } from './core/PhaseManager';
import { EventBus } from './core/EventBus';
import { GAME_CONSTANTS } from './config/constants';
import { GamePhase } from './core/GameState';

export class Game {
  private renderer: GameRenderer;
  private gridRenderer!: GridRenderer;
  private blockRenderer!: BlockRenderer;
  private visionFrameRenderer!: VisionFrameRenderer;
  private dragonRenderer!: DragonRenderer;
  private effectRenderer!: EffectRenderer;
  private hud!: HUD;
  private dragonInfoPanel!: DragonInfoPanel;
  private phaseAnnouncement!: PhaseAnnouncement;
  private gameOverScreen!: GameOverScreen;
  private inputManager!: InputManager;

  private state: GameState;
  private turnManager!: TurnManager;
  private phaseManager!: PhaseManager;

  constructor() {
    this.renderer = new GameRenderer();
    this.state = new GameState();
  }

  async init(): Promise<void> {
    await this.renderer.init();

    // Create renderers
    this.gridRenderer = new GridRenderer(this.renderer);
    this.blockRenderer = new BlockRenderer(this.renderer);
    this.visionFrameRenderer = new VisionFrameRenderer(this.renderer);
    this.dragonRenderer = new DragonRenderer(this.renderer);
    this.effectRenderer = new EffectRenderer(this.renderer);

    // Create UI
    this.hud = new HUD(this.renderer);
    this.dragonInfoPanel = new DragonInfoPanel(this.renderer);
    this.phaseAnnouncement = new PhaseAnnouncement(this.renderer);
    this.gameOverScreen = new GameOverScreen(this.renderer);

    // Create input
    this.inputManager = new InputManager(this.renderer);

    // Create managers
    this.phaseManager = new PhaseManager(this.state);
    this.turnManager = new TurnManager(this.state, this.phaseManager);

    // Setup event listeners
    this.setupEvents();

    // Start game
    this.startGame();

    // Use requestAnimationFrame for animation-only updates (lightweight)
    const animate = () => {
      this.effectRenderer.update();
      // Only re-render if animations are active
      if (this.effectRenderer.blockAnims.size > 0) {
        this.renderAll();
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private startGame(): void {
    this.state = new GameState();
    this.phaseManager = new PhaseManager(this.state);
    this.turnManager = new TurnManager(this.state, this.phaseManager);

    this.turnManager.initWorld();
    this.phaseManager.initPhase();

    this.dragonRenderer.clear();
    this.effectRenderer.clear();

    this.renderAll();
    this.enableInput();
  }

  private setupEvents(): void {
    EventBus.on('phaseChanged', (payload: { phase: GamePhase; year: number; message: string }) => {
      this.phaseAnnouncement.show(payload.message);
      // Handle year transitions
      if (payload.phase === GamePhase.YEAR_TRANSITION) {
        setTimeout(() => {
          this.turnManager.handleYearTransition();
          this.spawnDragonsForNewPhase();
          this.renderAll();
          this.enableInput();
        }, 2000);
      }
    });

    EventBus.on('gameOver', (payload: { reason: string }) => {
      this.inputManager.disable();
      this.gameOverScreen.show(
        this.state.turnNumber,
        this.state.year,
        payload.reason,
        () => this.startGame(),
      );
    });

    EventBus.on('dragonAttacked', (payload: { dragonId: string; positions: any[]; actionType: string }) => {
      if (payload.actionType !== 'summon_imp') {
        this.effectRenderer.triggerScreenFlash(0xff4444, 15);
        this.effectRenderer.showAttackHighlight(payload.positions, 30);
      }
    });

    EventBus.on('blockDestroyed', (payload: { position: any; blockType: string; value: number }) => {
      this.effectRenderer.startShrink(payload.position);
      this.effectRenderer.showFloatingText(payload.position, 'X', 0xff6666);
    });

    EventBus.on('blockReplenished', (payload: { position: any }) => {
      this.effectRenderer.startGrow(payload.position);
    });

    EventBus.on('visionEffectApplied', (payload: { position: any; message: string; color: number }) => {
      this.effectRenderer.startBounce(payload.position);
      this.effectRenderer.showFloatingText(payload.position, payload.message, payload.color);
    });

    EventBus.on('heroDamaged', (payload: { damage: number; remainingPower: number }) => {
      this.effectRenderer.triggerScreenFlash(0xffffff, 10);
    });
  }

  private enableInput(): void {
    this.inputManager.enable();

    this.inputManager.onFrameMove((frame) => {
      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      this.state.visionFrame = frame;
      this.renderAll();
    });

    this.inputManager.onConfirm((frame) => {
      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      if (this.state.gameOver) return;

      this.inputManager.disable();
      this.turnManager.executeTurn(frame);
      this.renderAll();

      // Re-enable input after a short delay (unless game over or year transition)
      if (!this.state.gameOver && this.state.phase !== GamePhase.YEAR_TRANSITION) {
        setTimeout(() => {
          if (!this.state.gameOver && this.state.phase !== GamePhase.YEAR_TRANSITION) {
            this.enableInput();
            this.renderAll();
          }
        }, 600);
      }
    });
  }

  private spawnDragonsForNewPhase(): void {
    // Spawn initial dragons based on current phase
    const phase = this.state.phase;
    if (phase === GamePhase.HARASSMENT || phase === GamePhase.DECISIVE_BATTLE) {
      // TurnManager will handle spawning when entering these phases
    }
  }

  private renderAll(): void {
    this.gridRenderer.render(this.state.grid, this.state.heroPos);
    this.blockRenderer.render(this.state.grid, this.effectRenderer.blockAnims);
    this.visionFrameRenderer.render(this.state.visionFrame);
    this.dragonRenderer.render(this.state.aliveDragons);
    this.hud.update(
      this.state.hero,
      this.state.turnNumber,
      this.state.year,
      this.state.phase,
      this.state.messages,
    );
  }
}
