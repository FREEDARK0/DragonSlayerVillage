import { GameRenderer } from './rendering/GameRenderer';
import { OctagonRenderer } from './rendering/OctagonRenderer';
import { BlockRenderer } from './rendering/BlockRenderer';
import { DragonRenderer } from './rendering/DragonRenderer';
import { EffectRenderer } from './rendering/EffectRenderer';
import { HUD } from './ui/HUD';
import { DragonInfoPanel } from './ui/DragonInfoPanel';
import { PhaseAnnouncement } from './ui/PhaseAnnouncement';
import { GameOverScreen } from './ui/GameOverScreen';
import { ShopPanel } from './ui/ShopPanel';
import { InputManager } from './input/InputManager';
import { GameState, TurnState } from './core/GameState';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { BlockType, getVillageLevel } from './config/blockTypes';

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
  private inputManager!: InputManager;
  private state!: GameState;
  private turnManager!: TurnManager;

  constructor() { this.renderer = new GameRenderer(); }

  async init(): Promise<void> {
    await this.renderer.init();
    this.octagonRenderer = new OctagonRenderer(this.renderer);
    this.blockRenderer = new BlockRenderer(this.renderer);
    this.dragonRenderer = new DragonRenderer(this.renderer);
    this.effectRenderer = new EffectRenderer(this.renderer);
    this.hud = new HUD(this.renderer);
    this.dragonInfoPanel = new DragonInfoPanel(this.renderer);
    this.phaseAnnouncement = new PhaseAnnouncement(this.renderer);
    this.gameOverScreen = new GameOverScreen(this.renderer);
    this.shopPanel = new ShopPanel(this.renderer);
    this.inputManager = new InputManager();
    this.shopPanel.onBuyWall = () => this.buyWoodWall();
    this.setupEvents();
    this.startGame();
    const animate = () => {
      this.effectRenderer.update();
      if (this.effectRenderer.blockAnims.size > 0) this.renderAll();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private startGame(): void {
    this.state = new GameState();
    this.turnManager = new TurnManager(this.state);
    this.turnManager.initWorld();
    this.dragonRenderer.clear();
    this.effectRenderer.clear();
    this.gameOverScreen.hide();
    this.renderAll();
    this.enableInput();
  }

  private setupEvents(): void {
    EventBus.on('phaseChanged', (payload: { message: string }) => {
      this.phaseAnnouncement.show(payload.message);
    });
    EventBus.on('gameOver', (payload: { reason: string }) => {
      this.inputManager.disable(this.renderer.app.canvas as HTMLCanvasElement);
      this.gameOverScreen.show(this.state.turnNumber, this.state.year, payload.reason, () => this.startGame());
    });
    EventBus.on('dragonAttacked', (payload: { dragonId: string; sectors: number[]; actionType: string }) => {
      if (payload.actionType === 'summon_imp') return;
      this.dragonRenderer.animateAttack(payload.dragonId);
      this.effectRenderer.triggerScreenFlash(0xff4444, 12);
      const sectors = payload.sectors;
      const waveCount = sectors.length / 2;
      for (let wave = 0; wave < waveCount; wave++) {
        setTimeout(() => {
          const mid = sectors.length / 2;
          const left = sectors[mid - 1 - wave];
          const right = sectors[mid + wave];
          for (const s of [left, right]) {
            if (s !== undefined) {
              this.effectRenderer.startBounce(s);
              this.effectRenderer.flashSector(s, this.state.rotationAngle);
            }
          }
          this.renderAll();
        }, wave * 600);
      }
      setTimeout(() => { this.turnManager.triggerBlockEffects(sectors); this.renderAll(); }, waveCount * 600 + 600);
    });
    EventBus.on('blockDestroyed', (payload: { sector: number }) => {
      this.effectRenderer.startShrink(payload.sector);
      this.effectRenderer.showFloatingText(payload.sector, 'X', 0xff6666);
    });
  }

  private enableInput(): void {
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    this.inputManager.enable(canvas, this.renderer.octagonCenterX, this.renderer.octagonCenterY, this.renderer.octagonRadius);
    this.inputManager.onRotate((delta) => {
      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      this.state.rotationAngle = ((this.state.rotationAngle + delta) % 360 + 360) % 360;
      this.state.turnRotationSteps += delta / 45;
      this.renderAll();
    });
    this.inputManager.onConfirm(() => {
      if (this.state.gameOver) return;

      if (this.placementMode) {
        const sector = this.inputManager.getCurrentSector();
        if (sector !== null && this.state.board.isEmpty(sector)) {
          const level = getVillageLevel(this.state.board.villagePower);
          const power = level >= 2 ? 50 : 10;
          this.state.board.setSector(sector, { id: Date.now(), type: BlockType.WOOD_WALL, value: power, power, shielded: false, attribute: null });
          this.placementMode = false;
          this.state.addMessage('木墙已放置');
        }
        this.renderAll();
        return;
      }

      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      this.inputManager.disable(canvas);
      this.turnManager.executeTurn();
      this.renderAll();
      if (!this.state.gameOver) {
        setTimeout(() => { if (!this.state.gameOver) { this.enableInput(); this.renderAll(); } }, 600);
      }
    });
  }

  private placementMode = false;

  private buyWoodWall(): void {
    if (this.state.board.villagePower < 5) return;
    this.state.board.villagePower -= 5;
    const level = getVillageLevel(this.state.board.villagePower);
    let power: number;
    if (level >= 2) power = 50;
    else if (level >= 1) power = 25;
    else power = 10;

    if (level >= 2) {
      // Manual placement mode
      this.placementMode = true;
      this.state.addMessage('点击一个空三角形放置木墙');
    } else {
      // Random empty sector
      const empty = this.state.board.getEmptySectors();
      if (empty.length > 0) {
        const s = empty[Math.floor(Math.random() * empty.length)];
        this.state.board.setSector(s, { id: Date.now(), type: BlockType.WOOD_WALL, value: power, power, shielded: false, attribute: null });
      }
    }
    this.renderAll();
  }

  private renderAll(): void {
    this.octagonRenderer.render(this.state.board, this.state.hero.heroSector, this.state.rotationAngle, this.state.nightStartSector, this.state.nightLength);
    this.blockRenderer.render(this.state.board, this.effectRenderer.blockAnims, this.state.rotationAngle, this.state.nightStartSector, this.state.nightLength);
    this.dragonRenderer.render(this.state.aliveDragons, this.state.rotationAngle, this.state.nightStartSector, this.state.nightLength);
    const villagePower = this.state.board.villagePower;
    const villageLevel = getVillageLevel(villagePower);
    this.hud.update(villagePower, villageLevel, this.state.turnNumber, this.state.year, 'calm' as any, this.state.messages, this.state.rotationAngle);
  }
}
