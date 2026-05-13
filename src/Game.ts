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
import { HoverSectorInfo, InputManager } from './input/InputManager';
import { GameState, TurnState } from './core/GameState';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { BLOCK_TYPE_TABLE, ShopItem, blockTagLabel, getVillageLevel } from './config/blockTypes';
import { ShopSystem } from './systems/ShopSystem';
import { TooltipPanel, TooltipLine } from './ui/TooltipPanel';
import { getBlockEffectDescriptions } from './effects/BlockEffectRegistry';

declare global {
  interface Window {
    __dragonSlayerGame?: {
      getSnapshot: () => unknown;
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
  private boardTooltip!: TooltipPanel;
  private inputManager!: InputManager;
  private state!: GameState;
  private turnManager!: TurnManager;
  private shopSystem = new ShopSystem();
  private isViewMode = false;
  private sessionId = 0;

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
    this.boardTooltip = new TooltipPanel(this.renderer, 'BoardTooltip');
    this.inputManager = new InputManager();
    this.inputManager.canToggleViewMode((nextMode) => this.canToggleViewMode(nextMode));
    this.inputManager.onViewModeChanged((enabled) => this.applyViewMode(enabled));
    this.inputManager.onHoverSectorChanged((info) => this.updateBoardTooltip(info));
    this.shopPanel.onUiPointerActivity = (event) => this.inputManager.suppressCurrentGesture(event);
    this.shopPanel.onOfferDropped = (offerIndex, lockedIndex) => {
      if (this.isViewMode) return;
      this.shopSystem.moveOfferToLocked(offerIndex, lockedIndex);
      this.drawShop();
      this.renderAll();
    };
    this.shopPanel.onLockedSelected = (lockedIndex) => {
      if (this.isViewMode) return;
      const result = this.shopSystem.beginPlacementFromLockedWithPower(lockedIndex, this.state.board.villagePower);
      const finalResult = this.resolveImmediateShopSelection(result);
      this.state.addMessage(finalResult.message);
      this.drawShop();
      this.renderAll();
    };
    this.shopPanel.onOfferSelected = (offerIndex) => {
      if (this.isViewMode) return;
      const result = this.shopSystem.beginPlacementFromOffer(offerIndex, this.state.board.villagePower);
      const finalResult = this.resolveImmediateShopSelection(result);
      this.state.addMessage(finalResult.message);
      this.drawShop();
      this.renderAll();
    };
    this.setupEvents();
    window.__dragonSlayerGame = {
      getSnapshot: () => this.getSnapshot(),
    };
    this.startGame();
    const animate = () => {
      this.effectRenderer.update();
      if (this.effectRenderer.blockAnims.size > 0) this.renderAll();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private startGame(): void {
    this.sessionId++;
    this.state = new GameState();
    this.turnManager = new TurnManager(this.state);
    this.shopSystem.reset();
    this.isViewMode = false;
    this.inputManager.setViewMode(false, true);
    this.boardTooltip.hide();
    this.updateCanvasCursor();
    this.turnManager.initWorld();
    this.dragonRenderer.clear();
    this.effectRenderer.clear();
    this.gameOverScreen.hide();
    this.drawShop();
    this.renderAll();
    this.enableInput();
  }

  private setupEvents(): void {
    EventBus.on('phaseChanged', (payload: { message: string }) => {
      this.phaseAnnouncement.show(payload.message);
    });
    EventBus.on('gameOver', (payload: { reason: string }) => {
      this.state.gameOver = true;
      this.state.gameOverReason = payload.reason;
      this.inputManager.setViewMode(false, true);
      this.boardTooltip.hide();
      this.updateCanvasCursor();
      this.inputManager.disable(this.renderer.app.canvas as HTMLCanvasElement);
      this.gameOverScreen.show(this.state.turnNumber, this.state.year, payload.reason, () => this.startGame());
    });
    EventBus.on('dragonAttacked', (payload: { dragonId: string; sectors: number[]; actionType: string }) => {
      if (payload.actionType === 'summon_imp') return;
      const currentSession = this.sessionId;
      this.dragonRenderer.animateAttack(payload.dragonId);
      this.effectRenderer.triggerScreenFlash(0xff4444, 12);
      const sectors = payload.sectors;
      const waveCount = sectors.length / 2;
      for (let wave = 0; wave < waveCount; wave++) {
        setTimeout(() => {
          if (currentSession !== this.sessionId) return;
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
    });
    EventBus.on('blockDestroyed', (payload: { sector: number }) => {
      this.effectRenderer.startShrink(payload.sector);
      this.effectRenderer.showFloatingText(payload.sector, 'X', 0xff6666);
    });
  }

  private enableInput(): void {
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    this.inputManager.setRotationAngle(this.state.rotationAngle);
    this.inputManager.enable(canvas, this.renderer.octagonCenterX, this.renderer.octagonCenterY, this.renderer.octagonRadius);
    this.inputManager.onRotate((delta) => {
      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      if (this.shopSystem.selectedItem()) return;
      this.state.rotationAngle = ((this.state.rotationAngle + delta) % 360 + 360) % 360;
      this.inputManager.setRotationAngle(this.state.rotationAngle);
      this.state.turnRotationSteps += delta / 45;
      this.renderAll();
    });
    this.inputManager.onConfirm(() => {
      if (this.state.gameOver) return;
      if (this.isViewMode) return;

      if (this.shopSystem.selectedItem()) {
        if (this.inputManager.isCurrentPointerOutsideOctagon()) {
          this.shopSystem.cancelPlacement();
          this.state.addMessage('已取消购买');
          this.drawShop();
          this.renderAll();
          return;
        }
        const sector = this.inputManager.getCurrentSector();
        const result = this.shopSystem.tryPlaceSelectedItem(this.state, sector);
        this.state.addMessage(result.message);
        this.drawShop();
        this.renderAll();
        return;
      }

      if (this.state.turnState !== TurnState.WAITING_FOR_INPUT) return;
      this.inputManager.disable(canvas);
      this.turnManager.executeTurn();
      this.drawShop();
      this.renderAll();
      if (!this.state.gameOver) {
        const currentSession = this.sessionId;
        setTimeout(() => { if (!this.state.gameOver && currentSession === this.sessionId) { this.enableInput(); this.renderAll(); } }, 600);
      }
    });
  }

  private renderAll(): void {
    this.octagonRenderer.render(this.state.board, this.state.hero.heroSector, this.state.rotationAngle, this.state.nightStart, this.state.nightLength);
    this.blockRenderer.render(this.state.board, this.effectRenderer.blockAnims, this.state.rotationAngle);
    this.dragonRenderer.render(this.state.aliveDragons, this.state.rotationAngle, this.state.nightStart, this.state.nightLength);
    const villagePower = this.state.board.villagePower;
    const villageLevel = getVillageLevel(villagePower);
    this.hud.update(villagePower, villageLevel, this.state.turnNumber, this.state.year, 'calm' as any, this.state.messages, this.state.rotationAngle);
  }

  private drawShop(): void {
    this.shopPanel.draw(this.shopSystem.state, this.shopSystem.selectedItem(), this.isViewMode);
  }

  private canToggleViewMode(nextMode: boolean): boolean {
    if (!nextMode) return true;
    return !this.shopSystem.selectedItem() && !this.shopPanel.isDragging();
  }

  private applyViewMode(enabled: boolean): void {
    this.isViewMode = enabled;
    this.updateCanvasCursor();
    this.drawShop();
    if (!enabled) this.boardTooltip.hide();
  }

  private updateCanvasCursor(): void {
    if (!this.renderer.app) return;
    const canvas = this.renderer.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = this.isViewMode ? 'zoom-in' : '';
  }

  private updateBoardTooltip(info: HoverSectorInfo): void {
    this.updateCanvasCursor();
    if (!this.isViewMode || info.outsideOctagon || info.sector === null) {
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
        { text: `扇区: ${sector + 1}` },
      ];
    }

    const def = BLOCK_TYPE_TABLE[block.type];
    const level = block.level ?? 1;
    const lines: TooltipLine[] = [
      { text: `${def.label} Lv.${level}` },
      { text: `当前战力: ${block.combatPower}`, color: 0xb7f7a2, bold: true },
      { text: `扇区: ${sector + 1}` },
    ];
    if (block.tags.length > 0) {
      lines.push({ text: `标签: ${block.tags.map(blockTagLabel).join('、')}` });
    }
    for (const description of getBlockEffectDescriptions(block.type, level)) {
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
      ? { id: item.id, kind: item.kind, type: item.blockType, label: item.label, cost: item.cost, combatPower: item.combatPower, tags: item.tags }
      : { id: item.id, kind: item.kind, spellType: item.spellType, label: item.label, cost: item.cost, tags: item.tags };
  }

  private getSnapshot(): unknown {
    return {
      turnNumber: this.state.turnNumber,
      villagePower: this.state.board.villagePower,
      board: this.state.board.sectors.map(block => block ? { type: block.type, combatPower: block.combatPower, level: block.level ?? 1, tags: block.tags } : null),
      dragons: this.state.aliveDragons.map(dragon => ({
        id: dragon.id,
        templateId: dragon.templateId,
        name: dragon.name,
        personality: dragon.personality,
        combatPower: dragon.combatPower,
        maxCombatPower: dragon.maxCombatPower,
        attackMultiplier: dragon.attackMultiplier,
        hasTakenDamage: dragon.hasTakenDamage,
        screen: this.dragonRenderer.getDragonScreenPosition(dragon.id),
      })),
      shop: {
        lockedSlots: this.shopSystem.state.lockedSlots.map(item => this.serializeShopItem(item)),
        offerSlots: this.shopSystem.state.offerSlots.map(item => this.serializeShopItem(item)),
        selectedItem: this.shopSystem.selectedItem() ? {
          area: this.shopSystem.selectedItem()!.area,
          index: this.shopSystem.selectedItem()!.index,
          item: this.serializeShopItem(this.shopSystem.selectedItem()!.item),
        } : null,
      },
      screen: {
        w: this.renderer.screenW,
        h: this.renderer.screenH,
        octagonCenterX: this.renderer.octagonCenterX,
        octagonCenterY: this.renderer.octagonCenterY,
        octagonRadius: this.renderer.octagonRadius,
      },
      gameOver: this.state.gameOver,
      viewMode: this.isViewMode,
      rotationAngle: this.state.rotationAngle,
      turnRotationSteps: this.state.turnRotationSteps,
      dragonTooltipVisible: this.dragonRenderer.isTooltipVisible(),
      shopTooltipVisible: this.shopPanel.isTooltipVisible(),
      shopTooltipLines: this.shopPanel.getTooltipLines(),
      shopTooltipLayout: this.shopPanel.getTooltipLayout(),
      boardTooltipVisible: this.boardTooltip.isVisible(),
    };
  }
}
