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
    this.shopPanel.onSectionItemDropped = (section, sourceIndex, lockedIndex) => {
      if (this.isViewMode) return;
      this.shopSystem.moveSectionItemToLocked(section, sourceIndex, lockedIndex);
      this.drawShop();
      this.renderAll();
    };
    this.shopPanel.onSectionItemSelected = (section, index) => {
      if (this.isViewMode) return;
      const result = this.shopSystem.beginPlacementFromSection(section, index, this.state.board.villagePower);
      const finalResult = this.resolveImmediateShopSelection(result);
      this.state.addMessage(finalResult.message);
      this.drawShop();
      this.renderAll();
    };
    this.shopPanel.onSectionExpanded = (section) => {
      if (this.isViewMode) return;
      const result = this.shopSystem.tryExpandSection(this.state, section);
      this.state.addMessage(result.message);
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
      if (this.effectRenderer.hasActiveBoardAnimations()) this.renderAll();
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
    EventBus.on('dragonAttackStarted', (payload: { dragonId: string; sectors: number[]; actionType: string }) => {
      if (payload.actionType === 'summon_imp') return;
      this.dragonRenderer.animateAttack(payload.dragonId);
      this.effectRenderer.triggerScreenFlash(0xff7744, 8);
    });
    EventBus.on('dragonBreathShockwave', (payload: { sectors: number[]; sourceSector?: number }) => {
      const sourceSector = payload.sourceSector ?? payload.sectors[Math.floor(payload.sectors.length / 2)] ?? 0;
      this.effectRenderer.showBreathShockwave(payload.sectors, sourceSector, this.state.rotationAngle);
    });
    EventBus.on('breathSectorHit', (payload: { sector: number; damage: number; targetType: 'block' | 'village'; mode: 'damage' | 'increase' }) => {
      this.showBreathHitFeedback([payload]);
    });
    EventBus.on('breathSectorHitWave', (payload: { hits: { sector: number; damage: number; targetType: 'block' | 'village'; mode: 'damage' | 'increase' }[] }) => {
      this.showBreathHitFeedback(payload.hits);
    });
    EventBus.on('dragonDamaged', (payload: { dragonId: string; damage: number }) => {
      this.dragonRenderer.animateHit(payload.dragonId);
      const pos = this.dragonRenderer.getDragonScreenPosition(payload.dragonId);
      if (pos) this.effectRenderer.showFloatingTextAt(pos.x, pos.y - 20, `-${payload.damage}`, 0xfff0aa);
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
  }

  private showBreathHitFeedback(hits: { sector: number; damage: number; targetType: 'block' | 'village'; mode: 'damage' | 'increase' }[]): void {
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
      void this.finishConfirmedTurn();
    });
  }

  private async finishConfirmedTurn(): Promise<void> {
    const currentSession = this.sessionId;
    await this.turnManager.executeTurn();
    if (currentSession !== this.sessionId) return;
    this.drawShop();
    this.renderAll();
    if (!this.state.gameOver) {
      this.enableInput();
      this.renderAll();
    }
  }

  private renderAll(): void {
    this.octagonRenderer.render(this.state.board, this.state.hero.heroSector, this.state.rotationAngle, this.state.nightStart, this.state.nightLength, this.effectRenderer.powerAnims.get('village'));
    this.blockRenderer.render(this.state.board, this.effectRenderer.blockAnims, this.state.rotationAngle, this.effectRenderer.powerAnims);
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
        locked: this.shopSystem.state.locked.map(item => this.serializeShopItem(item)),
        resource: this.shopSystem.state.resource.map(item => this.serializeShopItem(item)),
        defense: this.shopSystem.state.defense.map(item => this.serializeShopItem(item)),
        offense: this.shopSystem.state.offense.map(item => this.serializeShopItem(item)),
        spell: this.shopSystem.state.spell.map(item => this.serializeShopItem(item)),
        totalSlots: this.shopSystem.state.totalSlots,
        maxTotalSlots: this.shopSystem.state.maxTotalSlots,
        totalExpansions: this.shopSystem.state.totalExpansions,
        nextExpansionCost: this.shopSystem.state.nextExpansionCost,
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
