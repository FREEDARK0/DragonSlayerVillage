import { Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';
import { GAME_CONSTANTS } from '../config/constants';

export class GameOverScreen {
  private container: Container;
  private restartCallback: ((event?: { pointerId?: number; type?: string }) => void) | null = null;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'GameOverScreen';
    this.container.visible = false;
    renderer.getLayer(6).addChild(this.container);

    const w = this.renderer.screenW;
    const h = this.renderer.screenH;

    // Overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, w, h);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    this.container.addChild(overlay);

    // Panel
    const panel = new Graphics();
    panel.roundRect(w / 2 - 160, h / 2 - 100, 320, 200, 12);
    panel.fill({ color: 0x1a1a3e, alpha: 0.95 });
    panel.stroke({ width: 2, color: 0x4466aa });
    this.container.addChild(panel);
  }

  show(turnNumber: number, year: number, reason: string, onRestart: (event?: { pointerId?: number; type?: string }) => void): void {
    this.restartCallback = onRestart;
    this.container.removeChildren();
    this.container.visible = true;

    const w = this.renderer.screenW;
    const h = this.renderer.screenH;

    // Overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, w, h);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    this.container.addChild(overlay);

    // Panel
    const px = w / 2;
    const py = h / 2;
    const panel = new Graphics();
    panel.roundRect(px - 160, py - 110, 320, 220, 12);
    panel.fill({ color: 0x1a1a3e, alpha: 0.95 });
    panel.stroke({ width: 2, color: 0x4466aa });
    this.container.addChild(panel);

    // Title
    const title = new Text({
      text: '游戏结束',
      style: { fontFamily: 'monospace', fontSize: 28, fill: 0xff4444, fontWeight: 'bold' },
    });
    title.anchor.set(0.5);
    title.position.set(px, py - 70);
    this.container.addChild(title);

    // Stats
    const reasonText = reason === 'hero_died' ? '英雄阵亡...' : reason;
    const statsText = new Text({
      text: `${reasonText}\n\n存活回合: ${turnNumber}\n年份: 第 ${year} 年`,
      style: { fontFamily: 'monospace', fontSize: 14, fill: 0xcccccc, align: 'center', lineHeight: 22 },
    });
    statsText.anchor.set(0.5);
    statsText.position.set(px, py - 25);
    this.container.addChild(statsText);

    // Restart button
    const btnBg = new Graphics();
    btnBg.roundRect(px - 60, py + 55, 120, 36, 8);
    btnBg.fill(0x3366aa);
    btnBg.eventMode = 'static';
    btnBg.cursor = 'pointer';
    btnBg.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      this.restartCallback?.({ pointerId: event.pointerId, type: event.type });
    });
    this.container.addChild(btnBg);

    const btnText = new Text({
      text: '重新开始',
      style: { fontFamily: 'monospace', fontSize: 16, fill: 0xffffff, fontWeight: 'bold' },
    });
    btnText.anchor.set(0.5);
    btnText.position.set(px, py + 73);
    this.container.addChild(btnText);
  }

  hide(): void {
    this.container.visible = false;
    this.container.removeChildren();
  }
}
