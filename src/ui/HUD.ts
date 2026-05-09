import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';
import { HeroState } from '../models/Hero';
import { GamePhase } from '../core/GameState';
import { GAME_CONSTANTS } from '../config/constants';

export class HUD {
  private container: Container;
  private powerText: Text;
  private turnText: Text;
  private yearText: Text;
  private phaseText: Text;
  private messageTexts: Text[] = [];

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'HUD';
    renderer.getLayer(5).addChild(this.container);

    const w = GAME_CONSTANTS.SCREEN_WIDTH;
    const h = GAME_CONSTANTS.SCREEN_HEIGHT;

    // Top bar
    const topBar = new Graphics();
    topBar.roundRect(10, 8, w - 20, 28, 6);
    topBar.fill({ color: 0x16213e, alpha: 0.85 });
    topBar.stroke({ width: 1, color: 0x334466 });
    this.container.addChild(topBar);

    this.yearText = new Text({
      text: '第 1 年',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 14, fill: 0xffcc44, fontWeight: 'bold' },
    });
    this.yearText.position.set(20, 14);
    this.container.addChild(this.yearText);

    this.phaseText = new Text({
      text: '平静期',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 14, fill: 0x88ff88 },
    });
    this.phaseText.position.set(110, 14);
    this.container.addChild(this.phaseText);

    this.turnText = new Text({
      text: '回合: 0',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 12, fill: 0x999999 },
    });
    this.turnText.position.set(w - 150, 15);
    this.container.addChild(this.turnText);

    // Bottom bar
    const botBar = new Graphics();
    botBar.roundRect(10, h - 100, w - 20, 90, 8);
    botBar.fill({ color: 0x16213e, alpha: 0.9 });
    botBar.stroke({ width: 1, color: 0x334466 });
    this.container.addChild(botBar);

    // Hero power display
    const heroLabel = new Text({
      text: '玩家',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 12, fill: 0x6688aa, fontWeight: 'bold' },
    });
    heroLabel.position.set(22, h - 96);
    this.container.addChild(heroLabel);

    // Power badge
    const powerBg = new Graphics();
    powerBg.roundRect(20, h - 78, 100, 30, 6);
    powerBg.fill(0x223355);
    powerBg.stroke({ width: 1.5, color: 0x4488cc });
    this.container.addChild(powerBg);

    this.powerText = new Text({
      text: '战力 10',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fill: 0xffffff, fontWeight: 'bold' },
    });
    this.powerText.position.set(28, h - 72);
    this.container.addChild(this.powerText);

    // Message log
    const logLabel = new Text({
      text: '日志',
      style: { fontFamily: 'Arial, sans-serif', fontSize: 11, fill: 0x445566, fontWeight: 'bold' },
    });
    logLabel.position.set(160, h - 96);
    this.container.addChild(logLabel);
  }

  update(hero: HeroState, turnNumber: number, year: number, phase: GamePhase, messages: string[]): void {
    const h = GAME_CONSTANTS.SCREEN_HEIGHT;

    this.powerText.text = `战力 ${hero.power}`;
    // Color power based on value
    if (hero.power >= 10) this.powerText.style.fill = 0x44ff44;
    else if (hero.power >= 5) this.powerText.style.fill = 0xffcc44;
    else this.powerText.style.fill = 0xff4444;

    this.turnText.text = `回合: ${turnNumber}`;
    this.yearText.text = `第 ${year} 年`;

    const phaseNames: Record<string, string> = {
      calm: '平静期', harassment: '骚扰期', decisive_battle: '决战期',
      year_transition: '新年', game_over: '游戏结束',
    };
    const phaseColors: Record<string, string> = {
      calm: '#88ff88', harassment: '#ffcc44', decisive_battle: '#ff4444',
      year_transition: '#88ccff', game_over: '#ff4444',
    };
    this.phaseText.text = phaseNames[phase] || phase;
    this.phaseText.style.fill = phaseColors[phase] || '#ffffff';

    // Messages
    for (const t of this.messageTexts) this.container.removeChild(t);
    this.messageTexts = [];
    const visible = messages.slice(0, 4);
    for (let i = 0; i < visible.length; i++) {
      const t = new Text({
        text: visible[i].substring(0, 35),
        style: { fontFamily: 'Arial, sans-serif', fontSize: 10, fill: 0xbbbbbb },
      });
      t.position.set(160, h - 76 + i * 14);
      this.container.addChild(t);
      this.messageTexts.push(t);
    }
  }
}
